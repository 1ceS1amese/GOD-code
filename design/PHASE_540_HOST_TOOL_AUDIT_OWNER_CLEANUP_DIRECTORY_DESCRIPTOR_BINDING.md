# Phase540：Host tool audit owner cleanup directory descriptor binding

## 背景

Phase530、Phase532和Phase535都在destructive owner cleanup前重验directory dev/ino、owner file dev/ino、完整owner token与entry-set invariant。Phase539进一步证明，快速remove/recreate可能在部分filesystem上复用inode与timestamp；仅依靠path metadata不足以把mutation持续绑定到原directory object。

Phase540将Phase539的open-directory descriptor pinning推广到三条共享owner cleanup路径：

- `cleanupJsonlAuditFileLock(...)`；
- `cleanupJsonlAuditLockQuarantine(...)`；
- `cleanupJsonlAuditLockDisposal(...)`。

CLI command、fingerprint和report contract保持不变。

## Candidate Contract

Shared `JsonlAuditLockCleanupCandidate`除现有证据外增加：

- no-follow `O_DIRECTORY` file handle；
- BigInt directory device/inode/ctimeNs/birthtimeNs identity。

Candidate读取顺序：

1. lstat selected directory。
2. no-follow打开directory handle。
3. 绑定path lstat与descriptor fstat。
4. 在descriptor保持open时读取bounded owner metadata。
5. 验证owner fingerprint、owner file identity和single-entry invariant。
6. 最终再次绑定current path、directory descriptor和owner证据。

任何failure都关闭handle，不返回partial candidate。

初始selection要求path lstat与descriptor fstat的完整BigInt identity一致。进入事务后，rename、owner rename或owner unlink会合法改变directory ctime，因此连续性检查以持续打开的descriptor所绑定的device/inode为对象锚点，同时要求每次检查中的path lstat与前后两次descriptor fstat完整一致。由于原directory handle未关闭，原inode不能被释放并复用给replacement。

## Transaction Binding

### Main coordination lock cleanup

Descriptor从candidate selection开始保持open，跨越：

- pre-quarantine revalidation；
- `lockPath -> quarantine/lock` rename；
- quarantined path revalidation；
- owner isolation与old directory rmdir；
- rollback或post-commit result construction。

Rename后descriptor仍引用同一directory object，因此replacement不能冒充moved candidate。

### Owner-only quarantine cleanup

Descriptor绑定selected `<lock>.cleanup-<qid>`，跨越owner isolation、empty-root revalidation、rmdir和rollback。若original path被replacement，即使复制相同owner JSON，也不能匹配仍被descriptor引用的原directory。

### Owner-only disposal cleanup

Descriptor绑定selected `<lock>.cleanup-<qid>.dispose-<did>`，跨越source-absence revalidation、owner unlink commit和post-commit empty-root rmdir。提交前replacement拒绝；提交后仍沿用Phase535 residual reporting。

## Descriptor Lifecycle

- Candidate成功创建后由top-level transaction拥有handle。
- 所有success、error、rollback和residual return路径都在`finally`关闭handle。
- Handle不进入CLI report，不跨进程或跨command持久化。
- Rmdir前保持handle open；rmdir成功或transaction结束后关闭。

## Failure Semantics

- Path/descriptor identity mismatch：按现有`changed before cleanup`错误拒绝。
- Replacement复制相同owner metadata：仍因descriptor binding拒绝。
- Owner token/file identity或entry set drift：保持现有拒绝语义。
- Main lock rollback与quarantine restore继续优先保留未知对象。
- Phase535 owner unlink后的failure仍返回structured residual disposal path。

## Tests

- Main lock replacement复制相同owner metadata时拒绝且replacement保持。
- Owner-only quarantine replacement/extra-entry race不删除未知对象。
- Owner-only disposal replacement/source race保持原有拒绝与residual语义。
- Phase539 empty cleanup replacement tests继续通过，证明shared descriptor helper无回归。
- CLI dry-run/fingerprint/report contract不变。
- Built CLI integration与smoke保持通过。

## 边界

- 本阶段不改变owner fingerprint算法或CLI flags。
- 本阶段不新增cleanup eligibility。
- 本阶段不改变Phase533 recovery transaction；其root/nested/reservation descriptor binding留作独立阶段。
- 本阶段不判断PID liveness或age-based stale。
- 本阶段不递归删除unknown objects。

## 验收标准

- 三条owner cleanup mutation都由open directory descriptor绑定到原candidate。
- Descriptor跨rename和owner isolation保持有效，并在所有路径关闭。
- Replacement即使复用metadata或path也不能接收原confirmation。
- Existing rollback、commit point和residual reporting语义保持。
- Phase530至Phase539 CLI与report接口保持。
- TypeScript、Python、built integration与smoke全量回归通过。

## 实现结果

- 抽取通用no-follow `O_DIRECTORY` pinning helper，并保留Phase536/539 exact-empty完整identity/fingerprint语义。
- `JsonlAuditLockCleanupCandidate`持有原directory handle与BigInt identity，三条owner cleanup transaction均在top-level `finally`关闭handle。
- Main lock cleanup的handle跨lock rename、owner isolation、old directory rmdir和rollback保持有效。
- Owner-only quarantine与disposal cleanup在mutation前后重新绑定current path和原descriptor；复制相同owner metadata的replacement仍被拒绝且保持不变。
- 新增quarantine/disposal copied-owner replacement竞态测试；既有main-lock replacement和Phase536/539 empty replacement测试继续通过。
- CLI command、flag、fingerprint、human/JSON report和integration contract均未改变。
- 统一验收通过：Python 422项；TypeScript 43个test files、635项；TypeScript build、built CLI integration和CLI smoke全部通过。

## Phase541 后续

本阶段保留的Phase533 recovery descriptor binding已由Phase541完成：quarantine root、nested lock和coordination reservation现在都持有独立directory handle，且不改变Phase540三条owner cleanup transaction的CLI或report contract。

## Phase544 后续

Phase544在三条owner cleanup transaction的descriptor生命周期上增加post-syscall detachment proof。Selected directory rmdir和owner unlink只有在target path missing、original descriptor dev/ino一致且`nlink === 0`后才承认commit/contraction；wrong-object fake-success不会通过，既有rollback和residual report字段保持。

## Phase545 后续

Phase545补齐本阶段未覆盖的transaction-owned wrapper roots：main cleanup private quarantine与owner-only quarantine cleanup private disposal现在从creation后持续持有独立directory handle，按exact entry set绑定child lifecycle，并在rollback/final rmdir执行Phase544 detachment proof。Selected candidate handles和三条owner cleanup的既有commit/residual接口不变。

## Phase564 后续

Phase564让本阶段三个owner cleanup transaction及其private wrapper roots的exact-entry assertions统一复用2-entry descriptor-bound scanner。Overflow set不再被完整物化，且在owner unlink、rename或root rmdir前拒绝；directory/owner descriptors、fingerprint、commit、rollback和residual report contract保持。
