# Phase586：Host tool audit cooperative lock lifecycle directory stream close settlement timeout

## 背景

Phase583为successful cooperative lock transfer后的owner、lock directory与parent `FileHandle` finalizer建立5000ms lifecycle deadline；Phase584随后覆盖transfer前acquisition child-scan `Dir`。但successful transfer后，returned lock仍通过同一lock directory descriptor执行多次bounded child scan：

- `assertHeld()`在rotation recovery revalidation前后确认exact `owner.json` entry set；
- `release()`在owner unlink前确认owner-only layout；
- owner unlink成功后再次确认lock directory exact empty，再执行rmdir；
- recovery failure observation和后续mutation gates重复调用`assertHeld()`。

这些scan仍落入raw `await stream.close()`。如果native close已经执行、returned Promise永久pending：

- recovery可能永久停在locked revalidation，无法形成existing failure report或finalize coordination lock；
- writer record已经append后可能永久停在release，serialization tail与caller都不settle；
- release可能在owner unlink前卡住并保留owner lock，也可能在owner unlink后卡住并保留empty lock；
- scan read primary可能被late close rejection覆盖；
- Phase583 handle finalizer从未启动，descriptor ownership无法通过`abandon()`回收。

Phase586用五条red probe冻结pre-owner release、scan primary、post-owner release、committed writer和recovery locked-revalidation行为。所有probe均让stream执行真实native close后返回受控pending Promise；虚拟时间推进60秒时旧实现仍未settle，证明successful lifecycle scan需要复用Phase583 deadline。

## Lifecycle Stream Contract

Phase586不新增timeout constant或message，复用Phase583：

```text
JSONL_AUDIT_LOCK_LIFECYCLE_CLOSE_SETTLEMENT_TIMEOUT_MS = 5000
audit lock lifecycle descriptor close timed out after 5000 ms
```

Successful-transfer lock directory新增module-private lifecycle marker。Marker只在全部acquisition validation成功、ownership即将transfer给returned `JsonlAuditFileLock`时设置；transfer前的clone仍只使用Phase584 acquisition policy。

Lifecycle scan resources遵守：

1. 同一finalization set按object identity去重；
2. unique resources并发、single-attempt调用close；
3. scan read primary优先于secondary close reject/timeout；
4. scan成功但close在5000ms event-loop deadline前未settle时，当前assert/release gate失败；
5. timeout不重试、不cancel，也不推断kernel stream或descriptor状态；
6. late resolve/reject由shared owned observer消费，不形成unhandled rejection或重入lifecycle mutation；
7. stream close failure不memoize Phase583 handle finalizer，也不包装为`JsonlAuditLockLifecycleCloseError`；caller仍可调用`abandon()`关闭owner/lock/parent handles；
8. handle finalizer继续memoized exactly-once，保持Phase583 typed internal error和release/abandon serialization。

## Release State Ordering

### Owner unlink前

Owner-only scan close timeout发生在namespace mutation前：

- `release()`拒绝fixed lifecycle timeout；
- owner与lock directory保持；
- lifecycle state仍为held；
- caller或writer/recovery fallback可调用`abandon()`，只关闭handles，不修改disk lock；
- late stream settlement不得触发owner unlink或lock rmdir。

### Owner unlink后

Empty scan close timeout发生在owner unlink已经验证后、lock rmdir之前：

- `ownerRemoved`保持true，不重建owner metadata；
- lock directory保持exact empty residual；
- `release()`拒绝fixed lifecycle timeout；
- `abandon()`只关闭handles，empty residual留给既有maintenance命令处理；
- repeated release/abandon不得重复unlink、写owner或rmdir。

### Handle finalization后

Lock rmdir完成后仍只进入Phase583 memoized handle finalizer。Handle close timeout保持missing lock namespace，并继续使用`JsonlAuditLockLifecycleCloseError`，不受Phase586 stream policy改变。

## Assert-Held与Recovery

Returned lock的`assertHeld()`使用lifecycle-marked directory scan：

- read/identity primary保持；
- successful scan close timeout使当前revalidation失败，不进入依赖exact entry set的mutation；
- rotation recovery把首次timeout投影为existing `locked_revalidation`、`not_started` ERROR；
- post-failure observation与coordination lock finalization仍可继续；
- 如果后续release成功，`coordination_lock_released`保持true且无residual；
- pending Promise、raw stream、fd和late reason不进入report。

## Writer与CLI Projection

普通writer在record append完成后才进入lock release。Pre-owner lifecycle stream timeout时：

- record拒绝fixed lifecycle timeout；
- committed JSONL line保持；
- writer fallback调用`abandon()`关闭handles；
- owner lock namespace保持，供显式maintenance处理；
- audit write tail消费失败并允许后续operation按既有coordination规则继续。

Rotation recovery CLI不新增field。Phase586只复用existing：

- failure `message`、`failure_stage`与`mutation_state`；
- `coordination_lock_acquired`/`released`；
- optional `residual_coordination_lock_path`；
- bounded `coordination_lock_warning`。

## 测试与接口矩阵

- Runtime覆盖pre-owner release timeout、read primary preservation、post-owner empty residual和committed writer projection。
- CLI覆盖first returned-lock `assertHeld()` stream timeout在mutation前形成locked-revalidation ERROR并成功release lock。
- Compiled smoke覆盖committed recovery后的post-owner stream timeout、empty residual、warning、late rejection消费和no-owner state。
- Existing Phase583 handle release/abandon memoization、Phase584 acquisition scan、writer、recovery、maintenance与inspection tests全部回归。
- 静态校验确认lifecycle marker只在successful transfer后设置，scan branch无raw close，public lock/CLI/protocol/environment和persistent schema不变。

## 接口与安全边界

- 不新增public lock method、option、CLI flag、command、exit code、field或environment variable。
- 不修改JSON-RPC、Engine event、provider/tool result、transcript、audit envelope、owner metadata、rotation staging或persistent schema。
- Timeout message不包含path、fd、raw stream、entry name、owner token、record payload或late reason。
- Stream timeout不证明kernel close、owner unlink、lock rmdir或descriptor finalization状态；namespace evidence必须来自既有runtime checks。
- Acquisition clone不得提前获得lifecycle marker；successful transfer前后继续由Phase584与Phase583/586明确分界。

## 验收标准

- 任一successful lifecycle child-scan close Promise永久pending时，当前gate在5000ms event-loop deadline后settle。
- Scan read primary优先，scan成功时fixed lifecycle timeout可见。
- Pre-owner timeout保持owner lock；post-owner timeout保持exact empty lock且不重建owner。
- Stream timeout后`abandon()`可关闭handles；Phase583 handle finalizer仍memoized exactly-once。
- Recovery revalidation timeout不进入mutation并可完成post-failure observation与coordination lock finalization。
- Committed writer/recovery state保持，late settlement不触发额外namespace mutation或unhandled rejection。
- Public TypeScript、CLI、protocol、environment和persistent interfaces保持。
- Python、TypeScript、build、built integration和CLI smoke全部通过。
- Workspace与`/tmp`无probe、smoke、integration、audit lock、staging或patch残留，无相关test/engine/CLI进程和FileHandle/Dir GC warning。

## 实现结果

- 五条red baseline已冻结并逐项验证：pre-owner release、scan read primary、post-owner empty residual、committed writer和recovery first `assertHeld()`在真实native stream close后返回受控pending Promise；虚拟时间推进60秒时旧实现均未settle。
- `JsonlAuditLockPinnedDirectory`新增module-private lifecycle marker，只在全部acquisition validation完成后写入successful returned directory；acquisition clone仍保持Phase584 marker。Lock child scanner新增lifecycle branch并复用Phase583 timeout wrapper，read primary通过new primary-preserving closer保持。
- Phase583 lifecycle closer从FileHandle-only泛化为`JsonlAuditClosableResource`，memoized handle finalizer继续通过同一closer并包装`JsonlAuditLockLifecycleCloseError`；stream failure保持普通Error，不启动或memoize handle finalizer，因此writer/recovery fallback可继续`abandon()`owner、lock与parent handles。
- Release状态验证通过：pre-owner timeout保持owner lock；post-owner timeout保持owner missing、lock directory exact empty；late rejection不触发unlink、owner recreation或rmdir。Committed writer record保持且返回fixed lifecycle timeout。
- Runtime新增4项测试，`test/audit.test.ts`共297项通过；CLI新增1项，`test/cliAudit.test.ts`共115项通过。CLI locked-revalidation timeout保持`not_started`、coordination lock acquired/released true、current/staging unchanged且不泄漏late reason。
- Compiled smoke从`dist/`执行真实rotation recovery，在committed action后的post-owner empty scan注入pending close；验证recovery/current/archive/staging commit保持、`coordination_lock_released:false`、exact residual path、owner missing、empty lock、bounded warning、successful handle abandonment与late rejection消费。完整CLI smoke通过。
- 全量`tools/check.sh`通过：Python 422项；TypeScript 43个test files、926项；TypeScript build、built integration与CLI smoke全部成功。
- 静态接口校验通过：source/dist各仅有一个lifecycle timeout constant、一个lifecycle marker assignment、一个generic lifecycle resource closer、一个primary-preserving lifecycle closer和一个lifecycle wrapper；marked child scanner不再进入raw close。Marker与helpers均未export，public `JsonlAuditFileLock`、CLI/protocol/environment、owner metadata和persistent schema未变化。
- 主README、项目计划、内部设计、架构、扩展点、安全与protocol文档已同步到Phase586，并在Phase583/585文档记录successful lifecycle stream与writer release衔接。
- 残留审计完成：workspace无`.tmp`、`.bak`、`.orig`或`.rej`；12个本轮测试遗留audit fixture的owner PID 642240、642387、656618与657853均已退出，随后按exact path执行`unlink`与`rmdir`。最终`/tmp`无Phase586、lifecycle stream timeout、smoke、integration、audit lock或staging残留，也无check、Vitest、pytest、engine或CLI进程。
