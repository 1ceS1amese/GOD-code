# Phase583：Host tool audit cooperative lock lifecycle descriptor close settlement timeout

## 背景

Phase582为mutating rotation recovery candidate handles增加5000ms settlement deadline，但recovery随后调用的coordination lock仍复用普通cooperative lock lifecycle。成功取得的`JsonlAuditFileLock`持有三个descriptor：

- pinned `owner.json` handle；
- pinned lock directory handle；
- pinned immediate parent directory handle。

`release()`和`abandon()`最终都调用同一个local closer：

```text
closeLifecycleHandles()
  -> closeJsonlAuditFileHandles(owner, lock, parent)
  -> Promise.allSettled(invokeJsonlAuditFileHandleClose(...))
  -> await handle.close() without deadline
```

任一returned close Promise永久pending时：

- direct `lock.release()`在owner unlink与lock rmdir已经提交后仍不返回；
- direct `lock.abandon()`无法结束runtime descriptor ownership；
- `JsonlAuditSink.record(...)`在append已经提交后无法settle；
- rotation recovery无法形成`coordinationLockReleased`、warning或process exit；
- release失败后的writer/recovery fallback可能再次调用`abandon()`，从而对同一handles重复close。

Phase583 red probe让acquisition-time owner handle调用真实close后返回受控pending Promise。`release()`已删除owner和lock directory，虚拟时间推进60秒后仍未settle；测试只有主动reject pending Promise后才收到close error。这证明cooperative lifecycle需要独立deadline与exactly-once finalization ownership。

## Lifecycle Settlement Contract

新增module-private lifecycle deadline：

```text
JSONL_AUDIT_LOCK_LIFECYCLE_CLOSE_SETTLEMENT_TIMEOUT_MS = 5000
```

Successful-lock lifecycle resources遵守：

1. owner、lock directory与parent handles按object identity去重；
2. 同一finalization set并发启动close与timer；
3. 每个handle在整个returned lock lifecycle中最多调用一次close；
4. sync throw、async rejection和resolve保持原settlement；
5. 5000ms event-loop timer前未settle时形成固定safe timeout failure；
6. timeout不重试、不cancel，也不推断kernel descriptor状态；
7. late resolve/reject由owned observer消费，不产生unhandled rejection或改写既有result；
8. repeated/concurrent `release()`与`abandon()`复用第一次创建的memoized finalization Promise。

固定timeout message：

```text
audit lock lifecycle descriptor close timed out after 5000 ms
```

Timer与Phase580-582相同，不是hard real-time guarantee；同步阻塞event loop时只能在重新获得调度后触发。

## Shared Internal Design

Phase583继续复用module-private generic settlement race：

```text
resource.close()
  -> owned fulfilled/rejected observer
  -> race(operation-family timeout settlement)
```

新增lifecycle wrapper与throwing all-settled closer。Closer等待全部unique resources settle/timeout后传播第一项failure，保持原`closeJsonlAuditFileHandles(...)`的throwing contract，但不影响该shared closer的其他caller。

Acquired lock closure不再以`lifecycleHandlesClosed`布尔值在成功后才记录状态，而是在首次调用时立即保存：

```text
lifecycleHandleFinalization: Promise<void> | undefined
```

第一次`release()`或`abandon()`创建该Promise；所有后续调用返回同一Promise。即使首次finalization reject或timeout，也不会再次调用任何handle close。

## Typed Internal Boundary

Lifecycle closer failure包装为module-private：

```text
JsonlAuditLockLifecycleCloseError
```

其message使用既有total、single-line、bounded formatter，cause只在当前process内部保留。该type用于区分：

- release validation/mutation failure：namespace尚未确认提交，需要调用`abandon()`关闭handles；
- release lifecycle-close failure：owner unlink、lock rmdir和descriptor unlink assertion已经完成，只是close settlement不确定，不得再次close同一handles。

`finalizeJsonlAuditRotationRecoveryLock(...)`遇到该typed close error时记录一次release warning，跳过冗余abandon close，然后仍执行lock-path residue observation。它不把descriptor timeout解释为lock path仍存在。

## Release与Abandon Semantics

### Release

`release()`保持现有mutation顺序：验证owner/directory、unlink owner、rmdir lock、验证original descriptor已脱链、设置`released`，最后finalize handles。

- Close成功：resolve，lock path missing。
- Close reject/timeout：在deadline后reject lifecycle error；lock path仍保持已提交missing，不rollback或重建lock。
- Repeated release：复用同一finalization outcome，不再次close。
- Release后abandon：复用同一outcome，不再次close或修改filesystem。

### Abandon

`abandon()`先把held state改为`abandoned`，不unlink、rename或rmdir，再finalize handles。

- Close成功：resolve，disk lock保持。
- Close reject/timeout：在deadline后reject lifecycle error；disk lock仍保持，后续可通过显式maintenance cleanup处理。
- Repeated abandon：复用同一outcome，不再次close。
- Abandon后release：继续拒绝`Audit file lock was abandoned before release.`。

## Writer与Recovery Projection

Phase583不新增public fields。

### Writer

`JsonlAuditSink.record(...)`继续保留现有primary ordering：

- append成功加release close timeout：record在deadline后reject固定lifecycle message，但已写audit line与missing lock path保持；
- append/rotation primary failure加close timeout：等待bounded finalization后仍抛原transaction primary；secondary lifecycle error不覆盖；
- release后writer fallback `abandon()`只复用memoized outcome，不重复close。

### Rotation recovery

- Candidate operation result保持Phase582 fields；
- coordination lock lifecycle timeout返回resolved recovery result，`coordinationLockReleased: false`；
- warning固定包含`coordination lock release failed: audit lock lifecycle descriptor close timed out after 5000 ms`；
- 已确认lock path missing时不形成`residualCoordinationLockPath`；
- 不追加重复的`coordination lock handle abandonment failed` warning。

CLI继续复用既有`coordination_lock_released`、`residual_coordination_lock_path`和`coordination_lock_warning`。Human/JSON不得输出owner token、raw handle、fd、pending Promise或late reason。

## Covered Graph

- Direct cooperative lock `release()`。
- Direct cooperative lock `abandon()`。
- Concurrent/repeated release/abandon serialization。
- Normal JSONL writer在finally中的release/abandon lifecycle。
- Rotation staging recovery coordination lock finalization。
- Reuse上述runtime API的rotation recovery CLI report。

本阶段不修改：

- failed lock acquisition cleanup handles；
- lock parent acquisition attempt在reservation transfer前的direct close；
- writer generation parent、current file、rotation transaction和durability handles；
- rotation recovery candidate handles（Phase582）；
- maintenance、inspection和quarantine/disposal recovery finalizers；
- public `JsonlAuditFileLock` interface、CLI flags或cross-layer schema。

这些remaining direct-close families继续作为后续独立审计边界。

## Tests

- Release owner handle pending：deadline后reject固定typed message，lock path missing，三个handles各close一次。
- Release timeout后late rejection：无unhandled rejection；repeated release/abandon不再次close。
- Abandon owner handle pending：deadline后reject，disk owner/lock保持，repeated abandon不再次close。
- Successful writer append加lifecycle timeout：record bounded reject，audit line保留，lock path missing，release-to-abandon不重复close。
- Recovery committed result加coordination lifecycle timeout：performed/mutation evidence保持，released false、无residual、单一warning。
- Existing stable release/abandon/concurrency、owner replacement和release mutation-failure tests保持。
- CLI human/JSON覆盖coordination timeout WARN，不泄漏owner token或late reason。
- Compiled smoke从`dist/`验证deadline、memoization、late rejection consumption、writer/recovery projection和filesystem state。

## 接口与安全边界

- Timeout只表示returned close Promise未按期settle，不证明descriptor仍open或已经closed。
- Release close timeout发生在namespace commit之后，不得重建owner/lock、rollback或重新acquire。
- Abandon timeout不得删除disk lock。
- Repeated fallback不得重复close、rename、unlink、rmdir或写owner metadata。
- 不新增CLI flags、commands、exit code、human/JSON field names、environment variables或public runtime option。
- 不修改JSON-RPC、agent event、provider、tool result、transcript、owner metadata或persistent schema。
- 不输出fd、raw resource、raw error object、owner token或unbounded error text。

## 验收标准

- 任一successful cooperative lock lifecycle close Promise永久pending时，release/abandon及其writer/recovery caller必须在一个5000ms timer deadline后settle。
- 三个unique lifecycle handles必须并发各调用close一次，任何重复或fallback lifecycle operation不得再次调用。
- Release timeout保持lock path missing；abandon timeout保持disk lock present。
- Writer/recovery primary与committed evidence不得被secondary lifecycle timeout覆盖。
- Late resolve/reject不得产生unhandled rejection、二次projection或filesystem mutation。
- Failed acquisition、writer-owned handles、maintenance、inspection、candidate recovery与跨层contracts保持。
- Python、TypeScript、build、built integration和CLI smoke全部通过。
- Workspace及`/tmp`无probe、smoke、integration、audit lock或patch残留，无相关test/engine/CLI进程和FileHandle/Dir GC warning。

## 实现结果

- Red baseline已冻结：acquisition-time owner handle调用真实close后返回受控pending Promise；`release()`已完成owner unlink与lock rmdir，虚拟时间推进60秒仍不settle，只有测试主动reject后才返回close failure，证明successful lifecycle缺少deadline和exactly-once ownership。
- `jsonlAuditSink.ts`新增module-private lifecycle 5000ms constant、`JsonlAuditLockLifecycleCloseError`和lifecycle-specific wrapper。Owner、lock directory与parent handles按object identity去重并发all-settled；首次finalization在await前memoize，所有repeated/concurrent release、abandon及fallback复用同一Promise。Rotation recovery只在typed post-release lifecycle close failure下跳过冗余abandon，仍执行lock-path residue observation。
- Runtime新增4项测试，覆盖release timeout后missing lock与late rejection、abandon timeout后persistent lock、successful writer append加bounded rejection，以及committed rotation recovery coordination timeout。三个lifecycle handles各single-attempt close，重复调用不重新close；`test/audit.test.ts`共280项通过。
- CLI新增1项测试，覆盖committed recovery WARN、`recovery_handles_closed:true`、`coordination_lock_released:false`、fixed warning、无residual lock、无abandonment duplicate与无late reason；`test/cliAudit.test.ts`共113项通过。
- Compiled smoke从`dist/`执行真实CLI recovery，使用process-local timer acceleration验证5000ms lifecycle policy、anchored owner/lock handle close、late rejection consumption、committed current/rotated state和missing coordination lock；完整CLI smoke通过。
- 全量`tools/check.sh`通过：Python 422项；TypeScript 43个test files、907项；TypeScript build、built integration与CLI smoke全部成功。
- 静态接口校验通过：source/dist各仅有一个maintenance、inspection、recovery与lifecycle timeout constant、一个generic race helper、一个lifecycle closer和一个lifecycle wrapper；successful lock唯一使用memoized lifecycle closer，raw shared closer仍只服务排除的acquisition/writer transaction路径；public `JsonlAuditFileLock`、CLI/protocol timeout option、field和environment variable未变化。
- 主README、项目计划、内部设计、架构、扩展点、安全与protocol文档已同步到Phase583，并在Phase582文档记录coordination lifecycle后续衔接。
- 残留审计完成：workspace无`.tmp`、`.bak`、`.orig`或`.rej`；核对12个测试遗留audit lock/quarantine fixture的owner PID均已退出后，以`unlink`/`rmdir`清理。最终`/tmp`无Phase583、lifecycle timeout、smoke、integration或audit lock残留，也无check、Vitest、pytest、engine或CLI进程。

## Phase584 后续衔接

Phase584已为successful ownership transfer之前的failed-open、pre-transfer parent、failed-cleanup handle set与acquisition child-scan stream增加独立5000ms settlement guard。Phase583的returned lock lifecycle、memoized exactly-once finalizer和release/abandon projection保持；transfer成功前后由不同operation-family policy明确分界，不会提前close或双重finalize同一successful handle。

## Phase586 后续衔接

Phase586已把successful ownership transfer后的`assertHeld()`、pre-owner release与post-owner empty child-scan `Dir`纳入Phase583 lifecycle deadline。Stream timeout保持普通lifecycle error，使caller仍可`abandon()`尚未进入memoized handle finalizer的owner/lock/parent handles；只有lock rmdir完成后的handle set继续使用Phase583 `JsonlAuditLockLifecycleCloseError`和exactly-once finalization。Phase584 acquisition clone与successful lifecycle marker保持明确分界。
