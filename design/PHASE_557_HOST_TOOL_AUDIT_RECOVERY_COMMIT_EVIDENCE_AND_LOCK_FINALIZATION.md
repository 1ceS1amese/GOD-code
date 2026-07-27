# Phase557：Host tool audit recovery commit evidence and lock finalization

## 背景

Phase556已经实现normal-lock-held rotation staging recovery，但outer lock lifecycle仍沿用writer transaction语义：operation成功后只要`release()`失败，整个runtime Promise就reject。

这对显式maintenance mutation会丢失关键事实。已验证场景中，`restore_previous_archive`已经完成generation commit，current与`.1`均处于desired state，empty staging因lock replacement保留；随后normal lock release拒绝，caller只收到`Audit file lock changed before release.`，无法从runtime或CLI判断mutation是否已经发生。重试operator可能据此做出错误假设。

Phase557保留Phase527的两条原则：lifecycle failure必须可见，pre-commit primary error不能被secondary finalization error覆盖；同时为已经得到确定operation result的路径保留commit evidence，并结构化报告candidate descriptor closure与coordination lock finalization状态。

## Runtime Result Contract

扩展`JsonlAuditRotationStagingRecoveryResult`：

```text
performedAction?: JsonlAuditRotationRecoveryAction
recoveryHandlesClosed: boolean
recoveryHandleWarning?: string
coordinationLockPath: string
coordinationLockReleased: boolean
residualCoordinationLockPath?: string
coordinationLockWarning?: string
```

规则：

- `performedAction`只在`mutationPerformed: true`时存在，并必须等于锁内重新分类且实际执行的action；missing no-op不伪造performed action。
- `recoveryHandlesClosed: true`只表示candidate generation、staging与parent handles全部close成功；close failure聚合到`recoveryHandleWarning`，不能覆盖已经得到的operation result。
- Candidate opening或pre-commit operation本身失败时，handle close仍以best effort执行，但close failure不能替换原primary error。
- `coordinationLockPath`始终是本次normal acquisition实际使用的derived path。
- `coordinationLockReleased: true`只表示`lock.release()`完整返回，包括owner unlink、lock directory contraction、detachment proof与lifecycle handle closure。
- Release失败时调用`abandon()`关闭仍持有的descriptors，但不把abandon解释为disk lock cleanup。
- Release失败后只对logical lock path执行bounded no-follow existence inspection；仍存在时输出`residualCoordinationLockPath`。Logical path missing不证明被移动的original lock不存在，因此`coordinationLockReleased`仍为false。
- Release、abandon或residual inspection错误聚合到`coordinationLockWarning`，不读取owner content、不输出token、不自动cleanup。

Existing staging/durability `warning`保持独立，避免把generation cleanup与coordination lifecycle混为同一字段。

## Outcome Preservation

Recovery wrapper按以下顺序结束：

1. Candidate operation得到确定mutation result或捕获primary error；
2. Candidate generation/staging/parent handles全部best-effort close并形成closure outcome；
3. 在normal lock内得到完整`JsonlAuditRotationStagingRecoveryResult`，或继续保留primary operation error；
4. 无论哪条路径都尝试一次`release()`；
5. 仅在release失败时调用一次`abandon()`；
6. release失败时检查logical lock path是否仍存在；
7. operation已返回result时，将descriptor与lock finalization outcome合并后resolve；
8. operation已throw时，继续throw原primary error，handle close/release/abandon failure不能替换它。

因此：

- generation commit、post-commit staging residue或missing no-op的事实不会因release failure丢失；
- release failure仍通过`coordinationLockReleased: false`和warning显式可见；
- pre-commit validation/mismatch/rollback error仍保持reject contract；
- runtime不把uncertain lock state伪报为clean success。

## CLI Contract

`audit_rotation_staging_recovery` mutation details新增：

```text
performed_action
recovery_handles_closed
recovery_handle_warning
coordination_lock_released
residual_coordination_lock_path
coordination_lock_warning
```

Mutation mode还必须始终投影`coordination_lock_path`，而不是只在dry-run readiness中显示。

Status规则：

- clean missing no-op：OK；
- clean completed mutation：OK；
- staging residue、durability uncertainty、recovery handle close failure、coordination lock release failure或lock warning：WARN；
- validation、expectation mismatch、pre-commit failure或uncertain rollback：ERROR。

WARN report保持`ok: true`，但message明确要求检查residual staging/coordination lock与durability。CLI不得在已提交mutation后退回默认`mutation_performed: false` error details。

## Tests

- 三类clean action均输出exact `performedAction`与`coordinationLockReleased: true`。
- Missing no-op不输出`performedAction`，但输出clean lock finalization。
- Generation commit后copied-owner lock replacement不再覆盖result；current、`.1`、staging residue、performed action与lock residual同时可观察。
- Generation commit后candidate handle close rejection不再覆盖result，并输出`recoveryHandlesClosed: false`。
- Pre-commit primary error叠加candidate close rejection时仍传播原error。
- Empty cleanup commit后的release failure保留`stagingRemoved: true`和lock warning。
- Release failure后logical lock missing时不伪造residual path，仍保持released false。
- Release失败后的abandon failure与lstat failure进入bounded warning，不throw secondary error。
- Pre-commit primary error叠加release failure时仍传播原error。
- CLI clean/missing/lock-warning human与JSON mapping完整。
- Built smoke断言clean mutation的performed action、coordination lock path与released状态。
- Phase553-556 runtime/CLI contracts保持。

## 边界

- 不自动清理release failure留下或移动到未知位置的lock object。
- 不把logical lock path missing解释为original lock已安全删除。
- 不改变JsonlAuditFileLock public methods或owner metadata schema。
- 不把FileHandle close warning解释为filesystem namespace rollback authority。
- 不读取staging/archive/audit content，也不输出owner token。
- 不新增JSON-RPC、agent event、provider、tool result、transcript或persistent metadata字段。
- 本阶段只修复rotation staging recovery result finalization，不改变normal JsonlAuditSink record在successful transaction后release failure时reject的Phase527语义。

## 验收标准

- 已知operation result不能被后续lock release failure覆盖。
- 已知operation result不能被candidate descriptor close failure覆盖。
- Clean release与uncertain release具有稳定、不可混淆的结构化字段。
- `performedAction`只对应真正执行并通过generation postcondition的action。
- Pre-commit primary error仍优先，secondary lifecycle failure不替换。
- CLI对committed mutation加lock residue返回WARN并保留mutation evidence。
- Phase553-556定向回归、TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- `/tmp`与workspace无正常测试残留或FileHandle GC warning。

## 实现结果

- 已用built runtime稳定复现旧行为：`restore_previous_archive`完成current/`.1` generation commit后，copied-owner lock replacement使outer release抛出`Audit file lock changed before release.`；staging与两代文件已经改变，但caller得不到mutation result。Phase557后同一probe返回`performedAction: restore_previous_archive`、`mutationPerformed: true`、`recovered: true`、staging residue与`coordinationLockReleased: false`，不再丢失commit evidence。
- `JsonlAuditRotationStagingRecoveryResult`新增`performedAction`、`recoveryHandlesClosed`、`recoveryHandleWarning`、`coordinationLockPath`、`coordinationLockReleased`、`residualCoordinationLockPath`和`coordinationLockWarning`。Missing no-op不输出performed action；三个真实action只在锁内operation返回确定mutation outcome后投影actual action。
- Candidate generation/staging/parent handles改为all-settled finalization。Operation成功时close rejection转为structured warning；operation或candidate-open validation失败时best-effort close不替换primary error。Shared pinned mutation directory opener也改为在validation failure时保留原error，而不是被secondary close rejection覆盖。
- Outer recovery wrapper先捕获operation result/error，再只调用一次normal lock `release()`。Release失败后才调用`abandon()`，随后对logical lock path执行no-follow `lstat`；existing path映射为residual，missing不伪造residual但released仍保持false，release/abandon/inspection errors聚合为独立warning。Pre-commit primary error继续优先。
- CLI `audit_rotation_staging_recovery` mutation details新增`performed_action`、`recovery_handles_closed`、`recovery_handle_warning`、`coordination_lock_released`、`residual_coordination_lock_path`和`coordination_lock_warning`，并在mutation mode始终投影derived lock path。Known mutation/no-op加resource uncertainty返回WARN且`ok: true`；validation和pre-commit error仍返回ERROR。
- 新增7项runtime tests，覆盖三类clean performed action、clean missing no-op、post-commit copied-owner lock replacement、candidate close warning、candidate-open/operation primary error优先、empty cleanup lock contraction failure、post-rmdir missing logical lock、abandon与residue inspection warning聚合。新增2项CLI tests，覆盖candidate handle warning与coordination lock residual的human/JSON projection。定向回归通过：`audit.test.ts` 181项、`cliAudit.test.ts` 58项，共239项；TypeScript build通过。
- Built CLI smoke已扩展clean missing与真实empty cleanup断言，验证performed action、candidate handle closure、derived coordination lock path和clean release状态。统一验收通过：Python 422项；TypeScript 43个test files、753项；TypeScript build、built CLI integration和CLI smoke全部通过。
- README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase527/543/556历史边界已同步。JsonlAuditFileLock public methods、owner schema、normal writer release rejection、JSON-RPC、agent event、provider、tool result、transcript和persistent schema未变化。
- `/tmp`无`god-code-audit-*`、`god-code-phase557-*`、`.god-code-audit-rotation-*`或`god-code-smoke.*`残留；workspace无staging directory及`.tmp`、`.bak`、`.orig`或`.rej`文件，验收输出无FileHandle GC warning。

## Phase558 后续加固

Phase558保持本阶段resolved result/WARN contract不变，并把operation rejection也纳入同一outcome-preserving lifecycle envelope。Public typed error先固定primary stage、mutation/rollback state，再合并candidate handle closure与coordination lock release/abandon/residual fields；secondary finalization failure仍不得替换primary message。Clean/uncertain committed result继续走Phase557 result fields，只有post-validation reject进入Phase558 failure fields。

## Phase559 后续加固

Phase559修正本阶段`recoveryHandlesClosed`的descriptor全集：candidate pinned opener在open成功、return前validation失败时将unreturned handle显式handoff给outer all-settled finalizer。Returned与failed-open handles去重后只关闭一次，nested close rejection因此进入既有warning而不再被吞掉。Result/WARN fields、typed failure fields与coordination lock finalization规则均不新增字段。

## Phase560 后续加固

Phase560修正本阶段all-settled实现的invocation timing：每个`handle.close()`先进入async wrapper，故同步throw也成为独立rejection，不能在Promise数组构造阶段截断其余handles或覆盖operation outcome。Committed result继续使用本阶段WARN fields，primary failure继续由Phase558 typed error承载；同步与异步close failure共享相同warning contract。

## Phase561 后续加固

Phase561保证本阶段warning construction本身也是outcome-preserving boundary。Arbitrary close/lock reason的message getter或string coercion失败时使用固定fallback，控制字符被单行化且summary有界；formatter failure不能重新覆盖committed result或primary error。Existing lifecycle fields、status rules和raw cause isolation保持不变。

## Phase576 后续加固

Phase576把本阶段为rotation recovery建立的“operation outcome优先、secondary finalization结构化”原则扩展到五类lock cleanup和pre-commit quarantine recovery。Maintenance result使用独立cleanup/recovery closure fields；candidate-existing close failure保留commit、rollback residual与fingerprint evidence，CLI返回WARN。Rotation staging recovery原有fields、lock release/abandon envelope和typed failure contract不变。

## Phase577 后续加固

Phase577继续复用本阶段typed failure模式，为maintenance rejection新增operation identifier、closure boolean和bounded warning。与rotation recovery一样，primary message/cause保持，secondary finalization只追加evidence；maintenance CLI ERROR复用Phase576 fields。Rotation staging recovery error/details与lock finalization contract不变。
