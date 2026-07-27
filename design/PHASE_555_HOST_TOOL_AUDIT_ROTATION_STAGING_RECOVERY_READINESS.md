# Phase555：Host tool audit rotation staging recovery readiness

## 背景

Phase554为rotation staging增加target-bound namespace与bounded/read-only inspection，但单个staging layout本身不能说明current与`.1` generation处于transaction的哪一步。特别是`previous_only + current exists + .1 exists`既可能是new record已成功、尚未commit cleanup，也可能是new current empty/partial或外部mutation；直接选择rollback或commit都会有丢失有效record/archive的风险。

Phase555只建立selected residue的恢复资格分类与action-bound confirmation fingerprint。它读取current、`.1`、selected target-bound staging和coordination lock的稳定snapshot，输出未来mutation需要重新证明的dry-run authority；本阶段不执行rename、unlink、rmdir、truncate、write或durability sync。

## Selected Recovery Graph

新增direct runtime inspector：

```text
inspectJsonlAuditRotationRecovery(filePath, stagingId, now?)
```

调用方只能提供configured audit file与exact六字符ASCII alphanumeric staging ID。Runtime重新派生：

- current：`<audit>`
- rotated：`<audit>.1`
- staging：`.god-code-audit-rotation-<target-hash>-<id>`
- staged previous：`<staging>/previous`
- coordination lock：existing same-user derived lock path

不接受任意generation、staging、previous或lock path。

## Stable Object Snapshot

Recovery readiness使用full BigInt no-follow snapshot：

- entry type
- dev / inode
- mode / nlink / size
- mtimeNs / ctimeNs / birthtimeNs

Current与rotated在staging inspection前后各lstat一次；任何missing/existing转换、type变化或snapshot drift使整体assessment变为`state_changed`，不生成fingerprint。

Phase554 single-entry staging reader升级为内部detailed projection：

- root由initial no-follow lstat与directory-only handle绑定；
- Linux优先通过validated procfd child path读取entry set与lstat `previous`；
- root path、root descriptor、entry set及optional previous full snapshot在结束前重新验证；
- public list/direct仍只返回原有JSON-safe projection；
- recovery inspector只在stable detailed snapshot存在时使用隐藏BigInt identity生成fingerprint。

Inspector不读取current、`.1`或`previous`内容。

## Coordination Lock Gate

Readiness在generation graph前后检查derived coordination lock。

- 任一次观察到lock directory或non-directory blocker：不生成fingerprint；
- lock projection前后变化：`state_changed`；
- 两次均absent且generation/staging graph稳定：才允许产生eligible action fingerprint。

该absence不是持久保证。未来mutation仍必须先获取normal coordination lock，并在锁内重新读取全部对象、重新计算fingerprint和重验action。

## Assessment Matrix

新增assessment：

- `staging_missing`
- `coordination_lock_present`
- `cleanup_empty_staging`
- `restore_previous_archive`
- `rollback_full_rotation`
- `ambiguous_record_state`
- `invalid_staging_state`
- `invalid_generation_state`
- `unsupported_namespace_state`
- `state_changed`

Eligible action只有三类：

### cleanup_empty_staging

条件：

- selected staging为stable private directory；
- layout为exact `empty`；
- coordination lock前后均absent。

Empty wrapper可能来自previous move前的crash，也可能来自commit unlink previous后的crash；两种情况下未来只删除仍为空且identity-bound的wrapper都不会删除generation或archive bytes。因此该action不要求current/rotated组合可解释。Fingerprint仍绑定本次观察到的current/rotated snapshots，形成比最小wrapper authority更严格的graph expectation；未来mutation必须在锁内重验同一graph后才可收缩selected wrapper。

### restore_previous_archive

条件：

- staging为stable private `previous_only`；
- `previous`存在且不是directory；
- current为stable non-empty private regular single-link file；
- rotated missing；
- coordination lock前后均absent。

未来action只把selected `previous`恢复到仍missing的`.1`，不修改current。

### rollback_full_rotation

条件：

- staging为stable private `previous_only`；
- `previous`存在且不是directory；
- current missing；
- rotated为stable non-empty private regular single-link file；
- coordination lock前后均absent。

该shape对应current已rename为`.1`、new current尚不存在的pre-commit transaction。未来action先把`.1`恢复为current，再把`previous`恢复为`.1`。

### Ambiguous / Invalid

- `previous_only + valid current + valid rotated`：`ambiguous_record_state`。无法仅凭filesystem证明new current record已成功还是partial/unknown，禁止fingerprint。
- staging non-directory、non-private、unknown、state drift、inspection error或`previous`为directory：`invalid_staging_state`。
- action所需current/rotated存在但不是non-empty private regular single-link：`invalid_generation_state`。
- current与rotated均missing或其他无法映射到安全action的stable组合：`unsupported_namespace_state`。

## Action-Bound Fingerprint

新增32字符lowercase hexadecimal fingerprint。SHA-256输入使用domain separation与version，并绑定：

- resolved absolute audit path
- exact staging ID/path
- selected action
- current、rotated与optional previous的existence marker
- 本次观察图内全部existing objects的stable full BigInt snapshots
- staging layout与exact entry set

不同action、target、ID、path、inode、metadata、size或missing/existing state不会共享fingerprint。

Fingerprint不是secret、liveness proof或独立mutation authority。Future command必须获取coordination lock，并要求operator提供exact fingerprint后，在锁内重新计算匹配才可mutation。

## CLI Contract

新增：

```text
god-code audit inspect-rotation-recovery <staging-id> [--json]
```

Report name：`audit_rotation_recovery`。

Details包含：

- configured file、rotated path与staging ID/path
- current/rotated JSON-safe generation projection
- Phase554 staging projection
- coordination lock existence/type/acquirable
- assessment、eligible、recommended action
- recovery fingerprint（仅eligible）
- `confirmation_required: true`
- `mutation_performed: false`

Status：

- persistence disabled：WARN，filesystem不访问；
- staging missing：OK；
- eligible dry-run candidate：WARN，明确未执行mutation；
- lock present、ambiguous、invalid、unsupported或state changed：WARN且无fingerprint；
- invalid config、invalid ID或filesystem inspection failure：ERROR。

## Tests

- 三类eligible action分别生成32-hex fingerprint，重复stable inspection一致。
- Target、ID、action、current、rotated、staging root或previous snapshot变化都会改变或移除fingerprint。
- `previous_only + current + .1`稳定分类为ambiguous且不读取任何JSONL/archive content。
- Empty wrapper不依赖generation shape即可获得cleanup readiness。
- Missing、unknown、non-directory、non-private staging、previous-directory，以及zero-byte、hard-link、broad-mode与symlink generations分类正确。
- Coordination lock present或前后变化禁止fingerprint。
- Current/rotated/staging/previous inspection race设置`state_changed`。
- Phase554 list/direct public projection保持，隐藏BigInt snapshot不进入JSON。
- CLI enabled/disabled、human/JSON、help/usage、eligible/missing/ambiguous/lock/error路径完整。
- Inspection前后filesystem objects与contents不变。

## 边界

- 本阶段不执行恢复、cleanup、commit或rollback mutation。
- 不解析JSONL record，不判断current最后一行是否完整。
- 不把age、PID、mode修复可能性或operator intent当作eligibility。
- 不为Phase553 legacy unscoped staging生成recovery authority。
- 不自动清理coordination lock；需使用既有lock maintenance命令。
- 不新增JSON-RPC、agent event、provider、tool result或persistent metadata字段。

## 验收标准

- 三类safe action与ambiguous/invalid states有稳定、互斥分类。
- Fingerprint绑定target、action和所有未来mutation相关objects。
- Active/residual coordination lock与snapshot drift都不能获得fingerprint。
- Runtime与CLI全程no-follow、bounded、read-only且不读取content。
- Phase554 list/direct接口与rotation runtime行为不回归。
- CLI human/JSON、exit status、help和smoke接线完整。
- 定向audit/CLI、TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- 无inspection mutation、临时残留或FileHandle GC warning。

## 实现结果

- 新增`JSONL_AUDIT_ROTATION_RECOVERY_FINGERPRINT_HEX_LENGTH`、recovery action/assessment/generation/inspection公开类型，以及`inspectJsonlAuditRotationRecovery(filePath, stagingId, now?)`。API只接受configured target与exact六字符ID，并重新派生current、`.1`、staging和lock paths。
- Phase554 single-entry reader拆为public JSON-safe projection与internal detailed snapshot。Detailed路径保留staging root和optional `previous`的full BigInt no-follow identity；list/direct返回结构未增加BigInt字段，既有接口保持。
- Recovery inspector按`lock -> current/.1 -> staging -> current/.1 -> lock`读取稳定图。Current、rotated、staging/previous或lock drift优先分类为`state_changed`；active/blocking lock分类为`coordination_lock_present`，两类均不生成fingerprint。
- 三类eligible shape已实现：exact empty staging映射`cleanup_empty_staging`，valid current加missing `.1`映射`restore_previous_archive`，missing current加valid `.1`映射`rollback_full_rotation`。Generation必须是non-empty private regular single-link file；current与`.1`同时存在保持`ambiguous_record_state`，其他invalid/unsupported shape fail closed。
- 32-hex fingerprint使用versioned domain separation，绑定resolved target、exact ID/path、selected action、staging root、optional previous及current/rotated existence和full snapshots。Empty cleanup也绑定本次观察到的generation graph；fingerprint不是secret、liveness proof或独立mutation authority。
- 新增`audit_rotation_recovery` report、human/JSON renderers、`audit inspect-rotation-recovery <staging-id> [--json]` dispatch/parser/help。Enabled candidate与manual-review state返回WARN，missing返回OK，disabled返回WARN且不访问filesystem，invalid config/ID或inspection failure返回ERROR；所有结果固定`confirmation_required: true`、`mutation_performed: false`。
- 新增15项runtime tests，覆盖三类eligible shape、missing/ambiguous/invalid/unsupported/lock矩阵、non-directory/unknown/non-private staging、hard-link/broad-mode/symlink generations、target/ID/action及current/rotated/staging/previous fingerprint binding、四类object race、lock race、drift优先级、content-read prohibition与no-mutation。Phase553真实commit cleanup failure分别验证`previous_only + current + .1`无authority，以及previous已删除但wrapper rmdir失败可获得empty cleanup readiness。
- 新增4项CLI tests，覆盖eligible restore/empty、ambiguous、active lock、missing、disabled、invalid ID/config、human/JSON字段和non-disclosure。定向回归通过：`audit.test.ts` 158项、`cliAudit.test.ts` 53项，共211项；TypeScript build通过。
- Built CLI smoke新增missing recovery readiness检查，验证report name、assessment、eligible与`mutation_performed` contract。统一验收通过：Python 422项；TypeScript 43个test files、725项；TypeScript build、built CLI integration和CLI smoke全部通过。
- README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase527/529/553/554历史边界已同步。JSON-RPC、agent event、provider、tool result、inspect-path和persistent metadata schema未变化。
- `/tmp`无`god-code-audit-*`、`god-code-phase555-*`、`.god-code-audit-rotation-*`或`god-code-smoke.*`残留；workspace无staging directory及`.tmp`、`.bak`、`.orig`或`.rej`文件，验收输出无FileHandle GC warning。

## Phase556 后续实现

Phase556把本阶段recommended action与fingerprint作为operator expectation，而不是脱离状态的token。Mutation先取得normal coordination lock，在内部held mode下按完全相同的classification/fingerprint算法两次重建graph，并同时匹配expected action与fingerprint；随后固定parent、staging与generation descriptors才允许namespace syscall。Missing staging保持幂等no-op，ambiguous/invalid/unsupported/drifted graph仍拒绝。Three-action transaction、pre-commit reverse rollback、post-commit residual/durability result和CLI `--yes`确认均不改变本阶段read-only inspector的public report contract。

## Phase563 后续加固

Phase563保证本阶段graph classifier只接收bounded selected-staging child scan。Initial/final scan各最多保留2个names并比较truncation bit；任何truncated state都分类为`invalid_staging_state`，不生成recommended action或fingerprint。Empty与single-`previous` graph保持原算法，overflow total和child names不进入readiness report。
