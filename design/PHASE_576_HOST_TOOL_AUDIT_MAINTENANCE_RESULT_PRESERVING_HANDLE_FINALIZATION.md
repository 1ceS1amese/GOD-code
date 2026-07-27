# Phase576：Host tool audit maintenance result-preserving handle finalization

## 背景

Phase575处理了runtime明确返回`existed:false`时的preflight snapshot withdrawal。继续沿runtime rejection边界审计六条lock maintenance transaction时，发现更早的lifecycle缺口：五条cleanup在`finally`调用throwing `closeJsonlAuditFileHandles(...)`，pre-commit quarantine recovery在`finally`直接执行`Promise.all(handle.close())`。

这些finalizer运行在operation return expression已经求值之后。只要任一descriptor close同步throw或Promise rejection，secondary lifecycle failure就会覆盖已经确定的runtime result：

- committed cleanup会从`removed:true`变成rejected Promise；
- successful recovery会从`recovered:true`变成rejected Promise；
- verified rollback-residual result也会被覆盖；
- primary pre-commit error可能被secondary close error替换。

Phase576 red probe在active cleanup的runtime candidate directory handle上注入同步close throw，同时让underlying close继续完成。Transaction已经删除selected lock；旧runtime却从final `closeJsonlAuditFileHandles(...)`抛出注入错误，caller无法取得`existed:true`、`removed:true`和fingerprint，CLI会进一步退化为preflight-shaped ERROR。这与Phase557-560为rotation recovery建立的“operation outcome优先、secondary finalization结构化”原则不一致。

## Evidence Contract

1. Namespace operation result一旦确定，不得被descriptor finalization failure覆盖。
2. Candidate existing且返回resolved result时，runtime必须投影对应handle finalization outcome：
   - cleanup：`cleanupHandlesClosed`与optional `cleanupHandleWarning`；
   - quarantine recovery：`recoveryHandlesClosed`与optional `recoveryHandleWarning`。
3. 所有handles必须获得一次close invocation；同步throw与async rejection都通过all-settled normalization收集。
4. 任一close failure时，已知`removed`、`recovered`、fingerprint、residual和rollback result保持；`*HandlesClosed:false`与bounded warning表达secondary uncertainty。
5. CLI保留已知operation outcome并输出WARN；不得退化为generic ERROR或复用preflight outcome。
6. Runtime candidate missing在打开handle前返回，不新增finalization fields。
7. Primary operation error必须继续作为rejection传播；secondary close failure不得替换primary message。
8. 本阶段不为rejected operation新增structured secondary warning fields；该failure-envelope扩展留给下一阶段。Secondary failure在primary-error branch不覆盖primary，但暂不单独投影。
9. Finalization uncertainty不改变commit point、rollback、residual locator、selected existence或fingerprint semantics。

## Covered Operations

- `cleanupJsonlAuditFileLock(...)`
- `cleanupJsonlAuditLockQuarantine(...)`
- `cleanupJsonlAuditEmptyLockQuarantine(...)`
- `cleanupJsonlAuditLockDisposal(...)`
- `cleanupJsonlAuditEmptyLockDisposal(...)`
- `recoverJsonlAuditLockQuarantine(...)`

Read-only inspection与normal writer lock lifecycle继续使用既有error contract；rotation staging recovery已经具有独立Phase557-560 finalization envelope，不修改。

## Runtime Implementation

新增module-private non-throwing finalizer：

```text
handles[]
  -> invoke every close through async normalization
  -> Promise.allSettled
  -> { closed: true }
     or { closed: false, warning }
```

六条runtime operation各自持有`resolvedResult`引用。所有candidate-existing return先把object赋给该引用；`finally`调用non-throwing finalizer并在Promise真正resolve之前把closure outcome写入result。若operation抛出primary error，finalizer仍尝试全部handles但不再throw，原primary自然传播。

Existing throwing close helper保留给仍以close failure作为inspection/error contract的其他调用方，避免无关行为漂移。

## CLI Projection

五类cleanup details增加optional：

- `cleanup_handles_closed`
- `cleanup_handle_warning`

Quarantine recovery details增加optional：

- `recovery_handles_closed`
- `recovery_handle_warning`

Runtime existing result映射这些fields。Close uncertainty与既有residual共同决定cleanup WARN；successful recovery本来因liveness unknown返回WARN，message进一步说明descriptor finalization需要review。Missing、preflight refusal和runtime primary rejection不伪造closure fields。

## Tests

- 六条runtime operation分别注入candidate handle synchronous close throw，验证underlying close仍完成、result保持、对应`*HandlesClosed:false`和warning存在、filesystem commit/rollback状态正确。
- Active cleanup primary pre-commit error叠加secondary close throw，验证primary message保持且其他handles仍获得close attempt。
- CLI active cleanup close failure：report保持`ok:true`、`removed:true`、selected absence与fingerprint evidence，status WARN并投影cleanup finalization fields。
- CLI successful quarantine recovery close failure：保持`recovered:true`和active lock evidence，投影recovery finalization warning且不泄漏old/new owner token。
- Stable no-failure结果投影`*HandlesClosed:true`；missing branch省略fields。
- Built smoke覆盖active cleanup、empty disposal与successful recovery的compiled result preservation。

## 接口边界

- Runtime result interfaces和Host-local CLI details各增加两类optional lifecycle fields。
- 不修改CLI flags、command names、JSON-RPC、agent event、provider、tool result、transcript或persistent schema。
- 不改变candidate selection、fingerprint material、namespace mutation顺序、commit、rollback或residual semantics。
- Warning只包含bounded normalized error summary，不包含owner token、owner JSON或raw identity。
- 不把descriptor closure uncertainty解释为namespace rollback或commit failure。

## 验收标准

- Committed/resolved maintenance result不得再被handle close failure改写为rejection。
- Primary operation error不得被secondary close failure替换。
- 所有handles在同步或异步close failure下仍各获得一次close attempt。
- CLI human/JSON保留operation evidence并结构化显示finalization warning。
- Stable、missing、residual、rollback和runtime rejection原语义保持。
- Python、TypeScript、build、built integration与CLI smoke全部通过。
- Workspace及`/tmp`无probe、smoke、integration或patch残留，无相关test/engine/CLI进程和FileHandle GC warning。

## 实现结果

- Active cleanup red probe在runtime candidate directory handle上注入同步close throw，并同时启动underlying close。Namespace transaction已经删除selected lock；旧实现仍从throwing finalizer reject。Phase576实现后同一probe稳定返回`existed:true`、`removed:true`、runtime-confirmed fingerprint、`cleanupHandlesClosed:false`和bounded warning。
- `ts-host/src/audit/jsonlAuditSink.ts`新增module-private `finalizeJsonlAuditLockMaintenanceHandles(...)`。它通过existing async close invocation normalization启动全部handles并使用`Promise.allSettled`收集结果，自身不throw。五类cleanup与quarantine recovery各保存candidate-existing `resolvedResult`，在`finally`中附加cleanup/recovery closure outcome；stable result报告true，warning只在失败时出现，runtime missing在handles打开前返回并省略fields。
- Runtime result interfaces新增五组optional cleanup fields和一组recovery fields；`ts-host/src/cli/audit.ts`对应六类Host-local details新增snake_case projection。Close uncertainty与existing residual共同产生WARN，stable cleanup保持OK，successful recovery保持liveness WARN；committed deletion、successful recovery、verified rollback residual、selected existence、fingerprint和locator evidence均不退化为generic ERROR。
- `audit.test.ts`新增六条operation close-failure result-preservation回归和一条primary-plus-secondary failure回归。后者同时确认首个candidate close同步throw后，后续owner handle仍获得一次close attempt；runtime audit最终为229项。`cliAudit.test.ts`新增active cleanup与successful recovery两条human/JSON projection回归，验证status、filesystem state、lifecycle fields和owner-token non-disclosure；CLI audit最终为100项。
- Built CLI smoke新增`==> built audit maintenance result-preserving handle finalization`，通过compiled `dist`动态测量preflight target open count，并在runtime candidate open注入active cleanup、empty disposal及successful recovery三类同步close failure。三类report均保留已知operation outcome、投影false/warning、符合filesystem commit状态且不泄漏owner token；完整smoke输出`CLI smoke ok`。
- 统一`tools/check.sh`验收通过：Python 422项；TypeScript 43个test files、843项；TypeScript build、built integration和CLI smoke全部通过。README、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS、SECURITY、protocol及Phase530/532/533/535/536/539/543/557/560/572/573/575历史边界已同步Phase576。
- Source与compiled artifact静态审计确认六条operation均使用non-throwing finalizer，五组cleanup和一组recovery runtime/CLI fields完整映射，missing branch不伪造fields，existing throwing closer的其他caller contract保持。CLI flags、command names、JSON-RPC、agent event、provider、tool result、transcript及persistent schema未改变。
- `run-cli-smoke.sh`语法复核通过；workspace及`/tmp`无Phase576 probe、smoke、integration、audit lock、`.tmp`、`.bak`、`.orig`或`.rej`残留，无相关test/engine/CLI进程，验收输出无FileHandle GC warning。

## Phase577 后续加固

Phase577完成本阶段明确延期的rejected-operation secondary warning envelope。Candidate selection与post-selection operation failure统一抛出typed maintenance error，复用同一non-throwing all-settled finalizer并把neutral closure details映射到Phase576 existing CLI fields。Resolved result contract、missing omission、commit/rollback与WARN projection保持。
