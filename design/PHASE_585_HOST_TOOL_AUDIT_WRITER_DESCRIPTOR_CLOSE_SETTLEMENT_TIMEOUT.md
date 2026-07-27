# Phase585：Host tool audit writer descriptor close settlement timeout

## 背景

Phase580-584已分别为rotation recovery、lock maintenance、inspection、successful lock lifecycle和pre-transfer lock acquisition建立5000ms descriptor close settlement deadline。常规JSONL writer仍保留最后一组无deadline的owned close路径：

- parent bootstrap逐层创建目录时关闭previous/current directory handles；
- lock acquisition成功后，generation mutation parent opener失败或record结束时关闭parent handle；
- rotation preparation关闭current generation与backup staging directory handles；
- append成功、失败或rollback后关闭current append handle；
- committed/rolled-back rotation transaction关闭retained current与backup handles；
- writer backup staging child scan关闭`Dir` stream；
- backup staging初始化失败后关闭已取得的directory handle。

这些close Promise如果永久pending，会使普通`record()`在append前、append后、rotation commit后或primary failure后永久不settle。文件系统写入可能已经commit，但caller、writer serialization tail与cooperative lock release都无法继续；late rejection还可能覆盖原始write/validation failure。

Phase585以八条red probe冻结bootstrap、generation parent、append handle、rotation transaction、writer staging stream和failed-open generation parent行为。所有probe均先执行真实native close，再返回受控pending Promise；虚拟时间推进60秒后当前实现仍未settle，证明writer ownership graph需要独立operation-family policy。

## Writer Settlement Contract

新增module-private deadline：

```text
JSONL_AUDIT_WRITER_CLOSE_SETTLEMENT_TIMEOUT_MS = 5000
```

固定timeout message：

```text
audit writer descriptor close timed out after 5000 ms
```

Writer-owned resources遵守：

1. 同一finalization set按object identity去重；
2. set内unique resources并发调用close且每个resource恰好一次；
3. sync throw、async rejection与正常resolve保持原settlement；
4. 5000ms event-loop timer前未settle时返回fixed safe timeout；
5. timeout不重试、不cancel，也不推断kernel descriptor是否已经关闭；
6. late resolve/reject由shared owned observer消费，不产生unhandled rejection、二次结果投影或额外filesystem mutation；
7. writer primary先于secondary close reject/timeout；无primary时close failure成为operation failure；
8. timeout只约束当前close finalization point，不是整个record transaction的hard wall-clock budget。

## Covered Ownership Graph

### Parent bootstrap

Bootstrap initial/child mutation directory opener显式标记writer ownership。每次previous handle关闭与最终current handle关闭均使用writer guard：

- close timeout发生在下一层目录创建前时，停止继续bootstrap；
- 已创建目录保持，不回滚、不删除；
- create/open/validation primary优先于最终close failure；
- previous close已经成为primary时，current close timeout不得替换它。

### Generation parent

`openAuditGenerationParentDirectory`启用writer policy：

- failed-open validation取得的handle bounded close后仍抛原validation primary；
- returned parent在append/rotation flow结束时bounded close；
- append或rotation primary优先；
- append已经commit但parent close timeout时，record拒绝timeout，已提交JSONL行保持。

### Rotation preparation与transaction

Rotation preparation未transfer的current/backup handles使用writer closer。成功transfer给`JsonlAuditRotationTransaction`后，只由transaction finalizer关闭：

- finalization set按identity去重并发关闭；
- pre-transfer rotation primary优先于close failure；
- rotation/append已commit后close timeout不rollback committed current或archive；
- append primary存在时，transaction close timeout不得覆盖它。

### Append handle

Append opener取得handle后，所有validation、write、durability、commit与cleanup路径最终进入writer primary-preserving close：

- write前失败保持无新增record的既有语义；
- write/rollback primary保持；
- successful write后close timeout返回writer timeout，但已提交record保持；
- late close rejection不得触发重复truncate、unlink、rotation commit或parent sync。

### Backup staging directory与stream

Writer创建的backup staging directory携带writer-only marker。其child scan `Dir` stream和初始化失败directory handle使用writer guard：

- scan read primary优先；
- scan成功但stream close timeout时，不继续基于scan结果执行stage/remove mutation；
- 已完成的staging creation或cleanup保持，不依据late settlement追加mutation；
- inspection/recovery构造的无marker directory仍使用既有Phase580/582 policy，不被writer policy接管。

## Ownership Transfer与Primary Ordering

Writer marker只描述常规record flow中的mutation directory，不导出到public API。Ownership transfer顺序为：

```text
bootstrap opener -> bootstrap finalizer
generation parent opener -> record finalizer
rotation preparation handles -> rotation transaction finalizer
append opener -> append finalizer
writer staging opener -> transaction or initialization finalizer
```

统一排序规则：

```text
existing writer/validation/write/rotation primary
  > writer close rejection or timeout
  > successful completion
```

如果没有既有primary，close rejection保持原reason，close pending超过deadline形成fixed writer timeout。Commit状态只由既有write/rotation state machine决定；close settlement不修改`recordWriteCompleted`、`finalized`、generation identity或durability结果。

## 测试与接口矩阵

- Runtime覆盖nested bootstrap、committed generation parent、generation parent primary、committed append handle、append primary、committed rotation transaction、writer staging stream和failed-open generation parent。
- Late rejection检查`unhandledRejection`为空，并验证current、archive、staging与lock namespace保持契约状态。
- Existing writer、rotation rollback、durability、multi-sink serialization、lock lifecycle、recovery、maintenance与inspection tests全部回归。
- Compiled smoke从`dist/`验证普通writer close timeout、committed line保持、late rejection消费与cooperative lock清理。
- 静态接口校验确认writer constant/helper各唯一，writer covered区域不再使用raw close；public sink constructor、CLI、protocol、environment和persistent schema不变化。

## 接口与安全边界

- 不新增CLI flags、commands、exit code、human/JSON fields、environment variables或public runtime options。
- 不修改JSON-RPC、agent events、provider/tool contracts、transcript、audit envelope、lock owner metadata或rotation staging schema。
- Timeout message不包含path、fd、raw resource、raw error object、record payload、owner token或late reason。
- Writer timeout不证明close syscall、flush、unlink、rename或kernel descriptor状态。
- 不跨operation family复用writer marker；successful lock lifecycle、acquisition、maintenance、inspection与recovery继续使用各自policy。

## 验收标准

- 任一writer-owned close Promise永久pending时，当前finalization point在5000ms event-loop deadline后settle。
- Same-set unique resources并发且exactly-once close。
- Existing writer/validation/write/rotation primary保持；无primary时固定writer timeout可见。
- Commit前后filesystem状态符合既有transaction语义，timeout与late settlement不触发额外mutation。
- Writer staging scan close timeout停止依赖scan结果的后续mutation。
- Late resolve/reject无unhandled rejection、二次projection或serialization tail poisoning。
- Public TypeScript、CLI、protocol、environment和persistent interfaces保持。
- Python、TypeScript、build、built integration和CLI smoke全部通过。
- Workspace与`/tmp`无probe、smoke、integration、audit lock、staging或patch残留，无相关test/engine/CLI进程和FileHandle/Dir GC warning。

## 实现结果

- 八条red baseline已冻结并逐项验证：nested bootstrap、committed generation parent、generation parent primary、committed append handle、append primary、committed rotation transaction、writer staging stream和failed-open generation parent在真实native close后返回受控pending Promise；虚拟时间推进60秒时旧实现均未settle。
- `jsonlAuditSink.ts`新增module-private writer 5000ms constant、identity-deduplicated concurrent closer、primary-preserving closer与writer marker。Bootstrap/generation parent、rotation preparation/transaction、append、backup initialization、writer staging scan和failed-open generation parent全部接入bounded settlement；raw file-handle all-settled closer及其wrapper已删除。
- Primary ordering与commit continuity已验证：write/validation/rotation primary保持；无primary时固定writer timeout可见；成功append或rotation commit后的timeout不回滚current/archive，late rejection不触发额外truncate、unlink、rename、sync或lock mutation。
- Runtime新增8项测试，`test/audit.test.ts`共293项通过；既有`test/cliAudit.test.ts` 114项保持通过，未新增CLI field或projection contract。
- Compiled smoke从`dist/`直接执行`JsonlAuditSink.record()`，使用process-local timer acceleration验证5000ms writer policy、已提交首行、missing coordination lock、late rejection消费和同一sink后续第二次record成功；完整CLI smoke通过。
- 全量`tools/check.sh`通过：Python 422项；TypeScript 43个test files、921项；TypeScript build、built integration与CLI smoke全部成功。
- 静态接口校验通过：source/dist各仅有一个writer timeout constant、一个writer closer、一个primary-preserving closer和一个writer close wrapper；writer covered路径均经bounded closer，剩余raw close只属于未标记的其他operation-family fallback。Writer marker与constant均未export，public sink constructor、CLI/protocol/environment、audit envelope及persistent schema未变化。
- 主README、项目计划、内部设计、架构、扩展点、安全与protocol文档已同步到Phase585，并在Phase584文档记录writer后续衔接。
- 残留审计完成：workspace无`.tmp`、`.bak`、`.orig`或`.rej`；11个本轮测试遗留audit fixture的owner PID 592369、608779与610025均已退出，随后按exact path执行`unlink`与`rmdir`。最终`/tmp`无Phase585、writer timeout、smoke、integration、audit lock或staging残留，也无check、Vitest、pytest、engine或CLI进程。

## Phase586 后续衔接

Phase586已为writer commit之后进入的cooperative lock release child scans补齐Phase583 lifecycle settlement guard。Phase585 writer-owned parent/file/staging resources仍只由writer policy关闭；release stream timeout沿lock lifecycle error返回，writer fallback再`abandon()`handles并保留runtime-confirmed owner或empty lock residual，不会回滚已提交audit record或把stream纳入writer closer。

## Phase587 后续衔接

Phase587已为mutating rotation recovery candidate复用同类staging scanner时补齐Phase582 recovery settlement guard。Writer-created staging directory仍只携带writer marker，recovery重新open并验证同一路径后才获得recovery marker；两个operation family共享scanner实现但不共享timeout ownership。Recovery pre-commit timeout可触发existing rollback，post-commit timeout只保留empty staging residual，不改变Phase585 writer commit continuity。
