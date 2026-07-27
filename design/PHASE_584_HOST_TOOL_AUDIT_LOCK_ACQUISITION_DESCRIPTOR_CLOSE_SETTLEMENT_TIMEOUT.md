# Phase584：Host tool audit lock acquisition descriptor close settlement timeout

## 背景

Phase583为successful cooperative lock lifecycle增加5000ms close settlement deadline，但lock ownership正式transfer给returned `JsonlAuditFileLock`之前，acquisition attempt仍存在多条direct-close路径：

- mutation parent handle在reservation `EEXIST`、validation failure或其他attempt failure后关闭；
- parent、lock directory或exclusive owner opener取得descriptor但未return时关闭；
- owner metadata写入或后续acquisition assertion失败后，cleanup关闭owner与lock directory handles；
- failed-acquisition cleanup使用的bounded child-scan `Dir` stream关闭；
- cleanup重新检查owner时取得的invalid、mismatched或transient owner handle关闭。

这些路径仍直接`await resource.close()`或复用无deadline的raw all-settled closer。任一returned close Promise永久pending时：

- contention retry无法进入下一attempt或形成既有lock timeout；
- acquisition validation/write primary无法返回；
- best-effort namespace cleanup无法结束，parent finalization也不会启动；
- writer和rotation recovery caller可能永久等待lock acquisition；
- late rejection只有测试主动触发后才沿secondary close path返回，并可能覆盖outer primary。

Phase584四条red probe分别覆盖pre-transfer parent、failed-open parent、failed metadata-write owner/lock finalizer和cleanup directory stream。虚拟时间推进60秒后四个operation都未settle，只有主动结束pending close后才返回。这证明pre-transfer acquisition ownership需要独立operation-family deadline与primary-preserving semantics。

## Acquisition Settlement Contract

新增module-private deadline：

```text
JSONL_AUDIT_LOCK_ACQUISITION_CLOSE_SETTLEMENT_TIMEOUT_MS = 5000
```

固定timeout message：

```text
audit lock acquisition descriptor close timed out after 5000 ms
```

Acquisition-owned resources遵守：

1. 同一finalization set按object identity去重；
2. set内全部close invocation与timer并发启动；
3. 每个resource只调用close一次；
4. sync throw、async rejection与resolve保持原settlement；
5. 5000ms event-loop timer前未settle时形成fixed safe timeout failure；
6. timeout不重试、不cancel，也不推断kernel descriptor状态；
7. late resolve/reject由owned observer消费，不产生unhandled rejection或回写operation；
8. successful lock transfer后的owner、lock directory与parent handles不再属于本policy，而由Phase583 lifecycle finalizer接管。

Deadline是per-close finalization point，不是整个acquisition attempt的hard real-time budget。同步阻塞event loop时只能在重新获得调度后触发；不同阶段先后取得的资源可能依次经历各自deadline，但任一单独pending Promise都不能无限阻塞。

## Covered Ownership Graph

### Failed-open helpers

Acquisition调用以下opener时显式启用acquisition settlement policy：

- `openJsonlAuditLockMutationParentDirectory(...)`；
- `openJsonlAuditLockPinnedDirectory(...)`；
- `createJsonlAuditLockOwnerFile(...)`；
- `inspectJsonlAuditLockPinnedOwnerMetadata(...)`的cleanup-only transient handle。

Helper validation primary或`undefined` result必须在bounded close后保持。Secondary close reject/timeout不得覆盖path/object validation error，也不得把invalid helper result变成公开timeout contract。

### Returned pre-transfer parent

Parent handle已经return但reservation未成功transfer时，outer `finally`使用acquisition closer：

- `EEXIST`仍进入既有wait/retry/timeout状态机；
- non-`EEXIST` primary保持；
- close reject/timeout只结束descriptor ownership attempt，不替换primary；
- timeout后不得重复reservation、rename、unlink或rmdir，只允许既有loop决定是否进入下一attempt。

### Failed-acquisition cleanup

Owner metadata write、identity assertion或entry assertion失败后：

- lock directory与可用owner handle按identity去重并发close；
- cleanup owner inspection取得的mismatched/transient handle也使用acquisition deadline；
- close failure/timeout不覆盖outer acquisition primary；
- 已完成的owner unlink、lock rmdir或verified residual state不rollback、不重建；
- cleanup mutation uncertainty继续由既有best-effort行为处理，不新增public residue field。

### Cleanup directory stream

Failed-acquisition cleanup中的lock child scan启用acquisition-specific stream closer：

- read primary优先于secondary close failure；
- scan成功但close reject/timeout时，scan抛出close failure并停止后续best-effort namespace mutation；
- outer cleanup捕获该secondary failure，继续finalize已取得owner/lock handles，最终仍抛原acquisition primary；
- stream late settlement不改变是否已执行unlink/rmdir。

## Primary Ordering

Phase584不新增typed public error或diagnostic field。大部分acquisition close uncertainty是已有attempt outcome之后的secondary failure：

- validation/write/assertion primary保持exact message/cause；
- `EEXIST`保持control-flow identity并继续既有retry timeout；
- failed cleanup close failure不替换outer primary；
- helper内部没有可见primary时，invalid/changed result仍由既有caller转换为`Audit file lock changed during acquisition.`；
- acquisition entry scan已经成功读取exact entries但stream close timeout时，不能transfer successful lock；fixed acquisition timeout message成为该attempt primary，并沿既有runtime/CLI error path投影；
- late reason不得进入writer warning、recovery result、CLI human/JSON或persistent state。

固定acquisition timeout message不是新field或可配置contract；它只可能作为既有runtime rejection或CLI recovery ERROR message出现。

## Excluded Graph

本阶段不修改：

- successful returned lock lifecycle handles（Phase583）；
- writer generation parent、current file、rotation transaction、backup directory与durability handles；
- mutating rotation recovery candidate handles（Phase582）；
- maintenance、inspection、quarantine/disposal recovery finalizers（Phase576-581）；
- JSONL target file open/create helper自身的writer-owned close paths；
- public `JsonlAuditFileLock`、`JsonlAuditLockOptions`、CLI flags、environment variables或cross-layer schema。

这些writer-owned direct-close families继续作为后续独立审计边界。

## Tests

- Contended acquisition parent close pending：一个deadline后继续loop并形成原`Timed out waiting for audit file lock.`，held lock保持。
- Metadata write primary加owner cleanup close pending：primary保持，owner/lock cleanup提交状态保持，owner与lock handles各close一次。
- Failed-open parent validation加close pending：一个deadline后返回原validation error，无lock namespace mutation。
- Failed-acquisition child-scan stream close pending：primary保持，cleanup停止后续mutation，owner/lock残留状态与late rejection均可验证。
- Successful acquisition child scan加close pending：拒绝transfer，fixed timeout沿既有error path返回，best-effort cleanup删除owned reservation。
- Existing timing option、cross-process wait、metadata failure cleanup、owner replacement、successful lifecycle与recovery serialization tests保持。
- CLI human/JSON验证lock-acquisition stage、not-started mutation、coordination lock未取得及无late reason。
- Compiled smoke从`dist/`验证fixed 5000ms policy、lock-acquisition ERROR、late rejection consumption与current/staging continuity。

## 接口与安全边界

- Timeout只表示returned close Promise未按期settle，不证明descriptor仍open或已经closed。
- Close timeout不得改变owner token、写入owner metadata、创建额外reservation或重复cleanup mutation。
- Cleanup stream timeout必须停止依赖exact scan结果的后续mutation。
- EEXIST retry不得因secondary close reason泄漏raw error或跳过既有timeout policy。
- 不新增CLI flags、commands、exit code、human/JSON field names、environment variables或public runtime option。
- 不修改JSON-RPC、agent event、provider、tool result、transcript、owner metadata或persistent schema。
- 不输出fd、raw resource、raw error object、owner token、pending Promise或late reason。

## 验收标准

- 任一acquisition-owned close Promise永久pending时，当前finalization point必须在5000ms event-loop timer deadline后settle。
- 同一set中的unique resources必须并发各调用close一次。
- Acquisition validation/write/assertion primary和EEXIST retry identity必须保持。
- Successful handle transfer必须继续完全交给Phase583，不得提前close或双重finalize。
- Cleanup stream close timeout不得继续基于其entries执行unlink/rmdir。
- Late resolve/reject不得产生unhandled rejection、二次projection或filesystem mutation。
- Public lock/CLI/protocol contracts与其他operation-family deadline保持。
- Python、TypeScript、build、built integration和CLI smoke全部通过。
- Workspace及`/tmp`无probe、smoke、integration、audit lock或patch残留，无相关test/engine/CLI进程和FileHandle/Dir GC warning。

## 实现结果

- 四条red baseline已冻结：contended pre-transfer parent、failed metadata-write cleanup owner、failed-open parent validation和failed-cleanup stream均在close调用真实native close后返回受控pending Promise；虚拟时间推进60秒仍未settle，只有测试主动结束pending Promise后才返回。
- `jsonlAuditSink.ts`新增module-private acquisition 5000ms constant、identity-deduplicated concurrent closer、primary-preserving closer和operation-family wrapper，并复用Phase580-583 shared owned-observer race。Failed-open mutation parent/lock directory/exclusive owner、cleanup owner inspection、pre-transfer parent和failed-cleanup owner/lock set全部接入bounded settlement。
- Acquisition使用只在transfer前存在的`acquisitionLockDirectory` view标记child-scan `Dir` policy；successful validation后returned lock继续使用未标记的original lock directory，并仅由Phase583 lifecycle finalizer关闭，因此不存在提前close或双重finalize。
- Runtime新增5项测试，覆盖`EEXIST` retry parent timeout、metadata primary加cleanup handle timeout、failed-open validation timeout、cleanup stream timeout保持primary，以及successful scan timeout拒绝transfer。Late rejection均被消费，namespace committed/residual状态保持；`test/audit.test.ts`共285项通过。
- CLI新增1项测试，覆盖rotation recovery acquisition scan timeout的existing ERROR projection：`failure_stage: lock_acquisition`、`mutation_state: not_started`、coordination lock未取得、current/staging保持且不输出late reason；`test/cliAudit.test.ts`共114项通过。
- Compiled smoke从`dist/`执行真实CLI recovery，使用process-local timer acceleration验证5000ms policy、lock-acquisition ERROR、late rejection consumption、missing coordination lock和current/staging continuity；完整CLI smoke通过。
- 全量`tools/check.sh`通过：Python 422项；TypeScript 43个test files、913项；TypeScript build、built integration与CLI smoke全部成功。
- 静态接口校验通过：source/dist各仅有一个acquisition、lifecycle、recovery、maintenance与inspection timeout constant、一个generic race helper、一个acquisition closer、一个primary-preserving closer和一个acquisition wrapper；covered acquisition区域无raw close/raw shared closer。Public `JsonlAuditFileLock`/`JsonlAuditLockOptions`、CLI/protocol timeout option、field与environment variable未变化。
- 主README、项目计划、内部设计、架构、扩展点、安全与protocol文档已同步到Phase584，并在Phase583文档记录pre-transfer acquisition后续衔接。
- 残留审计完成：workspace无`.tmp`、`.bak`、`.orig`或`.rej`；核对12个测试遗留audit lock/quarantine fixture的owner PID均已退出后，以`unlink`/`rmdir`清理。最终`/tmp`无Phase584、acquisition timeout、smoke、integration或audit lock残留，也无check、Vitest、pytest、engine或CLI进程。

## Phase585 后续衔接

Phase585已为常规JSONL writer持有的bootstrap/generation parent、append/current generation、rotation transaction、backup staging directory与writer staging stream增加独立5000ms settlement guard。Phase584的ownership-transfer前acquisition resources仍只由acquisition policy接管，successful lock仍转交Phase583 lifecycle policy；writer marker不会跨入lock、recovery、maintenance或inspection graph，也不会提前close或双重finalize其他operation-family resource。
