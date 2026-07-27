# Phase554：Host tool audit target-bound rotation staging inspection

## 背景

Phase553用same-parent `.god-code-audit-rotation-*` private directory暂存previous `.1`，使pre-commit failure可以恢复完整generation state。该固定prefix没有编码audit target identity：若同一parent下存在`a.jsonl`与`b.jsonl`，两个sink的crash/commit residue使用同一namespace，后续inspection无法证明某个staging directory属于哪个target。

没有target provenance时，任何自动恢复、cleanup或fingerprint authority都会面临cross-target误操作风险。Phase554先建立可归属、可观测的只读基础，不执行恢复或删除。

## Target-Bound Namespace

Runtime从canonical absolute audit file path计算SHA-256，并取32个lowercase hexadecimal字符作为128-bit target scope：

```text
.god-code-audit-rotation-<32-hex-target-hash>-<6-char-id>
```

Prefix helper返回same-parent absolute prefix path：

```text
<parent>/.god-code-audit-rotation-<hash>-
```

`mkdtemp`继续追加6字符ASCII alphanumeric ID。不同audit absolute paths即使共享parent，也使用不同derived prefix；runtime只在自身target namespace创建staging。

Phase553固定旧prefix形成的exact legacy name：

```text
.god-code-audit-rotation-<6-char-id>
```

它不携带target identity。Inspector只计数并产生warning，不把legacy entry投影为当前target transaction，也不向后续mutation提供authority。

## Runtime Inspection Types

新增只读类型：

- `JsonlAuditRotationStagingLayout`
  - `empty`
  - `previous_only`
  - `unknown`
- `JsonlAuditRotationStagingEntryInspection`
  - `stagingId`
  - `stagingPath`
  - `exists`
  - `entryType`
  - `ageMs`
  - `layout`
  - `entryCount`
  - `previousEntryType`
  - `previousSizeBytes`
  - `stateChanged`
  - `inspectionErrorCode`
- `JsonlAuditRotationStagingInspection`
  - target file/prefix
  - bounded scan counters
  - legacy unscoped count
  - bounded result entries

Entry type复用audit no-follow分类：`directory`、`symbolic_link`、`regular_file`、`other`。

## Bounded List Inspection

`inspectJsonlAuditRotationStagings(filePath, now?)`：

1. canonicalize file path并派生target prefix；
2. 只打开configured audit parent directory；
3. 使用`opendir().read()`最多扫描4096 entries；
4. 只收集exact target-bound `<prefix><6-char-id>` names；
5. 单独计数exact legacy unscoped names；
6. 排序后最多materialize 128个target-bound results；
7. 每个selected entry执行no-follow、前后identity-bound inspection；
8. 不打开previous content、不创建、不chmod、不rename、不unlink、不rmdir。

Scan/result truncation通过独立boolean报告。Other target hashes不计入matched results，也不泄露其IDs或paths。

## Exact-ID Inspection

`inspectJsonlAuditRotationStaging(filePath, stagingId, now?)`只接受exact 6字符ASCII alphanumeric ID，并从当前file path重新派生staging path。它不扫描parent，不接受caller提供任意path，也不把missing entry视为错误。

Direct inspection与bounded list共享single-entry projection。该入口为后续fingerprint、cleanup或recovery命令提供selected-object只读基础，但本阶段不产生mutation authority。

## Entry Projection

Top-level entry先lstat：

- missing：`exists:false`；
- non-directory：报告entry type，layout不确定；
- directory：读取root entry names并分类。

Directory layout：

- 0 entries：`empty`；
- exact single `previous`：`previous_only`，对previous执行lstat并报告type/size；
- 其他任何entry set：`unknown`。

Inspection在readdir/previous lstat后再次lstat root，并比较BigInt dev/ino/ctimeNs/birthtimeNs。Root disappearance、replacement或identity drift设置`stateChanged:true`；可识别filesystem error记录stable code。Symlink从不跟随。

## CLI Contract

新增：

```text
god-code audit inspect-rotation-stagings [--json]
god-code audit inspect-rotation-staging <staging-id> [--json]
```

List report name为`audit_rotation_stagings`，direct report为`audit_rotation_staging`。

- persistence disabled：`ok:true` + warn，filesystem不访问；
- 无target-bound residue且无legacy residue：OK；
- target-bound residue、scan/result truncation、legacy unscoped residue或uncertain entry：WARN；
- invalid config、invalid ID或parent inspection failure：ERROR。

Human与JSON renderer输出相同projection。命令不输出audit内容、previous bytes或未归属target的entry names。

## Tests

- 两个same-parent audit targets派生不同32-hex prefixes，runtime staging只出现在对应namespace。
- List只返回selected target entries，不泄露other-target IDs。
- Empty、previous_only、unknown、non-directory与symlink top-level projection正确且no-follow。
- Previous symlink只报告link type/size，不读取target。
- Parent scan固定4096、result固定128并报告truncation。
- Legacy exact names只增加unscoped count，不进入target entries。
- Direct exact ID与list projection一致；invalid ID稳定拒绝，missing稳定报告。
- CLI enabled/disabled、human/JSON、warning/error和usage/help路径保持。
- Inspection前后所有filesystem objects与content不变。

## 边界

- 本阶段不恢复、commit、cleanup或删除staging residue。
- 不为legacy unscoped entries推断target ownership。
- 不判断record write是否成功、previous是否应commit或rollback。
- 不生成cleanup fingerprint或mutation confirmation token。
- Process可在inspection结束后立即改变entry；report是即时snapshot。
- 不新增JSON-RPC、agent event、provider、tool result或persistent metadata字段。

## 验收标准

- 新runtime staging namespace可从absolute audit target唯一派生到128-bit scope。
- Same-parent different targets不会互相列出staging entries。
- List/direct inspection有界、no-follow、只读且共享projection。
- Legacy unscoped residue明确告警但不获得target authority。
- CLI human/JSON输出、exit status和help接线完整。
- Existing rotation commit/rollback与public inspect-path schema保持。
- 定向audit/CLI、TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- 无inspection mutation、临时残留或FileHandle GC warning。

## 实现结果

- 新增`getJsonlAuditRotationStagingPrefix`与`getJsonlAuditRotationStagingPath`。Prefix以resolved absolute audit path计算SHA-256并截取32 lowercase hex；runtime `mkdtemp`从pinned generation parent使用该basename，same-parent不同targets派生不同namespace。
- 新增4096 scan、128 result和32-hex scope公开常量，以及`JsonlAuditRotationStagingInspection`、single-entry inspection与`empty`/`previous_only`/`unknown` layout类型。
- `inspectJsonlAuditRotationStagings`只收集当前target exact六字符suffix，排序后bounded materialize；other-target names完全忽略，Phase553 exact legacy names只累加`legacyUnscopedEntryCount`。`inspectJsonlAuditRotationStaging`验证ID并直接派生selected path，不扫描parent。
- Single-entry reader对top-level non-directory只做前后lstat；directory candidate以no-follow/directory-only handle固定root，在Linux优先通过validated procfd child path读取entry set和lstat `previous`，并重验root path、descriptor、entry set和previous snapshot。Inspector不读取archive content，也不调用rename、unlink、rmdir、mkdir、chmod或write。
- 新增CLI reports、human/JSON renderers和main dispatch/help：`audit_rotation_stagings`与`audit_rotation_staging`分别支持enabled/disabled、missing、legacy、truncation、uncertain和invalid状态。Main parser与runtime direct API都要求exact六字符ASCII alphanumeric ID。
- 新增六项runtime tests，覆盖target prefix隔离、legacy计数、全部layout与symlink no-follow、128-result bound、4096-scan bound、direct/list parity和invalid/missing；Phase553 commit-residue test升级为断言runtime实际使用target-bound prefix。
- 新增四项CLI tests，覆盖target/legacy projection、other-target non-disclosure、list/direct一致性、human/JSON、disabled no-filesystem path及invalid config/ID。定向回归通过：`audit.test.ts` 143项、`cliAudit.test.ts` 49项，共192项；TypeScript build通过。
- CLI smoke新增两个built-command checks，证明empty list输出target-bound 32-hex prefix，exact-ID direct命令稳定报告missing residue。
- 统一验收通过：Python 422项；TypeScript 43个test files、706项；TypeScript build、built CLI integration和CLI smoke全部通过。
- README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase500/513/521/548/552/553历史边界已同步。JSON-RPC、agent event、provider、tool result、inspect-path和persistent metadata schema未变化。
- `/tmp`无`god-code-audit-*`、`god-code-phase554-*`、`.god-code-audit-rotation-*`或`god-code-smoke.*`残留；workspace无staging directory及`.tmp`、`.bak`、`.orig`或`.rej`文件，验收输出无FileHandle GC warning。

## Phase555 后续加固

Phase555复用本阶段single-entry reader的内部detailed snapshot，把selected target-bound staging与current、`.1`及coordination lock组合为stable recovery graph。Public list/direct projection保持JSON-safe且不暴露BigInt identity；只有三类safe shape获得action-bound dry-run fingerprint，ambiguous、invalid、locked或drifted state无authority。新CLI仍不执行恢复或cleanup，未来mutation必须在normal lock内重新验证。

## Phase556 后续加固

Phase556继续只接受本阶段target-derived path与exact六字符ID，不开放任意staging path。Mutation在normal lock内复用detailed root/previous snapshots并再次读取exact entry set，随后以open staging descriptor作为rename/rmdir capability；other-target与legacy unscoped residue仍不可选择。Public list/direct inspection projection、scan/result bounds和JSON-safe字段不变，新增recovery result也不暴露BigInt identity或archive content。

## Phase563 后续加固

Phase563为本阶段parent namespace 4096/128预算之外补上selected staging内部child预算。Single-entry reader不再完整`readdir().sort()`，而是从pinned staging descriptor流式保留2项并用sentinel声明truncation；public projection新增scan count/limit/truncated，exact `entryCount`只在未截断时出现。Truncated candidate固定`unknown`且不输出child names，list/direct parity保持。
