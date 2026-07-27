# Phase535：Host tool audit guarded owner-only disposal cleanup

## 背景

Phase534能够只读识别Phase532留下的private disposal residue，并关联source quarantine状态。只有以下状态具有最窄、可确认的删除语义：

- disposal为exact `owner_only` directory；
- root owner metadata valid；
- source quarantine当前不存在；
- operator明确确认owner fingerprint。

Phase535新增：

```text
god-code audit cleanup-lock-disposal <quarantine-id> <disposal-id> [--dry-run|--yes --expect-owner <fingerprint>] [--json]
```

该命令删除selected disposal中的owner metadata，并在安全时rmdir空root。

## Selection Contract

两个ID都必须为六字符ASCII alphanumeric。Runtime始终重新派生：

```text
<derived-lock-path>.cleanup-<quarantine-id>.dispose-<disposal-id>
```

CLI不接受任意filesystem path，不允许通过该命令选择其他temp entry。

## Eligibility

候选必须同时满足：

- disposal path存在且为directory；
- exact layout为`owner_only`；
- root只包含`owner.json`；
- owner metadata通过4096-byte bounded no-follow parser；
- owner file为single-link regular file；
- owner token、PID和canonical acquired time schema valid；
- source quarantine path不存在；
- dry-run或mutation重验期间没有directory、owner或entry-set drift。

以下状态全部拒绝：

- `empty`
- `unknown`
- invalid/missing owner metadata
- regular file、symbolic link或other blocker
- source quarantine存在，无论其layout为何
- fingerprint mismatch

Source absence不自动证明该residue可删除；它只是eligibility gate，真实删除仍要求operator fingerprint确认。

## Confirmation

默认dry-run输出：

- quarantine ID/path与source absence；
- disposal ID/path/layout；
- owner metadata status、PID和acquired time；
- 32字符owner fingerprint；
- `confirmation_required: true`；
- `liveness_verified: false`；
- `removed: false`。

真实删除必须同时提供：

```text
--yes --expect-owner <fingerprint>
```

错误fingerprint返回error且不回显当前正确fingerprint。PID、age和timestamp不参与授权。

## Deletion Transaction

`cleanupJsonlAuditLockDisposal`不创建新的purge namespace，避免形成递归残留链：

1. lstat disposal root并捕获directory dev/ino。
2. Bounded读取owner并捕获owner dev/ino、token和fingerprint。
3. 要求exact single-owner entry set与source quarantine absent。
4. Mutation前再次验证source absence、directory identity、owner identity/token和entry set。
5. unlink selected `owner.json`；该步骤是删除提交点。
6. 再次要求source quarantine absent。
7. 要求原disposal directory identity不变且为空。
8. rmdir disposal root。

Command不递归删除目录，也不删除任何未知entry。

## Failure Semantics

提交前失败时：

- `removed: false`；
- owner file与disposal root保持；
- source quarantine和coordination lock不修改；
- race drift返回明确error。

owner unlink提交后若发生以下情况：

- source quarantine出现；
- disposal directory replacement；
- extra entry出现；
- empty-directory rmdir失败；

则返回：

- `removed: true`；
- `residual_disposal_path`；
- warning而不是假装完整root cleanup成功。

未知entry保持原样，可由Phase534重新发现和分类。

## CLI Safety

- 默认dry-run。
- `--dry-run`与`--yes`互斥。
- `--expect-owner`必须与`--yes`同时出现。
- 两个ID都必须是六字符ASCII alphanumeric。
- Fingerprint必须为32字符lowercase hex。
- Invalid config或disabled persistence拒绝mutation。
- Active coordination lock path不参与事务，也不会被删除。
- Human/JSON输出不包含UUID owner token或raw metadata。

## Tests

- Valid owner-only、source-absent disposal按exact fingerprint删除。
- Active coordination lock保持，holder可正常release。
- Wrong fingerprint保留owner且不泄露正确fingerprint。
- Source quarantine exists时拒绝dry-run和mutation。
- Source quarantine在mutation前出现时拒绝并保留owner。
- Owner unlink后出现extra entry时保留entry并报告residual path。
- Empty、unknown、invalid metadata及non-directory entry均被CLI拒绝。
- Built CLI integration验证inspection -> dry-run -> confirmed cleanup完整流程。

## 边界

- 本阶段不清理empty或unknown disposal。
- 本阶段不恢复owner到source quarantine或coordination lock。
- 本阶段不判断PID liveness或age-based stale。
- 本阶段不自动扫描并批量删除多个disposal。
- 用户态identity checks不是内核transaction；same-user adversary可制造拒绝或post-commit residue，但不能扩大删除到unknown entry或任意path。

## 验收标准

- 只有valid owner-only、source-absent disposal可进入confirmation。
- Mutation绑定qid、did、directory identity、owner identity/token和fingerprint。
- Source quarantine在owner unlink前重新验证不存在。
- 提交前不删除任何对象；提交后残留显式报告。
- Unknown entry和active coordination lock不受影响。
- CLI不输出owner token。
- Phase530至Phase534行为与接口保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增`cleanupJsonlAuditLockDisposal`及source-absence candidate binding。
- 新增owner unlink commit、same-identity empty-root rmdir和post-commit residual reporting。
- 新增`audit cleanup-lock-disposal` human/JSON CLI及双ID confirmation parser。
- Tests覆盖success、fingerprint mismatch、source exists/race和post-unlink extra entry preservation。
- CLI tests覆盖dry-run、non-secret mismatch、confirmed cleanup和ineligible states。
- Integration覆盖inspection -> cleanup dry-run -> wrong fingerprint -> confirmed cleanup完整流程。
- README、SECURITY、protocol、architecture、internal design、project plan和extension docs同步Phase535边界。

## Phase540 加固

Phase540为selected owner-only disposal持有no-follow `O_DIRECTORY` descriptor，跨越source-absence revalidation、owner unlink commit、empty-root rmdir和residual return，并在top-level `finally`关闭。提交前复制相同owner metadata的replacement会因path/descriptor mismatch被拒绝；owner unlink后的Phase535 residual reporting语义保持不变。

## Phase542 加固

Phase542为selected disposal owner file保持no-follow regular-file descriptor，从candidate selection跨越source-absence gate、owner unlink commit和residual return。Copied owner JSON不能冒充原owner object，Phase535提交点与post-commit residual语义不变。

## Phase544 加固

Phase544把owner unlink commit marker移动到post-unlink detachment proof之后：target owner path必须missing，original owner descriptor dev/ino一致且`nlink === 0`。Directory contraction同样验证original root descriptor已脱链；wrong-object fake-success不会被误报为commit，既有post-commit residual字段保持。

## Phase547 加固

Phase547为selected owner-only disposal增加immediate-parent handle。Owner unlink从selected disposal directory anchor解析，empty root rmdir从parent anchor解析；Linux使用descriptor-relative procfd child paths，fallback执行parent path/descriptor gate。Phase535 owner fingerprint、source absence、commit point和`residual_disposal_path`保持。

## Phase564 加固

Phase564把candidate selection和pre-unlink revalidation的single-owner assertion改为descriptor-bound bounded scanner。Scanner最多保留2个names并读取一个sentinel；truncated或任何非exact single-owner set都在owner unlink commit前拒绝，未知children保持。Post-unlink exact-empty contraction复用相同gate，Phase535 commit与residual语义不变。

## Phase568 加固

Phase568收紧cleanup dry-run依赖的owner-only disposal observation。Final bounded scan后必须重新读取selected owner并匹配initial file object与canonical metadata，再终检root open-time generation；任何漂移都撤销fingerprint与confirmation并在owner unlink前返回error。真实Phase535 cleanup继续执行fresh pinned owner/source-absence/entry-set revalidation，commit和residual语义不变。

## Phase569 加固

Phase569要求owner-only disposal dry-run在稳定owner observation之后、fingerprint返回之前再次确认source quarantine path missing。Late source entry会把source/disposal标记为changed并使CLI在confirmation前拒绝，不调用owner unlink或root rmdir。Phase535 destructive transaction原有pre/post source-absence assertions、owner unlink commit和residual reporting保持。

## Phase570 加固

Phase570要求terminal source check成功后再以bounded no-follow owner inspection结束dry-run authority。Source保持missing但owner原地改写时同样无fingerprint/confirmation且不执行mutation；Phase535真实cleanup继续依赖fresh source-absence、pinned owner、owner-unlink commit与residual disposal reporting。

## Phase571 加固

Phase571把owner-only disposal confirmation绑定到selected disposal generation和source-missing path，而不再只绑定owner token。Mutation在fresh source-absence assertion与pinned root/owner读取后重算candidate-bound value，并在owner unlink或任何wrapper mutation前拒绝旧generation、其他source path/domain或token-only value。Dry-run后同路径copied-owner replacement保持不变且无unlink/rmdir；Phase535 owner-unlink commit和post-commit residual reporting不变。

## Phase572 加固

Phase572让owner-only disposal cleanup只从runtime existing result发布`owner_fingerprint_matches: true`和`owner_fingerprint`。Preflight-to-runtime replacement导致的fingerprint rejection不再复用旧positive details，authoritative selection前missing也只保留幂等warning。Owner unlink已提交但root contraction留下residual时，runtime-returned exact fingerprint仍可支持positive evidence；Phase535 source-absence、commit和post-commit residual语义保持。

## Phase574 投影边界修正

Phase574明确`residual_disposal_path`只定位owner unlink commit后的root cleanup uncertainty，不证明logical disposal path当前存在。Runtime existing且无residual时CLI投影`disposal_exists: false`；有residual时无论logical path仍present还是wrong-object contraction后missing，都保留locator与WARN并省略该optional boolean。Phase535 owner-unlink commit、source absence、unknown-entry preservation、runtime result与positive fingerprint evidence保持。

## Phase575 投影边界修正

Phase575在owner-only disposal runtime candidate missing时保留`disposal_exists: false`与`removed: false`，撤销selected entry/layout/owner/state evidence以及source quarantine existence/type/layout/state。Missing fast path没有重新观察source path，并发source reappearance不能被preflight false遮蔽；Phase535 existing source-absence transaction、commit与residual semantics保持。

## Phase576 descriptor finalization 加固

Phase576让owner-only disposal cleanup在owner unlink commit后的stable或residual result不再受descriptor close rejection支配。Runtime保持`removed:true`、owner fingerprint与optional `residual_disposal_path`，closure failure只投影cleanup handles false和bounded warning；CLI保留selected existence uncertainty规则并返回WARN。Source-absence assertions、owner-unlink commit、unknown-entry preservation和missing semantics保持。

## Phase577 rejection lifecycle 加固

Phase577把owner-disposal candidate reader的raw `Promise.all(handle.close())`替换为normalized all-settled rejection envelope。Fingerprint mismatch与pre-owner-deletion primary error不会被directory close throw覆盖，owner handle仍close；CLI ERROR投影cleanup lifecycle fields。Source absence、owner-unlink commit与residual uncertainty保持。
