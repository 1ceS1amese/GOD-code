# Phase541：Host tool audit quarantine recovery directory descriptor binding

## 背景

Phase533为`lock_with_owner`与`lock_and_owner`建立了atomic coordination reservation、identity-bound owner transfer、pre-commit rollback和post-commit residue reporting。其directory evidence仍主要依赖current path的number dev/ino。Phase539/540已经证明，持续打开的no-follow directory descriptor才能把后续mutation稳定绑定到原directory object，并避免快速remove/recreate与metadata复制造成path-only误认。

Phase541补齐Phase540明确保留的recovery边界：

- selected quarantine root；
- nested `lock` directory；
- atomic `mkdir`创建的coordination lock reservation。

CLI command、owner fingerprint、eligible layout、commit point和report contract保持不变。

## Recovery Candidate Contract

`JsonlAuditLockQuarantineRecoveryCandidate`除layout、owner location、owner identity/token/fingerprint外，持有两个pinned directory对象：

- quarantine root的no-follow `O_DIRECTORY` handle与BigInt identity；
- nested `lock`的no-follow `O_DIRECTORY` handle与BigInt identity。

Candidate selection顺序：

1. no-follow pin quarantine root，并绑定path lstat与descriptor fstat。
2. no-follow pin nested `lock`，并完成相同绑定。
3. 在两个handle保持open时读取root/nested entry set。
4. 选择`lock_with_owner`或`lock_and_owner` owner位置。
5. bounded读取owner metadata并验证fingerprint、owner file identity和完整token。
6. 再次验证两个current path与各自descriptor、entry set和owner evidence。

任何selection failure都关闭已经打开的全部handle。

## Reservation Binding

Recovery继续使用`mkdir(lockPath, 0700)`作为no-replace reservation primitive。`mkdir`成功后立即：

1. no-follow打开reservation directory descriptor；
2. 绑定path/descriptor BigInt identity；
3. 要求reservation仍为空；
4. 在owner transfer、commit validation、rollback和result construction期间保持handle open。

若`mkdir`成功但descriptor无法安全绑定，命令不继续owner transfer，并沿用现有语义保留coordination entry供人工检查。Node.js的`mkdir`不会原子返回directory descriptor，因此极短的mkdir-to-open interval仍属于平台API边界；本阶段不通过降低existing-entry保护或覆盖path来规避该限制。

## Transaction Binding

### Owner transfer

Owner rename前后均要求：

- quarantine root path仍绑定root descriptor；
- nested lock path仍绑定nested descriptor；
- coordination lock path仍绑定reservation descriptor；
- owner identity/token与layout entry set符合当前事务阶段。

Directory ctime会因owner rename合法变化，因此与Phase540一致：candidate continuity使用持续打开handle固定的device/inode；每次gate中的path lstat与前后descriptor fstat仍要求完整BigInt snapshot一致。Open handle阻止原inode在事务期间被释放复用。

### Pre-commit rollback

- Owner已转移时，只有reservation、root和nested path仍分别绑定原descriptor才允许把owner rename回原layout。
- Reservation只有在descriptor-bound且exact-empty时才rmdir。
- Reservation path missing时，只有descriptor证明原directory已经unlinked才视为removed；被rename到未知位置不等价于安全删除。
- Extra entry、replacement或无法验证的destination全部保留并沿用structured residual/error语义。

### Post-commit quarantine contraction

Recovery commit后：

1. 使用root/nested descriptors验证旧quarantine为root只含empty nested `lock`。
2. 保持nested handle open执行nested rmdir。
3. 再次使用root handle验证root exact-empty。
4. 保持root handle open执行root rmdir。

失败仍返回`residual_quarantine_path`，不会回滚已经成立的coordination lock。

## Descriptor Lifecycle

- Candidate selection成功后，top-level recovery transaction拥有root/nested handles。
- Reservation pin成功后，同一transaction拥有reservation handle。
- Success、pre-commit error、rollback result、post-commit residue和exception路径都在`finally`关闭全部handles。
- Handle不进入CLI report，不跨command或跨进程持久化。

## Failure Semantics

- Root或nested replacement即使复制相同layout与owner metadata，仍因path/descriptor mismatch拒绝。
- Recovered-lock replacement即使复制相同owner metadata，仍不能通过reservation descriptor gate。
- Owner drift、entry-set drift、occupied coordination path与fingerprint mismatch保持Phase533语义。
- Rollback只恢复可证明属于原candidate的owner destination，不删除unknown entry。
- Post-commit cleanup failure继续报告residual quarantine，不撤销recovered lock。

## Tests

- Quarantine root在reservation前被copied-layout replacement时拒绝并保留两者。
- Nested lock在reservation前被copied-owner replacement时拒绝并保留两者。
- Reservation在owner transfer后被copied-owner replacement时拒绝，未知coordination entries全部保留。
- 两类正常recovery、occupied path、fingerprint mismatch、reservation race和extra-entry rollback继续通过。
- Phase540 owner cleanup与Phase539 empty cleanup descriptor tests无回归。
- Built CLI integration与smoke contract不变。

## 边界

- 本阶段不改变Phase533 CLI flags、fingerprint或eligible layouts。
- 本阶段不判断owner PID liveness或age-based stale。
- 本阶段不增加recursive cleanup、background recovery或batch mutation。
- 本阶段不引入native addon、`openat2`或平台专用mkdir-and-open syscall。
- Owner file本身仍沿用bounded parser、dev/ino和完整token evidence；独立owner file descriptor pinning留作后续评估。

## 验收标准

- Root、nested和reservation三类directory mutation均由open descriptor绑定。
- Handles跨owner transfer、rollback与post-commit contraction保持有效并在所有路径关闭。
- Copied-metadata replacement不能接收已选recovery transaction。
- Atomic no-replace reservation、commit point、rollback和residual reporting语义保持。
- Phase530至Phase540 CLI与report接口保持。
- TypeScript、Python、built integration与smoke全量回归通过。

## 实现结果

- `JsonlAuditLockQuarantineRecoveryCandidate`现在持有quarantine root与nested `lock`两个pinned directory对象，selection failure会关闭已打开的全部handles。
- Atomic `mkdir`成功后立即no-follow pin recovered-lock reservation，并在owner transfer、commit validation、rollback、post-commit cleanup和result construction期间保持handle open。
- Owner transfer前后、rollback owner restore和旧quarantine contraction全部改用shared path/descriptor snapshot gate。
- Rollback只rmdir descriptor-bound exact-empty reservation；path missing时额外要求descriptor `nlink === 0`，不会把被rename到未知位置的directory误报为removed。
- Top-level recovery在`finally`并行关闭root、nested和reservation handles，覆盖success、exception、rollback result与residual return。
- 新增root copied-state replacement、nested copied-owner replacement和recovered-lock copied-owner replacement三项竞态测试，未知对象均保持。
- CLI command、flags、fingerprint、eligible layout、commit point和human/JSON report未改变。
- 统一验收通过：Python 422项；TypeScript 43个test files、638项；TypeScript build、built CLI integration和CLI smoke全部通过。

## Phase542 后续

Phase542已为recovery candidate补充pinned owner regular-file handle，使Phase541的root、nested、reservation三目录descriptor graph扩展为包含owner file的四对象transaction graph；Phase541 CLI与rollback/residual语义保持不变。

## Phase544 后续

Phase544把reservation rollback与post-commit nested/root rmdir从pre-syscall path binding扩展为post-syscall detachment proof。每个open directory handle都必须在target missing时显示original dev/ino且`nlink === 0`；fake-success replacement rmdir不会被当作reservation removed或contraction complete。

## Phase547 后续

Phase547把Phase541的directory graph补上shared parent，并把reservation exact mkdir、owner transfer/restore、rollback reservation rmdir及post-commit nested/root contraction接入descriptor-relative mutation adapter。Graph identity、detachment proof、commit和residual semantics不变。

## Phase564 后续

Phase564在Phase541的quarantine root、nested lock和recovered reservation descriptors之上增加shared bounded child scanner。Initial classification与所有exact-entry revalidation最多保留2个names并读取一个sentinel；truncated candidate不转移owner，truncated reservation不收缩。Descriptor graph、rollback和residual semantics保持。
