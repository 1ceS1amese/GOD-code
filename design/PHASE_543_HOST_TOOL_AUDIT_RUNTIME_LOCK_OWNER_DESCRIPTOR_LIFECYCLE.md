# Phase543：Host tool audit runtime lock owner descriptor lifecycle

## 背景

Phase542已经让所有owner-bearing cleanup/recovery transaction在selection后持续持有原`owner.json` descriptor，并让runtime release重新pin current owner后绑定acquisition snapshot。但runtime lock acquisition仍会在写入完成后关闭creation handle，直到`release()`开始才重新打开owner file。

这留下一个极端但真实的对象连续性边界：在完整持锁周期内，如果`owner.json`被remove/recreate且filesystem复用了inode和全部可见timestamp metadata，仅凭release-time snapshot无法证明当前path仍是acquisition创建的原file object。

直接保留creation handle会改变资源生命周期。调用方除了成功`release()`外，还必须能够在决定保留磁盘lock residue时显式关闭descriptor，不能依赖`FileHandle`垃圾回收。

本阶段覆盖：

- acquisition-time owner descriptor retention；
- runtime `release()`直接复用原descriptor；
- 显式`abandon()`资源终止接口；
- release/abandon并发串行化；
- failed acquisition cleanup与`JsonlAuditSink.record()`调用点适配。

CLI、owner schema、fingerprint、inspection、cleanup/recovery command和report contract保持不变。

## Runtime Lock Lifecycle Contract

`JsonlAuditFileLock`增加：

```ts
abandon(): Promise<void>;
```

状态机只有三个稳定状态：

- `held`：磁盘lock仍由对象负责，owner descriptor保持打开；
- `released`：owner entry和lock directory已按既有release contract删除，descriptor已关闭；
- `abandoned`：descriptor已关闭，但方法没有修改任何磁盘entry。

行为约束：

- `release()`成功后重复调用保持幂等；
- `abandon()`在`held`状态只关闭descriptor，不unlink owner、不rmdir lock；
- `abandon()`重复调用以及在`released`后调用保持幂等；
- `release()`在`abandoned`后必须拒绝，避免把“资源已关闭”误报为“磁盘lock已释放”；
- failed `release()`保持`held`，允许调用方重试或显式`abandon()`；
- release与abandon通过per-lock promise tail串行，不能在validation/mutation中途关闭descriptor。

## Acquisition-Time Owner Binding

Owner creation helper成功时不再关闭`O_EXCL | O_NOFOLLOW` creation handle，而是返回完整`JsonlAuditLockPinnedOwnerMetadata`：

- original `FileHandle`；
- BigInt device/inode/ctimeNs/birthtimeNs/mtimeNs/size identity；
- canonical parsed metadata。

Acquisition返回lock前再次要求：

- lock directory仍匹配acquisition dev/ino；
- directory entry set严格为单一`owner.json`；
- current owner path、original descriptor、完整file snapshot和metadata保持一致。

因此成功返回的runtime lock从创建点开始就持有原owner object edge。

## Release Transaction

`release()`不再调用shared reader重新打开current owner。它直接使用acquisition-time pinned owner执行：

1. 重验lock directory identity；
2. 重验current owner path仍指向original descriptor；
3. 重验完整owner metadata和single-entry invariant；
4. 再次绑定owner path后unlink；
5. 按既有empty-directory gate执行rmdir；
6. 标记`released`并关闭owner handle。

如果owner已成功unlink但lock directory contraction失败，既有`ownerRemoved`重试语义保留；descriptor继续由lock object持有，直到release重试成功或调用方abandon。

## Failed Acquisition And Sink Ownership

- Acquisition在owner创建后失败时，cleanup优先复用original owner handle；只有creation helper未能返回handle时才使用Phase542 shared pinned reader做最窄fallback。
- Failed acquisition cleanup负责关闭其持有的owner handle，不把资源转交给调用方。
- `JsonlAuditSink.record()`在release失败后显式调用`abandon()`，同时保持原有错误优先级：成功write暴露release error，失败write不被release/abandon error覆盖。
- Low-level API调用方若故意保留或外部清理磁盘lock，必须调用`abandon()`结束本进程descriptor ownership。

## Tests

- Runtime release在acquisition后禁止再次`fs.open`时仍成功，证明复用creation handle而不是release-time re-pin。
- `abandon()`保留owner file和lock directory，重复调用幂等。
- `release()`在abandon后拒绝，且后续显式cleanup仍可按fingerprint删除residue。
- Concurrent release/abandon由调用顺序确定并保持单一稳定终态。
- Existing owner token drift、copied-owner replacement、directory replacement和release idempotency测试保持通过。
- Cleanup/recovery测试中的low-level lock对象在外部mutation结束后显式release或abandon，不产生FileHandle GC warning。
- TypeScript、Python、built integration和CLI smoke全量回归通过。

## 边界

- 本阶段不改变owner schema、fingerprint算法、CLI flags或public report字段。
- `abandon()`不是force release，不删除、不rename、不恢复任何entry，也不证明owner liveness。
- 本阶段只固定runtime owner file object；cleanup/recovery directory descriptor graph继续由Phase540/541管理。
- 最终validation与path-based`unlink`/`rmdir`之间仍有用户态窗口。纯Node当前没有本阶段可采用的dir-relative `unlinkat`/`renameat2` primitive；不引入native addon或平台专用helper。
- 进程崩溃仍可能留下lock directory；显式lifecycle只约束正常控制流。
- Open owner file的rename/unlink行为仍取决于Node和目标filesystem的sharing semantics，既有cross-platform CI是兼容性依据。

## 验收标准

- 成功acquisition返回后，original owner handle持续打开直到release或abandon完成。
- Runtime release不重新打开owner path，并始终把mutation gate绑定到acquisition-time descriptor和metadata。
- 所有正常、失败和并发lifecycle路径最多关闭同一handle一次且不发生use-after-close mutation。
- `abandon()`不修改filesystem，release-after-abandon明确拒绝。
- Failed acquisition和`JsonlAuditSink.record()`不遗留未管理的owner handle。
- Phase529至Phase542 inspection、cleanup、recovery、rollback和residual语义保持。
- 全量统一验收通过且无FileHandle GC warning或audit temp residue。

## 实现结果

- `JsonlAuditFileLock`新增`abandon()`；per-lock promise tail串行化release与abandon，successful terminal operations保持幂等，release-after-abandon明确拒绝。
- Owner creation helper成功时返回仍打开的`JsonlAuditLockPinnedOwnerMetadata`。Acquisition在返回前重验directory identity、single-entry layout和owner path/descriptor snapshot。
- Runtime release直接复用creation handle完成metadata/path gate、owner unlink和empty-directory contraction，不再调用shared reader重新打开owner path。
- Failed acquisition cleanup优先使用original handle；creation helper未返回handle时仍保留Phase542 shared pinned-reader fallback。
- `JsonlAuditSink.record()`在release成功或失败后统一调用abandon终止descriptor ownership，同时保持transaction error优先级。
- Audit与CLI audit测试统一追踪low-level lock资源并在teardown显式abandon；新增no-reopen release、abandon filesystem invariance和concurrent lifecycle serialization三项测试。
- 定向audit回归通过：2个test files、131项，无FileHandle GC warning。
- 统一验收通过：Python 422项；TypeScript 43个test files、645项；TypeScript build、built CLI integration和CLI smoke全部通过。
- `/tmp`下无`god-code-audit-*`临时残留。

## Phase544 后续加固

Phase544让runtime lock同时长期持有lock-directory descriptor。Release在owner unlink和directory rmdir后分别要求original handle dev/ino一致、target path missing且`nlink === 0`，两个postcondition通过后才进入released；abandon与failed acquisition cleanup统一关闭owner/directory handles。Phase543 `abandon()`接口与串行状态机保持不变。

## Phase547 后续加固

Phase547让runtime holder再持有lock parent descriptor。Acquisition通过parent anchor exact-create reservation并从actual mutation path固定lock directory，owner从lock-directory anchor exclusive-create；release通过lock/parent anchors执行unlink/rmdir，failed acquisition和abandon统一关闭三handles。Phase543 lifecycle API与状态机保持。

## Phase550 后续加固

Phase550把owner handle ownership transfer提前到metadata write之前。O_EXCL create和initial fstat成功后，`created_pending` descriptor立即归outer acquisition管理；write、snapshot或path gate失败时，failed acquisition cleanup可用same handle验证并删除本次zero-byte/partial owner。成功路径仍把same handle提升为本阶段定义的persisted runtime owner lifecycle。

## Phase557 后续加固

Phase557在显式rotation recovery wrapper中严格区分`release()`与fallback `abandon()`：只调用一次release，失败后才abandon仍持有的descriptors。Operation result已确定时，两者的failure进入structured lock finalization warning；operation已失败时secondary lifecycle error不覆盖primary。该变化不修改本阶段per-lock state machine、idempotence、release-after-abandon拒绝或normal JsonlAuditSink record rejection语义。

## Phase558 后续加固

Phase558让显式rotation recovery在operation reject时也保留本阶段descriptor lifecycle outcome。Candidate/operation primary stage与mutation state先确定，随后`release()`、必要时的`abandon()`及logical residual inspection只追加`coordinationLockReleased`、residual path和warning；它们不能改写primary message。Acquisition未成功时不调用本阶段lifecycle methods，也不声称foreign lock是本次residual。Per-lock serialization、handle ownership、terminal state与normal writer semantics保持不变。

## Phase559 后续加固

Phase559把相同的显式ownership原则应用到recovery candidate directory descriptors：open成功但helper return前validation失败的handle不再由nested catch close-and-forget，而是handoff给outer candidate finalizer。该handoff与本阶段lock owner lifecycle相互独立，但共享“单一owner、恰好一次finalization、secondary error不覆盖primary”的约束；public lock API、owner handle state machine与normal writer语义不变。

## Phase560 后续加固

Phase560进一步保证candidate multi-handle finalization的每次close invocation先返回独立Promise；同步throw不能阻止其他handles进入close。该normalization复用本阶段“secondary lifecycle error不得覆盖primary”的原则，但不改变lock owner release/abandon state machine、public methods或normal writer语义。

## Phase576 后续加固

Phase576把相同的result-preserving lifecycle原则扩展到五类maintenance cleanup与quarantine recovery的candidate/parent/private handles。Shared normalized close invocation进入新的non-throwing all-settled finalizer；resolved operation附加closure evidence，primary rejection保持原错误。Normal writer lock的release/abandon state machine、长期owner/directory/parent ownership与本阶段public lifecycle API不变。

## Phase577 后续加固

Phase577把maintenance candidate ownership handoff后的rejection也接入typed lifecycle envelope。Candidate reader与outer operation分别关闭自身owned handles，existing envelope可跨outer finalizer合并；同步throw不截断后续close。Normal writer acquisition/release/abandon state machine及本阶段public lock API保持。
