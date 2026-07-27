# Phase582：Host tool audit rotation recovery candidate descriptor close settlement timeout

## 背景

Phase560已经保证mutating rotation recovery candidate handles的`close()`同步throw会被async normalization吸收，全部candidate handles仍进入`Promise.allSettled(...)`；Phase561-562继续约束warning格式和post-failure namespace observation。Phase580和Phase581随后分别为maintenance与read-only inspection close Promise增加5000ms settlement deadline。

Rotation recovery candidate finalizer仍保留Phase560的无界等待：

```text
closeJsonlAuditRotationRecoveryHandles(...)
  -> Promise.allSettled(invokeJsonlAuditFileHandleClose(...))
  -> await handle.close() without deadline
```

只要generation、staging directory或parent directory任一returned close Promise永久pending：

- 已完成的archive restore或empty staging cleanup无法返回result；
- mutation primary failure无法投影typed recovery error；
- candidate-open validation failure无法返回既有stage/state evidence；
- coordination lock finalization永远不会开始；
- CLI command、JSON report和process exit均不settle。

Phase582 red probe在`restore_previous_archive`已提交后，让candidate staging handle调用真实close再返回受控pending Promise。虚拟时间推进60秒后runtime recovery仍未settle，测试只有主动reject该Promise后才收到已提交result。这证明Phase560的invocation normalization还需要operation-family settlement deadline。

## Candidate Settlement Contract

新增module-private candidate recovery deadline：

```text
JSONL_AUDIT_ROTATION_RECOVERY_CLOSE_SETTLEMENT_TIMEOUT_MS = 5000
```

每个candidate recovery resource遵守：

1. 每个object identity只调用一次`close()`；
2. 同一finalization set中的全部resources并发启动close与timer；
3. sync throw、async rejection和resolve保持Phase560语义；
4. 5000ms event-loop timer前未settle时形成固定safe failure；
5. timeout不重试、不cancel，也不推断kernel descriptor状态；
6. late resolve/reject由owned observer消费，不产生unhandled rejection或结果回写；
7. 总等待为一个并发deadline，不按handle数量串行累加。

Timer与Phase580-581相同，不是hard real-time guarantee；event loop同步阻塞期间只能在重新获得调度后触发。

## Shared Internal Design

Phase582复用Phase580抽取、Phase581验证的module-private generic settlement race：

```text
resource.close()
  -> owned fulfilled/rejected observer
  -> race(operation-family timeout settlement)
```

新增rotation recovery wrapper，传入Phase582 constant与固定message：

```text
recovery descriptor close timed out after 5000 ms
```

`closeJsonlAuditRotationRecoveryHandles(...)`按resource object identity去重，再通过该wrapper执行`Promise.allSettled(...)`。既有warning前缀保持：

```text
recovery descriptor close failed: <safe reason>
```

因此timeout完整warning固定为：

```text
recovery descriptor close failed: recovery descriptor close timed out after 5000 ms
```

`invokeJsonlAuditFileHandleClose(...)`继续服务writer、cooperative lock lifecycle和其他direct-close caller，不在本阶段被全局改成timeout语义。

## Result与Primary Preservation

Candidate finalization继续发生在mutation outcome已经冻结之后：

- committed operation加close timeout：返回原`performedAction`、`recovered`、mutation、durability、staging/residual evidence；只把`recoveryHandlesClosed`设为`false`并附加固定warning；
- mutation primary failure加close timeout：保留原message、`failureStage`、`mutationState`、rollback与recovery fingerprint evidence；timeout只加入handle finalization fields；
- candidate-open primary failure加failed-open handle timeout：保留`candidate_open/not_started`与原cause；其他returned/handed-off handles仍各close一次；
- stable close仍返回`recoveryHandlesClosed: true`，不产生warning。

Candidate timeout结束后才进入既有coordination lock finalization。Phase582不把candidate descriptor uncertainty解释为coordination lock failure，也不改变post-failure namespace observation顺序。

## Runtime与CLI Projection

Phase582不新增public字段。继续复用：

```text
recoveryHandlesClosed / recovery_handles_closed
recoveryHandleWarning / recovery_handle_warning
performedAction / performed_action
failureStage / failure_stage
mutationState / mutation_state
```

- Committed recovery timeout：runtime resolve；CLI保持`ok: true`、WARN和performed evidence。
- Primary recovery failure timeout：runtime reject既有typed error；CLI保持ERROR和primary message/stage/state，同时投影handle warning。
- Timeout message不进入fingerprint、confirmation、owner metadata、transcript或persistent state。

Human与JSON renderer不得输出raw handle、fd、pending Promise、late rejection object或owner token。

## Covered Graph

- Successful `restore_previous_archive` candidate finalization。
- Successful `cleanup_empty_staging` candidate finalization。
- Mutation failure/rollback后的candidate finalization。
- Candidate-open failure returned handles与Phase559 failed-open handoff handles。
- Optional generation handle、staging directory handle与parent directory handle的concurrent settlement。
- Reuse上述runtime API的rotation recovery CLI command。

本阶段不修改：

- coordination lock `release()`/`abandon()` lifecycle descriptor settlement；
- cooperative lock acquisition与failed-acquisition cleanup；
- normal writer、rotation transaction、append rollback和durability handles；
- maintenance与inspection wrappers/constants；
- quarantine/disposal maintenance recovery；
- mutation、rollback、namespace observation或durability ordering。

这些direct-close families继续作为后续独立审计边界，避免一个generic timeout悄然改变不同operation的error ownership。

## Tests

- Committed archive restore叠加candidate pending close：deadline后result返回，performed/mutation evidence保持，handles false，其他handles已close。
- Pending close在timeout后late reject：无unhandled rejection、二次projection或filesystem mutation。
- Mutation primary failure叠加pending close：primary message、stage、rollback state保持并附加timeout warning。
- Candidate-open validation primary叠加failed-open pending close：`candidate_open/not_started`保持，其他handles仍close一次。
- Stable/sync-throw/async-reject现有Phase560-562 tests保持。
- CLI human/JSON覆盖committed WARN与primary ERROR，不泄漏owner token或raw late reason。
- Compiled smoke从`dist/`验证deadline、late rejection consumption、coordination lock继续finalize及committed namespace state。

## 接口与安全边界

- Timeout只表示returned close Promise未按期settle，不证明descriptor仍open或已经closed。
- Candidate mutation结果不得因secondary timeout被降级为`not_started`或丢失performed evidence。
- Timeout后不得重做rename、unlink、rmdir、rollback、durability sync或owner mutation。
- 不新增CLI flags、commands、exit code、human/JSON field names、environment variables或public runtime option。
- 不修改JSON-RPC、agent event、provider、tool result、transcript、owner metadata或persistent schema。
- 不输出fd、raw resource、raw error object、owner token或unbounded error text。

## 验收标准

- 任一rotation recovery candidate close Promise永久pending时，runtime/CLI必须在一个5000ms timer deadline后settle。
- 同一candidate finalization set中的全部unique handles必须各调用close一次并发等待。
- Committed result和primary recovery error都不得被close timeout覆盖。
- Late resolve/reject不得产生unhandled rejection、二次projection或filesystem mutation。
- Coordination lock finalization必须在candidate deadline后继续执行并形成既有evidence。
- Maintenance、inspection、lock lifecycle、acquisition、writer与跨层contracts保持。
- Python、TypeScript、build、built integration和CLI smoke全部通过。
- Workspace及`/tmp`无probe、smoke、integration、audit lock或patch残留，无相关test/engine/CLI进程和FileHandle/Dir GC warning。

## 实现结果

- Red baseline已冻结：`restore_previous_archive`完成namespace commit后，candidate staging handle调用真实close再返回受控pending Promise；虚拟时间推进60秒时原finalizer仍未settle，只有测试主动reject后才返回committed result。
- `jsonlAuditSink.ts`新增module-private recovery candidate 5000ms constant与wrapper，并复用Phase580-581 shared owned-observer race。`closeJsonlAuditRotationRecoveryHandles(...)`现在按object identity去重，generation/staging/parent handles并发single-attempt close；raw shared `invokeJsonlAuditFileHandleClose(...)`保持direct contract供writer和lock lifecycle使用。
- Runtime新增3项测试，覆盖committed result加late rejection、mutation primary/rollback加timeout、candidate-open failed-handle handoff加timeout；其他handles与coordination lock仍继续finalize。`test/audit.test.ts`共276项通过。
- CLI新增2项测试，覆盖committed WARN和candidate-open ERROR；human/JSON保持performed/stage/state与既有`recovery_handles_closed:false`/fixed warning，并不输出late reason。`test/cliAudit.test.ts`共112项通过。
- Compiled smoke从`dist/`执行真实CLI recovery，使用process-local timer acceleration验证5000ms policy、committed namespace evidence、late rejection consumption、parent close continuity与clean coordination lock release；完整CLI smoke通过。
- 全量`tools/check.sh`通过：Python 422项；TypeScript 43个test files、902项；TypeScript build、built integration与CLI smoke全部成功。
- 静态接口校验通过：source/dist各仅有一个recovery、maintenance与inspection timeout constant、一个generic race helper和一个recovery wrapper；candidate finalizer唯一使用recovery wrapper并identity deduplicate，shared writer/lock closer仍调用direct helper；未新增CLI/protocol timeout option、field或environment variable。
- 残留审计完成：workspace无`.tmp`、`.bak`、`.orig`或`.rej`；核对13个stale audit lock fixture的owner PID均已退出后以`unlink`/`rmdir`清理，并清理1个中断red probe临时目录；最终无Phase582、recovery timeout、smoke、integration或audit lock残留，也无check、Vitest、pytest、engine或CLI进程。

## Phase583 后续衔接

Phase583已为candidate deadline之后使用的successful coordination lock lifecycle增加独立5000ms settlement guard与memoized exactly-once finalizer。Phase582的candidate handle fields、committed/primary ordering和candidate-open stage保持；coordination lifecycle timeout单独沿既有released false/warning投影，不再无限等待或重复abandon close。

## Phase587 后续衔接

Phase587已把successful recovery candidate持有期间的staging child-scan `Dir`纳入Phase582同一5000ms deadline。Stream read primary保持；candidate-open或pre-commit scan timeout沿existing ERROR/rollback state返回，post-commit cleanup timeout保持generation commit并通过既有warning与empty staging residual投影。Phase582 generation/staging/parent `FileHandle` finalizer仍独立汇总`recoveryHandlesClosed`，stream failure不会改写该handle outcome或重复close candidate descriptors。
