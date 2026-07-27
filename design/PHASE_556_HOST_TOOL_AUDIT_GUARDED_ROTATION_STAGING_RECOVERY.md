# Phase556：Host tool audit guarded rotation staging recovery

## 背景

Phase555已经能把target-bound selected rotation staging、current、`.1`和coordination lock组合成稳定recovery graph，并为三类safe action生成32-hex action-bound fingerprint。但readiness只证明某一瞬间的候选状态，不能直接授权后续namespace mutation。

Phase556增加显式、锁内、fingerprint-confirmed recovery transaction。Mutation必须获取normal coordination lock，在锁内重新读取全部objects、重新分类action、重新计算fingerprint，并把operator显式提供的action与fingerprint同时匹配后才可执行。

## Runtime API

新增：

```text
recoverJsonlAuditRotationStaging(
  filePath,
  stagingId,
  expectedAction,
  expectedRecoveryFingerprint,
  options?
)
```

`stagingId`仍只接受exact六字符ASCII alphanumeric。`expectedAction`只接受：

- `cleanup_empty_staging`
- `restore_previous_archive`
- `rollback_full_rotation`

Fingerprint必须是exact 32字符lowercase hexadecimal。Invalid ID、action、fingerprint或durability在任何filesystem访问前拒绝。

## Coordination Contract

Mutation与normal JSONL writer共享：

- resolved absolute audit path的in-process serialization key；
- same-user derived filesystem coordination lock；
- 5000ms default timeout与10ms retry；
- acquisition-time parent、lock directory和owner file descriptor ownership。

Lock acquisition后，runtime通过内部held-lock assertion重复验证：

- lifecycle仍为held；
- lock path仍绑定original directory descriptor；
- directory仍只含original `owner.json`；
- owner path、descriptor、full metadata和token仍一致。

Phase555 public inspector仍把任何existing lock视为blocking。Phase556使用内部held mode：当前调用方持有并验证的normal lock可绕过`coordination_lock_present`分类，但fingerprint算法完全不变，仍必须匹配lock取得前由Phase555输出的值。

## Locked Graph Revalidation

Fingerprint匹配不是一次性check。Runtime在锁内：

1. 读取current、`.1`、selected staging root/entry set/optional `previous`；
2. 按Phase555相同规则分类并计算fingerprint；
3. 匹配operator提供的expected action和fingerprint；
4. 打开并固定generation parent、selected staging directory以及action需要的current或rotated generation descriptor；
5. 以full BigInt snapshots和exact entry set再次验证candidate；
6. 在第一个namespace syscall前再次assert held lock。

任何missing/existing转换、metadata drift、parent replacement、wrapper replacement、generation replacement、extra entry、lock replacement或fingerprint mismatch均在mutation前拒绝。

## Action Transactions

### cleanup_empty_staging

初始shape：stable private exact-empty staging；current/rotated组合可为任意stable状态。

Transaction：

1. pin generation parent与selected staging directory；
2. 重验root full snapshot与exact empty entry set；
3. 从parent descriptor只rmdir selected basename；
4. 要求logical staging path missing、original descriptor identity不变且`nlink === 0`；
5. POSIX full同步generation parent。

该action不修改current或`.1`。

### restore_previous_archive

初始shape：valid current、missing `.1`、private `previous_only` staging。

Transaction：

1. pin current descriptor、generation parent和staging root；
2. 重验current full snapshot、`.1` missing、previous full snapshot和exact entry set；
3. 从staging descriptor把`previous` rename到parent `.1`；
4. 要求current仍绑定original descriptor、`.1`绑定staged previous object、staging exact empty；
5. generation graph确认后进入commit，不再回滚已恢复archive；
6. 收缩empty staging wrapper。

Rename后、generation commit前的callback或validation failure只有在current、`.1`、staging和previous object都可证明时才把`.1`移回`staging/previous`。Rollback不能证明时保留当前state并返回明确error。

### rollback_full_rotation

初始shape：missing current、valid `.1`、private `previous_only` staging。

Transaction：

1. pin `.1` descriptor、generation parent和staging root；
2. 把`.1` rename回current，并验证original generation descriptor；
3. 把staged `previous` rename到`.1`；
4. 验证current、restored `.1`和empty staging；
5. generation graph确认后进入commit；
6. 收缩empty staging wrapper。

第二步后、第四步前失败时执行reverse-order rollback：若previous已移出则先移回staging，再把current移回`.1`。每一步都要求descriptor/snapshot/path/entry-set证明；无法证明时不猜测、不删除unknown object。

## Commit、Residual 与 Durability

Generation commit point是desired current/`.1` graph及empty staging均通过postcondition之后。

- Commit前失败：尝试恢复initial namespace shape；成功后传播original error。
- Commit后失败：不回滚已恢复generation/archive。
- Empty wrapper删除失败：返回`recovered: true`、`staging_removed: false`和`residual_staging_path`；后续重新inspection应得到`cleanup_empty_staging`。
- Wrapper已删除但final full parent sync失败：返回`recovered: true`、`staging_removed: true`、`durability_completed: false`。

Durability规则：

- `buffered`和`data`不增加directory sync，logical postconditions完成后`durability_completed: true`；
- POSIX `full`在previous移出后同步staging directory，并在最终wrapper状态确定后同步generation parent；
- Windows `full`保持namespace file-only policy，不执行directory sync；
- staging sync失败时保留empty wrapper，避免丢失未确认的source-directory evidence；
- parent sync失败不伪报durability完成。

## Result Contract

Runtime result包含：

- file、rotated与staging paths；
- staging ID；
- requested/performed action；
- matched recovery fingerprint；
- `existed`；
- `recovered`；
- `mutationPerformed`；
- `stagingRemoved`；
- selected durability与`durabilityCompleted`；
- optional `residualStagingPath`与post-commit warning。

Selected staging在锁内已missing时返回idempotent no-op result，不执行mutation。Stable但不eligible、action mismatch或fingerprint mismatch返回error。

## CLI Contract

新增：

```text
god-code audit recover-rotation-staging <staging-id> [--dry-run] [--json]
god-code audit recover-rotation-staging <staging-id> \
  --yes \
  --expect-action <action> \
  --expect-recovery <fingerprint> \
  [--json]
```

无`--yes`时等价dry-run并复用Phase555 readiness。Mutation mode必须同时提供`--expect-action`和`--expect-recovery`；`--dry-run`与`--yes`互斥。

Report name：`audit_rotation_staging_recovery`。

Dry-run输出current assessment、recommended action和fingerprint，固定`mutation_performed: false`。Mutation成功输出performed action、recovered、staging removed、durability和residual fields。Missing为OK no-op；eligible dry-run为WARN；完整mutation为OK；post-commit residual或durability uncertainty为WARN；validation、mismatch、pre-commit failure或uncertain rollback为ERROR。

## Tests

- 三类action的dry-run fingerprint可在normal lock内exact重算并执行。
- Wrong action、wrong fingerprint、invalid casing/length和stale graph在任何namespace syscall前拒绝。
- Existing cooperative writer使mutation有界等待，随后在锁内重新验证；timeout不删除lock或staging。
- In-process writer/recovery使用同一serialization key。
- Parent、staging root、previous、current、rotated和lock replacement均fail closed。
- Cleanup只删除selected exact-empty private wrapper，并验证descriptor detachment。
- Archive restore保持current bytes/object，恢复opaque previous entry且不读取content。
- Full rollback按`.1 -> current`、`previous -> .1`顺序完成。
- 两步rollback在first/second rename后注入failure时按reverse order恢复或明确保留residue。
- Post-commit wrapper failure返回cleanup residue；retry使用新fingerprint。
- Buffered/data/full sync ordering与failure result正确。
- Wrong-object fake-success rmdir/rename不会被报告为成功。
- CLI enabled/disabled、dry-run/yes、human/JSON、parser/help/status和smoke完整。
- Existing Phase553 runtime rotation及Phase554/555 inspectors保持。

## 边界

- 不读取或解析JSONL record、current、`.1`或`previous`内容。
- 不恢复Phase553 legacy unscoped staging。
- 不接受任意generation/staging/lock path。
- 不自动清理unknown、ambiguous或active foreign lock state。
- 不将fingerprint视为secret、liveness proof或跨target authority。
- 不新增JSON-RPC、agent event、provider、tool result或persistent metadata字段。

## 验收标准

- 三类safe action必须在normal lock、exact action和exact fingerprint三重条件下执行。
- Mutation从candidate pinning到commit/rollback使用descriptor-relative或path/descriptor fallback gate。
- Pre-commit failure可恢复initial shape，无法证明时保留evidence且不误删。
- Post-commit residue和durability uncertainty通过结构化result暴露。
- Runtime/CLI不读取audit/archive content，不泄露lock token。
- Phase553-555 contracts、TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- 无正常路径staging residue、临时残留或FileHandle GC warning。

## 实现结果

- 新增`JsonlAuditRotationStagingRecoveryOptions`、`JsonlAuditRotationStagingRecoveryResult`与`recoverJsonlAuditRotationStaging(filePath, stagingId, expectedAction, expectedRecoveryFingerprint, options?)`。Action、exact六字符ID、32 lowercase hex fingerprint和durability均在进入filesystem mutation前校验；missing selected staging返回幂等no-op。
- Phase555 recovery inspector拆为shared graph reader与classifier。Public read-only API/report保持原contract；Phase556在normal lock holder的internal mode下复用完全相同的action/fingerprint算法，并在callback窗口后第二次完整重读，stale graph、wrong action或wrong fingerprint均拒绝。
- Normal lock acquisition新增module-private held assertion，通过WeakMap绑定原lock lifecycle closure；critical recovery gates持续验证lock parent/directory、single `owner.json`、owner descriptor、full metadata与token。`JsonlAuditFileLock` public interface和磁盘owner schema未增加字段，copied-owner replacement在namespace mutation前拒绝。
- Recovery与JsonlAuditSink共享resolved target的in-process write tail，并固定generation parent、selected staging root及action所需的current/rotated generation descriptor。Empty cleanup复用descriptor-backed exact rmdir；archive restore与full rollback通过shared directory mutation adapter执行opaque rename，且不调用`fs.readFile`读取current、`.1`或`previous` content。
- Archive restore与full rollback在generation commit前跟踪已完成rename并按reverse order恢复initial namespace；rollback只在path/descriptor/snapshot/entry-set均可证明时执行。Generation graph完成postcondition后即commit，后续staging sync、wrapper contraction或parent sync failure不反向rollback，而是返回`residualStagingPath`、`warning`和`durabilityCompleted: false`。
- 新增`audit_rotation_staging_recovery` CLI report、human/JSON renderers、`audit recover-rotation-staging` dispatch/parser/help。默认或`--dry-run`复用Phase555 readiness；mutation要求`--yes --expect-action <action> --expect-recovery <fingerprint>`，missing为OK，完整恢复为OK，post-commit residue/durability uncertainty为WARN，validation/mismatch/pre-commit uncertainty为ERROR。
- 新增16项runtime tests，覆盖三类action、no-content-read、opaque symlink、wrong action/fingerprint、invalid input、missing no-op、same-process serialization、cross-process timeout、graph drift、copied-owner lock replacement、pre-commit reverse rollback、post-commit retry residue、buffered/data/full ordering、staging/parent sync uncertainty及wrong-object fake-success rmdir/rename。新增3项CLI tests，覆盖dry-run/execute、human/JSON、missing/mismatch、disabled和malformed request。定向回归通过：`audit.test.ts` 174项、`cliAudit.test.ts` 56项，共230项；TypeScript build通过。
- Built CLI smoke新增missing dry-run、confirmed missing no-op和真实exact-empty staging两阶段cleanup。Smoke从dry-run JSON读取recommended action/fingerprint，再通过built parser/dispatch执行`--yes` mutation，并确认report与filesystem residue同时收敛。
- 统一验收通过：Python 422项；TypeScript 43个test files、744项；TypeScript build、built CLI integration和CLI smoke全部通过。README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase527/529/553/554/555历史边界已同步；JSON-RPC、agent event、provider、tool result和persistent schema未变化。
- `/tmp`无`god-code-audit-*`、`god-code-phase556-*`、`.god-code-audit-rotation-*`或`god-code-smoke.*`残留；workspace无staging directory及`.tmp`、`.bak`、`.orig`或`.rej`文件，验收输出无FileHandle GC warning。

## Phase557 后续加固

Phase557补齐本阶段result contract中的actual performed action，并把candidate handle closure与outer normal lock finalization从operation outcome中拆开。Generation commit、empty cleanup或missing no-op已经确定时，close/release failure不再覆盖result，而是输出resource warning与optional logical lock residue；pre-commit primary error仍优先。本阶段action/fingerprint、descriptor mutation、rollback、durability和CLI confirmation规则保持不变。

## Phase558 后续加固

Phase558为本阶段pre-commit reject contract增加typed failure stage和mutation state。Initial/second graph mismatch、candidate open/final gate、namespace syscall与reverse rollback不再只靠message区分；successful reverse rollback明确为`rolled_back`，syscall return不可确认与rollback失败分别为`attempted_unconfirmed`和`uncertain`。Public error继续保留原primary message，并合并candidate/lock lifecycle evidence。本阶段action/fingerprint、descriptor postcondition、commit边界、durability与两阶段CLI confirmation不变。

## Phase562 后续加固

Phase562在本阶段normal-lock-held recovery失败后、lock release前增加read-only graph observation。Candidate handles先完成settlement，随后current、`.1`和selected staging在同一normal lock下重新读取并分类；completed snapshot与本阶段mutation前confirmation fingerprint分开保存。Observation只记录失败后的namespace，不改变safe-action transaction或rollback规则，也不能代替下一次recovery的fresh lock/fingerprint revalidation。

## Phase563 后续加固

Phase563把本阶段两次locked graph读取和candidate exact-entry revalidation统一到bounded staging child scanner。Overflow state在action/fingerprint gate或candidate namespace syscall前被拒绝；scanner不完整枚举或排序损坏directory，也不把truncated entries视为可忽略。正常三类safe action、descriptor ownership、rollback与durability contract保持。
