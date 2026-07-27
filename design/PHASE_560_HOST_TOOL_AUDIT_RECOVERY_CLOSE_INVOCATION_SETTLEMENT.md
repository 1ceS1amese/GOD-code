# Phase560：Host tool audit recovery close invocation settlement

## 背景

Phase557-559要求candidate descriptor finalization使用all-settled语义：任一close failure只能形成warning，不能覆盖已知operation result或primary error，且其他handles仍必须获得一次close attempt。

当前`closeJsonlAuditRotationRecoveryHandles(...)`虽然调用`Promise.allSettled(...)`，但参数通过`handles.map((handle) => handle.close())`构造。`map`会同步执行每个`close()`；若某个implementation在返回Promise前同步throw，array构造立即中止，`Promise.allSettled`根本没有机会接管：

- 当前及后续handles不会调用close；
- committed recovery result可能被同步close error覆盖；
- operation primary error可能被secondary close error替换；
- outer fallback会把已提交mutation误报为`locked_revalidation/not_started`；
- Phase559 handed-off descriptor也无法获得完整settlement保证。

Built runtime故障注入已复现：`restore_previous_archive`已经把staged archive提交到`.1`，candidate staging `close()`同步throw，parent close未被调用；caller收到close message和`locked_revalidation/not_started`，而current与`.1`实际已经处于committed state。

Phase560为每个close invocation增加async normalization boundary，使同步throw和返回Promise后的rejection都转换为独立rejected Promise，再由`Promise.allSettled`完整消费。

## Invocation Contract

新增module-private close invocation helper：

```text
invokeJsonlAuditFileHandleClose(handle) -> Promise<void>
```

其语义：

1. 每次调用只调用目标`handle.close()`一次；
2. `close()`同步throw转换为returned Promise rejection；
3. `close()`返回的Promise rejection保持为rejection；
4. successful close resolve；
5. 不吞掉、不改写error message，也不重试。

所有需要all-settled的handle数组必须先映射到该helper，而不是直接在`map`回调中裸调用`close()`。

## Recovery Outcome Preservation

`closeJsonlAuditRotationRecoveryHandles(...)`在normalization后保证：

- 所有deduplicated candidate handles都启动一次close invocation；
- 任一同步throw或异步rejection只影响`closed: false`和warning聚合；
- committed/missing operation result继续resolve并由CLI映射WARN；
- operation failure继续保留Phase558 primary message、stage与mutation/rollback state；
- Phase559 failed-open handed-off handles与returned handles共享同一settlement语义；
- coordination lock finalization仍在candidate finalization之后独立执行。

Shared `closeJsonlAuditFileHandles(...)`也采用同一invocation helper，避免其`Promise.allSettled`具有相同的eager-map缺口；它仍在全部close settle后传播第一个failure，不改变既有caller的throwing contract。

## CLI Contract

不新增字段。复用Phase557/558：

```text
recovery_handles_closed
recovery_handle_warning
performed_action
failure_stage
mutation_state
```

Committed operation加同步close failure必须返回`ok: true`、WARN、保留performed/mutation evidence；pre-commit primary failure加同步close failure必须返回ERROR、保留primary message/stage/state并附加handle warning。

## Tests

- Committed archive restore叠加candidate close同步throw：result保留performed action，handles false，后续parent handle仍close一次。
- Successful reverse rollback叠加candidate close同步throw：typed error保留primary mutation message与`rolled_back`，handles false。
- Phase559 failed-open handoff叠加同步close throw：candidate-open primary保持，所有其他handles仍close。
- CLI human/JSON覆盖committed WARN或typed ERROR的同步close projection。
- Built runtime smoke复现旧commit-evidence loss并断言修复后result保持。
- Existing async close rejection、lock residual、rollback和clean action tests保持。

## 边界

- Normalization只处理JavaScript invocation timing，不断言close rejection时descriptor的kernel状态。
- 不无限重试close，不把同步throw解释为一定未关闭。
- 不改变FileHandle、candidate ownership、namespace mutation、rollback、lock或durability contracts。
- Warning仍只输出安全message，不暴露fd、raw handle或error object。
- 不新增JSON-RPC、agent event、provider、tool result、transcript或persistent schema字段。

## 验收标准

- 一个close同步throw不能阻止其余candidate handles获得close attempt。
- 同步throw与async rejection产生同构closed/warning projection。
- 已知operation result和primary error均不能被同步close error覆盖。
- Phase559 returned/handed-off handle ownership与deduplication保持。
- TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- `/tmp`与workspace无probe、staging、smoke或patch残留，无FileHandle GC warning。

## 实现结果

- 已用built Phase559 runtime稳定复现旧行为：`restore_previous_archive`完成current/`.1` generation commit后，candidate staging `close()`同步throw使Promise数组构造中止；parent close调用次数为0，caller收到close message和错误的`locked_revalidation/not_started`，已提交mutation result被擦除。
- 新增module-private `invokeJsonlAuditFileHandleClose(handle)` async boundary。`closeJsonlAuditRotationRecoveryHandles(...)`和shared `closeJsonlAuditFileHandles(...)`均先为每个handle取得独立Promise，再进入`Promise.allSettled`；同步throw、async rejection和resolve因此具有同一settlement时序。
- Recovery all-settled finalizer现在保证所有returned及Phase559 handed-off handles各启动一次close invocation。Committed operation遇到同步throw仍返回performed action、mutation/staging/durability和`recoveryHandlesClosed: false` warning；operation rejection仍保留Phase558 primary stage、mutation/rollback state并附加secondary warning。
- Shared throwing multi-handle closer仍在全部handles settle后传播第一个failure，未改变既有caller contract。Runtime不重试close，也不从rejection推断kernel descriptor已关闭或仍打开；public result/error与CLI schema未增加字段。
- 将3项runtime lifecycle tests升级为同步throw注入，分别覆盖committed result、successful reverse rollback primary error和Phase559 candidate-open handoff primary error，并断言后续parent handle仍close一次。CLI committed recovery handle warning test同步升级，human/JSON继续返回WARN并保留mutation evidence。定向回归通过：`audit.test.ts` 187项、`cliAudit.test.ts` 60项，共247项；TypeScript build通过。
- Built CLI smoke新增真实committed recovery同步close probe，验证staging close同步throw只产生handle warning、parent close仍执行、performed action和clean coordination lock release保持。
- 统一验收通过：Python 422项；TypeScript 43个test files、761项；TypeScript build、built CLI integration和CLI smoke全部通过。README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase543/557/559历史边界已同步；JSON-RPC、agent event、provider、tool result、transcript和persistent schema未变化。
- `/tmp`无`god-code-audit-*`、`god-code-phase560-*`、`.god-code-audit-rotation-*`或`god-code-smoke.*`残留；workspace无staging directory及`.tmp`、`.bak`、`.orig`或`.rej`文件，验收输出无FileHandle GC warning。

## Phase561 后续加固

Phase561保证本阶段settled rejection在warning格式化时不会再次throw。Close reason的message/string coercion经过total、single-line、512字符有界summary；unprintable reason使用固定fallback。Phase560 invocation/settlement与all-handle continuity不变，formatter failure不再产生新的operation rejection。

## Phase576 后续加固

Phase576复用本阶段的async close invocation normalization，为lock maintenance新增non-throwing all-settled finalizer。同步throw与async rejection都不会截断其他handle close，也不会覆盖已确定的cleanup/recovery result；warning继续使用total bounded formatter。Existing throwing shared closer仍供其他caller保留原error contract，rotation recovery settlement不变。

## Phase577 后续加固

Phase577把maintenance candidate readers中剩余的direct close和raw `Promise.all`迁移到Phase560-style invocation normalization。Candidate selection首个同步close throw现在成为独立settled rejection，其余directory/owner handles仍启动close，primary validation message进入typed error。其他shared closer与rotation recovery保持。

## Phase582 后续加固

Phase582在本阶段的rotation recovery candidate invocation normalization外增加operation-family 5000ms settlement deadline。同步throw与ordinary rejection仍保持Phase560语义；永久pending close现在只形成既有handle false/warning，committed result、primary error和其余handle close continuity不再无限等待。Shared writer/lock-lifecycle closer仍保留direct settlement contract。
