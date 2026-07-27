# Phase539：Host tool audit guarded empty quarantine cleanup

## 背景

Phase531和Phase538能够把exact quarantine residue分类为`empty`，但Phase532只允许清理valid `owner_only`。Empty quarantine没有owner token，不能使用`--expect-owner`；长期保留又会让operator只能手工删除derived temp path。

Phase536已经为empty disposal建立绑定absolute path、BigInt dev/inode/ctimeNs/birthtimeNs的独立directory identity confirmation。Phase539将该primitive泛化到empty quarantine，并新增：

```text
god-code audit cleanup-empty-lock-quarantine <quarantine-id> \
  [--dry-run|--yes --expect-quarantine <fingerprint>] [--json]
```

## Eligibility

Selected quarantine必须同时满足：

- ID为六字符ASCII alphanumeric并由当前configured audit path重新派生；
- entry存在且为directory；
- Phase531/538 layout为exact `empty`；
- root entry count为0；
- inspection没有state drift或error；
- identity-bound empty-directory fingerprint可生成。

`owner_only`、`lock_with_owner`、`lock_and_owner`、`unknown`、non-directory、invalid或drifting state全部拒绝。

## Evidence Extension

`JsonlAuditLockQuarantineEntryInspection`为stable exact-empty layout增加：

```text
emptyDirectoryFingerprint?: string
```

Phase531 list和Phase538 direct projection都输出`empty_directory_fingerprint`。该值只确认本次empty directory identity，不是authentication secret、owner proof、stale verdict或cleanup capability本身。

## Confirmation Contract

无mutation flag时默认dry-run，输出：

- quarantine ID/path/existence/type/layout；
- `empty_directory_fingerprint`；
- `confirmation_required: true`；
- `liveness_verified: false`；
- `removed: false`。

真实删除必须同时提供：

```text
--yes --expect-quarantine <fingerprint>
```

Fingerprint必须是32字符lowercase hexadecimal，并使用独立empty-quarantine domain；不接受owner fingerprint或Phase536 disposal fingerprint。

## Runtime Transaction

底层`cleanupJsonlAuditEmptyLockQuarantine(...)`执行：

1. 从current audit path和exact qid派生quarantine path。
2. 以no-follow `O_DIRECTORY` handle打开candidate，并把path lstat与descriptor fstat绑定。
3. 捕获BigInt device、inode、ctimeNs和birthtimeNs，在同一descriptor保持open时确认entry set为空。
4. 使用absolute path和empty-quarantine domain计算fingerprint。
5. 要求operator fingerprint exact match。
6. Mutation前保持原descriptor open，重新绑定current path、descriptor identity、same fingerprint与empty invariant。
7. 只执行`rmdir(quarantinePath)`，随后关闭descriptor。

成功rmdir是唯一commit。该事务不创建disposal namespace、不unlink owner、不递归删除，也没有post-commit partial state。

## Failure Semantics

- Initial missing：`ok`，nothing to clean。
- Wrong fingerprint：`error`，不回显当前正确fingerprint。
- Extra entry、replacement、identity drift或non-directory：`error`，不删除对象。
- Candidate在final revalidation前消失或变为non-empty：`error`。
- Persistence disabled或invalid config：`error`。

## Identity Primitive Refactor

Phase536 private identity reader将泛化为empty-directory identity helper。Disposal fingerprint继续使用原有domain，保持Phase536 confirmation语义；quarantine使用独立domain，防止不同residue class之间误用confirmation。

Open directory descriptor在revalidation到rmdir期间固定原inode；即使filesystem快速复用inode和时间戳，replacement path也不能与仍被handle引用的原directory object混淆。该加固同时应用于Phase536 empty disposal cleanup。

## Tests

- Low-level exact-empty quarantine成功删除。
- Wrong fingerprint不删除且不泄露correct fingerprint。
- Extra entry和replacement race拒绝删除未知对象。
- Quarantine inspection只为stable exact-empty layout输出fingerprint。
- CLI默认dry-run、confirmed cleanup、missing与disabled路径。
- Owner-only、pre-commit、unknown和non-directory全部拒绝。
- Parser覆盖missing/invalid ID、flag互斥、missing/invalid fingerprint。
- Built CLI integration验证inspect fingerprint、dry-run、wrong fingerprint、confirmed removal和post-removal missing。

## 边界

- 本阶段不删除含owner metadata的quarantine。
- 本阶段不恢复pre-commit layout。
- 本阶段不递归删除unknown或extra entries。
- 本阶段不批量扫描并自动清理。
- 本阶段不根据PID或age判断stale/liveness。
- 本阶段不改变Phase536 disposal fingerprint domain。

## 验收标准

- 只有operator确认的same-identity exact-empty quarantine可被rmdir。
- List/direct/dry-run共享同一个empty quarantine fingerprint。
- Wrong/stale/cross-class fingerprint不能授权mutation。
- 所有failure路径保持unknown contents不变。
- Phase530至Phase538行为与接口保持。
- TypeScript、Python、built CLI integration和smoke全量回归通过。

## 实现结果

- `JsonlAuditLockQuarantineEntryInspection`与list/direct CLI projection为stable exact-empty layout增加`empty_directory_fingerprint`。
- Empty-directory helper泛化为BigInt path/descriptor identity reader，并在cleanup期间保持no-follow directory handle open。
- `cleanupJsonlAuditEmptyLockQuarantine(...)`只允许confirmed same-descriptor exact-empty candidate执行rmdir。
- `audit cleanup-empty-lock-quarantine`增加default dry-run、独立`--expect-quarantine`确认及human/JSON report。
- Disposal与quarantine parser共用directory-fingerprint flag parser，但保持独立confirmation option和fingerprint domain。
- Low-level tests覆盖success、mismatch、extra entry、replacement和Phase536 replacement regression；CLI tests覆盖eligible/ineligible/missing/disabled状态。
- Built CLI integration覆盖inspect -> dry-run -> parser refusal -> wrong fingerprint -> confirmed cleanup -> missing完整流程。

## Phase544 加固

Phase544在empty quarantine `rmdir`成功后继续检查current path missing，并通过仍打开的candidate descriptor证明original directory dev/ino一致且`nlink === 0`。如果syscall实际删除了same-path replacement，cleanup会拒绝而不是返回removed。

## Phase547 加固

Phase547为empty quarantine cleanup增加immediate-parent descriptor，并从parent anchor解析selected basename执行rmdir。Linux procfd path固定parent lookup，fallback重新验证logical parent；Phase539 fingerprint、empty gate与Phase544 detachment proof保持。

## Phase568 加固

Phase568让共享empty-directory opener要求descriptor/path/descriptor都匹配open-time device/inode/ctimeNs/birthtimeNs。Exact-empty final scan附近的child generation、directory metadata或logical leaf replacement不能产生dry-run fingerprint或cleanup candidate。Phase539 confirmation domain、parent-anchored rmdir与post-delete detachment proof保持。

## Phase572 加固

Phase572把empty quarantine的positive match/fingerprint投影绑定到`cleanupJsonlAuditEmptyLockQuarantine(...)` existing result。Preflight完成后candidate被replacement时，runtime mismatch ERROR省略`quarantine_fingerprint_matches`与旧empty fingerprint；candidate直接消失时幂等WARN同样省略。Stable confirmed cleanup继续发布runtime-returned exact fingerprint，Phase539 descriptor-bound empty removal contract不变。

## Phase575 投影边界修正

Phase575进一步要求empty quarantine runtime candidate missing时撤销preflight entry type、layout、state/error及empty confirmation fields，只保留selected path、`quarantine_exists: false`和`removed: false`。Phase539 initial missing、dry-run、runtime existing与descriptor-bound rmdir semantics保持。

## Phase576 descriptor finalization 加固

Phase576让exact-empty quarantine removal在candidate/parent descriptor finalization失败时仍返回已知`removed:true`、runtime-confirmed fingerprint和selected absence。Non-throwing all-settled finalizer通过cleanup lifecycle fields表达closure uncertainty，CLI由OK提升为WARN；fingerprint gate、descriptor-bound rmdir、wrong-object rejection与missing report保持。

## Phase577 rejection lifecycle 加固

Phase577为empty-quarantine candidate mismatch和pre-removal failure增加typed rejection closure evidence。Candidate与parent close failure不覆盖fingerprint/operation primary error，CLI ERROR投影existing cleanup fields；descriptor-bound exact-empty removal与missing behavior不变。
