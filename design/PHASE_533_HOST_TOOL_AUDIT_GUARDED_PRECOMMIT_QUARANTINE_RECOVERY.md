# Phase533：Host tool audit guarded pre-commit quarantine recovery

## 背景

Phase531能够识别Phase530 cleanup事务留下的`lock_with_owner`与`lock_and_owner` pre-commit residue，Phase532则只删除已经提交旧lock directory删除的`owner_only` residue。Pre-commit residue仍保存完整valid owner identity，不能按post-commit垃圾直接删除；更安全的动作是把owner恢复为标准coordination lock，再由operator单独决定是否运行Phase530的`cleanup-lock`。

Phase533新增：

```text
god-code audit recover-lock-quarantine <id> [--dry-run|--yes --expect-owner <fingerprint>] [--json]
```

该命令只恢复valid `lock_with_owner`或`lock_and_owner` residue，不直接删除恢复后的coordination lock。

## Selection Contract

`<id>`必须为六字符ASCII alphanumeric quarantine ID。Runtime始终从当前configured audit file重新派生：

```text
<derived-lock-path>.cleanup-<id>
```

CLI不接受任意filesystem path，也不允许把其他temp entry或用户目录作为恢复源。

## Eligibility

候选必须满足以下任一exact layout：

```text
lock_with_owner:
  quarantine/
    lock/
      owner.json

lock_and_owner:
  quarantine/
    lock/
    owner.json
```

并同时满足：

- quarantine root与nested `lock`均为directory；
- root和nested entry set与layout完全一致；
- selected owner metadata通过4096-byte bounded no-follow parser；
- owner file为single-link regular file；
- owner token、PID和canonical acquired time schema valid；
- recovery前后root directory、nested lock与owner file dev/ino保持绑定；
- 当前derived coordination lock path不存在。

以下状态全部拒绝：

- `owner_only`
- `empty`
- `unknown`
- invalid/missing selected owner metadata
- regular file、symlink或other quarantine blocker
- 已存在的coordination lock directory或其他entry type

## Confirmation

默认dry-run输出：

- quarantine ID/path/layout；
- selected owner location、metadata status、PID和acquired time；
- 当前coordination lock path及snapshot acquirable状态；
- 32字符owner fingerprint；
- `confirmation_required: true`；
- `liveness_verified: false`；
- `recovered: false`。

真实恢复必须同时提供：

```text
--yes --expect-owner <fingerprint>
```

错误fingerprint返回error且不回显当前正确fingerprint。Fingerprint只把operator确认绑定到本次owner token，不证明进程存活，也不是authentication secret。

## Atomic Lock Reservation

Node.js没有通用的directory rename-no-replace primitive，因此恢复不直接把nested `lock` rename到derived lock path。底层先使用atomic `mkdir(lockPath, 0700)`建立不可覆盖的reservation：

1. 读取并验证pre-commit candidate，捕获quarantine root、nested lock和owner file identity。
2. 对derived coordination lock path执行atomic mkdir；`EEXIST`立即拒绝，不覆盖现有entry。
3. 捕获新lock directory dev/ino。
4. 再次验证quarantine layout、root/nested identity、owner identity、token和fingerprint。
5. 将selected `owner.json` rename到新lock directory。
6. 验证新lock仍为同一directory，只包含原owner identity/token。
7. 验证旧quarantine已收敛为root只含空nested `lock`。
8. 到此提交recovery；恢复后的coordination lock会阻塞协作writer。
9. 提交后仅用identity+empty gate rmdir旧nested lock和quarantine root。

该流程不会覆盖另一个writer或operator在derived lock path建立的entry。

## Pre-commit Rollback

在第8步提交前失败时：

- owner尚未转移时，只尝试删除本命令创建且identity仍匹配的空reservation；
- owner已经转移时，先验证新lock中的owner identity/token，再把owner rename回原layout-selected path；
- owner恢复后重新验证原quarantine exact layout；
- 新lock directory只有在identity仍匹配且为空时才rmdir；
- 若新lock出现未知extra entry，owner会恢复到quarantine，extra entry不会被删除，并通过`residual_lock_path`返回结构化error；
- 若directory replacement或owner destination安全性无法验证，保留可疑状态并返回包含具体路径的错误。

Rollback不递归删除任何目录，也不删除未知entry。

## Post-commit Residue

Recovery提交后，标准coordination lock已经成立。旧quarantine清理失败不会回滚该锁：

- `recovered: true`保持；
- `residual_quarantine_path`报告未能安全rmdir的旧root；
- CLI返回warning，并要求operator重新inspection；
- 后续writer仍会把恢复后的lock视为occupied。

若operator确认该owner已经失效并希望删除恢复后的lock，必须另行运行：

```text
god-code audit cleanup-lock --dry-run --json
god-code audit cleanup-lock --yes --expect-owner <fingerprint> --json
```

Recovery和cleanup是两个独立确认事务。

## CLI Safety

- `--dry-run`与`--yes`互斥。
- `--expect-owner`必须与`--yes`一起使用。
- ID必须为六字符ASCII alphanumeric。
- Fingerprint必须为32字符lowercase hex。
- Invalid config或disabled persistence拒绝mutation。
- Active或blocked coordination lock path始终拒绝恢复。
- Command不读取、写入、chmod或rotate audit target。
- PID、age与timestamp不参与授权。
- Human/JSON输出不包含UUID owner token或owner JSON原文。

## Tests

- `lock_with_owner`恢复为valid single-owner coordination lock。
- `lock_and_owner`恢复为相同标准lock形态。
- Existing coordination lock和reservation race均拒绝覆盖。
- Wrong fingerprint保留quarantine，报告不泄露正确fingerprint。
- Owner转移后新lock出现extra entry时恢复owner并保留extra entry。
- `owner_only`、`empty`、`unknown`、invalid metadata及non-directory entry均被CLI拒绝。
- Default dry-run不创建coordination lock且不泄露UUID token。
- Built CLI integration验证inspection -> recovery dry-run -> confirmed recovery -> separate cleanup-lock完整流程。

## 边界

- 本阶段不自动判断owner PID是否仍活跃。
- 本阶段不按age推断stale，不启动后台reaper。
- 本阶段不恢复`owner_only`，因为该layout已经没有旧lock directory语义。
- 本阶段不删除`empty`或`unknown` residue。
- 恢复后的lock可能来自已终止进程，operator必须显式inspection并单独确认cleanup。
- 用户态identity checks仍不是内核transaction；same-user adversary可制造拒绝或残留，但不能通过该命令覆盖现有coordination entry或扩大递归删除范围。

## 验收标准

- 只有valid pre-commit layout可进入dry-run confirmation。
- Mutation绑定ID、quarantine root/nested identity、owner identity、token和fingerprint。
- Atomic mkdir保证existing lock不被覆盖。
- 提交前失败尽可能恢复原layout，未知entry不被删除。
- 提交后恢复出的coordination lock具备Phase529 owner metadata与single-entry invariant。
- CLI不输出owner token或owner JSON原文。
- Phase530 cleanup、Phase531 inspection与Phase532 owner-only cleanup语义保持。
- TypeScript、Python和integration全量回归通过。

## Phase564 后续加固

Phase564把recovery candidate selection、pre-transfer revalidation、post-transfer quarantine assertion和rollback contraction的entry-set读取切换为descriptor-bound 2-entry scanner。Truncated root或nested lock不能取得recovery authority；overflow state在owner transfer等destructive mutation前拒绝并保留，Phase533 fingerprint、layout、rollback和residual接口不变。

## 实现结果

- 新增`recoverJsonlAuditLockQuarantine`及两类pre-commit recovery candidate绑定。
- 新增atomic lock reservation、owner transfer、pre-commit rollback和post-commit residue报告。
- 新增`audit recover-lock-quarantine`human/JSON CLI并复用owner fingerprint确认parser。
- Tests覆盖两类成功布局、occupied path、fingerprint mismatch、reservation race和post-transfer extra entry restore。
- Integration覆盖恢复后再通过独立`cleanup-lock`删除的完整operator流程。
- README、SECURITY、protocol、architecture、internal design、project plan和extension docs同步Phase533边界。

## Phase541 加固

Phase541为recovery candidate的quarantine root、nested `lock`以及atomic mkdir reservation分别持有no-follow `O_DIRECTORY` descriptor。Handles跨owner transfer、rollback和post-commit contraction保持有效，并在top-level `finally`关闭。Current path必须持续绑定原descriptor，因此复制相同layout/owner metadata的root、nested或recovered-lock replacement都会拒绝；Phase533 CLI、commit point与residual reporting语义保持不变。

## Phase542 加固

Phase542为layout-selected owner file增加第四个pinned object edge。Owner handle跨source validation、rename到reservation、recovered-lock validation和rollback restore保持有效；复制相同metadata的source或destination owner file replacement都会拒绝，directory descriptor graph与Phase533 commit/residual contract不变。

## Phase547 加固

Phase547为recovery graph增加shared parent edge。Reservation通过parent anchor exact-create并从actual mutation path打开；owner transfer/restore从source/recovered directory anchors执行，rollback reservation与post-commit nested/root contraction从相应parent anchors执行。Linux使用validated procfd child paths，fallback重验logical parent；Phase533 eligibility、commit point、rollback和residual report不变。

## Phase568 加固

Phase568使recovery CLI使用的quarantine readiness projection只接受stable selected owner。`lock_with_owner`/`lock_and_owner`在final bounded scans后复读layout-selected owner，并终检root/nested open-time generation；owner或layout drift进入`state_changed`且不会生成recovery fingerprint。Confirmed recovery仍在锁内执行Phase533/541/542/547的独立fresh candidate validation与mutation transaction。

## Phase571 加固

Phase571让pre-commit recovery fingerprint绑定quarantine domain、absolute root path、exact layout/owner location、root与nested lock full generations以及layout-selected owner generation/metadata。Recovery从fresh pinned candidate重算后，才允许创建active lock reservation；dry-run后复制整个pre-commit layout到replacement path generation会在首个mkdir/rename前被旧fingerprint拒绝。Recovery成功后active lock属于不同domain/path generation，后续cleanup必须重新dry-run取得active fingerprint，不能复用quarantine confirmation。

## Phase572 加固

Phase572要求recovery positive owner confirmation来自`recoverJsonlAuditLockQuarantine(...)`的existing result，而不是CLI preflight snapshot。Runtime replacement rejection与pre-reservation disappearance分别返回ERROR或idempotent WARN且省略positive match/fingerprint；verified existing rollback/residual result仍可发布runtime-returned exact fingerprint，并继续由`recovered`、`residual_lock_path`和`residual_quarantine_path`表达transaction outcome。Reservation、commit与rollback边界不变。

## Phase574 投影边界修正

Phase574明确successful recovery返回的`residual_quarantine_path`只是old quarantine cleanup uncertainty locator，不是logical quarantine path current-existence proof。无residual时CLI继续投影`quarantine_exists: false`；有residual时保留locator与WARN并省略该optional boolean，覆盖logical path仍present和wrong-object contraction后missing两类结果。`recovered: false`且`residual_lock_path`存在的verified rollback-residual branch仍保留`quarantine_exists: true`与`coordination_lock_exists: true`，Phase533 reservation、commit、rollback及runtime result不变。

## Phase575 投影边界修正

Phase575在recovery runtime candidate missing时撤销preflight quarantine structure/owner evidence及全部active coordination lock state，只保留derived paths、`quarantine_exists: false`与`recovered: false`。Missing fast path没有创建lock，但也没有重新观察current lock namespace；并发writer创建的active lock因此不能被旧`coordination_lock_exists: false`遮蔽。Phase533 existing recovery、verified rollback-residual与successful residual semantics保持。

## Phase576 descriptor finalization 加固

Phase576把quarantine recovery候选目录、owner、parent与recovered-lock handles的close改为normalized all-settled finalization。Successful recovery和verified rollback-residual都先固定result，再投影`recoveryHandlesClosed`及optional warning；close failure不能再覆盖`recovered`、fingerprint、`residual_quarantine_path`或`residual_lock_path`。Primary recovery error仍保持原message，本阶段暂不为rejected operation新增secondary warning envelope；reservation、owner transfer、commit与rollback不变。

## Phase577 rejection lifecycle 加固

Phase577完成本阶段延期的rejected recovery envelope。Root/nested/owner candidate selection和reservation/transfer前operation failure都抛出typed maintenance error，三个candidate handles及outer parent/recovered-lock handles分别经all-settled closure合并。CLI ERROR投影recovery closure fields并保留primary message；reservation、owner transfer、verified rollback residual、successful residual与missing contract保持。
