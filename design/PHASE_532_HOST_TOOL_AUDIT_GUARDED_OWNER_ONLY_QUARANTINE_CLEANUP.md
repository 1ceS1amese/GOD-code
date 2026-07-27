# Phase532：Host tool audit guarded owner-only quarantine cleanup

## 背景

Phase531已经能只读识别`owner_only`、`lock_with_owner`、`lock_and_owner`、`empty`和`unknown` quarantine residue。只有`owner_only`明确表示Phase530已经提交旧lock directory删除，仅剩隔离owner file与quarantine root；其他布局可能仍包含可恢复的pre-commit state或缺少稳定owner identity，不能共用删除动作。

Phase532新增：

```text
god-code audit cleanup-lock-quarantine <id> [--dry-run|--yes --expect-owner <fingerprint>] [--json]
```

该命令只删除valid `owner_only` residue。

## Selection Contract

`<id>`必须为Phase531输出的六字符ASCII alphanumeric quarantine ID。Runtime始终从当前configured audit file重新派生prefix：

```text
<derived-lock-path>.cleanup-<id>
```

CLI不接受任意filesystem path，因此不能借该命令选择其他temp entry或用户目录。

## Eligibility

候选必须同时满足：

- quarantine path存在且为directory；
- exact layout为`owner_only`；
- root只包含`owner.json`；
- owner metadata通过4096-byte bounded no-follow parser；
- owner file为single-link regular file；
- owner token、PID和canonical acquired time schema valid；
- dry-run或执行阶段观察期间没有identity/content drift。

以下状态全部拒绝：

- `lock_with_owner`
- `lock_and_owner`
- `empty`
- `unknown`
- regular file、symlink或other blocker
- missing/invalid owner metadata

## Confirmation

无mutation flag时默认dry-run，输出：

- quarantine ID/path/layout；
- owner metadata status、PID和acquired time；
- 32字符owner fingerprint；
- `confirmation_required: true`；
- `liveness_verified: false`；
- `removed: false`。

真实删除必须同时提供：

```text
--yes --expect-owner <fingerprint>
```

错误fingerprint返回error且不回显当前正确fingerprint。Fingerprint仍不是authentication secret或PID liveness proof，只用于把operator确认绑定到本次owner token。

## Owner Isolation Transaction

`cleanupJsonlAuditLockQuarantine`不先rename或释放selected quarantine path：

1. lstat candidate并捕获directory dev/ino。
2. Bounded读取root owner，捕获owner dev/ino与完整token。
3. 验证exact owner-only entry set和expected fingerprint。
4. 创建`<quarantine>.dispose-XXXXXX` 0700 private disposal root。
5. Mutation前再次验证directory identity、owner identity、token和single-entry invariant。
6. 将`owner.json` rename到private disposal root。
7. 验证moved owner仍匹配原owner dev/ino与token。
8. 要求原quarantine directory identity不变且为空。
9. rmdir原quarantine directory，完成提交。
10. 最后unlink隔离owner并rmdir disposal root。

原quarantine path直到第9步提交才释放，避免owner隔离过程中同一ID被重新创建。

## Failure and Restore

提交前失败时：

- 若owner尚未隔离，只移除空disposal root。
- 若owner已隔离且原directory identity仍匹配，则把owner恢复到原path。
- 恢复owner不要求目录仍为空；same-identity目录中新出现的未知entry会保留，restored candidate由Phase531分类为`unknown`。
- 若directory已replacement或owner destination不安全，保留disposal root并返回明确错误；不删除未知目录。

提交后若owner/disposal删除失败，quarantine本身仍报告`removed: true`，同时返回`residual_disposal_path` warning。

## CLI Safety

- `--dry-run`与`--yes`互斥。
- `--expect-owner`必须与`--yes`一起使用。
- ID必须为六字符ASCII alphanumeric。
- Fingerprint必须为32字符lowercase hex。
- Invalid config或disabled persistence拒绝mutation。
- Command不读取、写入、chmod或rotate audit target。
- Active coordination lock path不参与该事务，也不会被删除。

## Tests

- Valid `owner_only`和正确fingerprint删除selected residue。
- Active coordination lock保持，holder仍可正常release。
- Wrong fingerprint保留residue且失败报告不泄露正确fingerprint。
- Owner token在isolation前漂移时拒绝删除。
- Owner隔离后出现extra entry时恢复owner、保留extra entry并返回失败。
- `lock_with_owner`等pre-commit layout被CLI拒绝。
- Default dry-run不修改entry并不泄露UUID token。
- CLI缺失ID、确认冲突和错误fingerprint返回稳定status code。
- Built CLI integration验证inspection -> dry-run -> confirmed cleanup完整流程。

## 边界

- 本阶段不恢复`lock_with_owner`或`lock_and_owner`。
- 本阶段不删除`empty`，因为没有可跨命令确认的owner identity。
- 本阶段不删除unknown、invalid metadata或non-directory entry。
- Disposal root不是Phase531 exact quarantine namespace；若提交后残留，必须按返回path人工处理，后续阶段可增加独立inspection。
- 用户态identity checks仍不是内核transaction；same-user adversary可制造拒绝或残留，但不会扩大递归删除范围。

## 验收标准

- 只有valid owner-only residue可进入dry-run confirmation。
- Mutation必须绑定ID、directory identity、owner identity、token和fingerprint。
- 提交前extra entry不会被删除，owner尽可能恢复。
- Pre-commit layout和empty不被误删。
- CLI不输出owner token或owner JSON原文。
- Phase530 lock cleanup与Phase531 inspection语义保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增quarantine ID/path helper和direct single-entry inspection。
- 新增identity-bound owner-only cleanup与private disposal transaction。
- 新增`audit cleanup-lock-quarantine`human/JSON CLI和共享确认flag parser。
- Tests覆盖success、mismatch、token drift、post-isolation extra entry restore和pre-commit refusal。
- README、SECURITY、protocol、architecture、internal design、project plan和extension docs同步Phase532边界。

## Phase540 加固

Phase540为selected owner-only quarantine持有no-follow `O_DIRECTORY` descriptor，跨越owner isolation、empty-root revalidation、rmdir和rollback，并在top-level `finally`关闭。Current path必须持续绑定到原descriptor，因此复制相同owner metadata的replacement会在commit前被拒绝并保持不变；CLI eligibility与fingerprint contract不变。

## Phase542 加固

Phase542同时pin selected `owner.json` regular file。Handle跨owner isolation到private disposal、rollback restore和最终unlink保持有效，owner path每次rename后都重新绑定同一descriptor；copied-metadata owner replacement不再依赖number dev/ino识别。

## Phase545 加固

Phase545为private disposal root增加creation-time no-follow directory handle，并按empty、`owner.json`、empty的exact entry set约束owner isolation、rollback和final contraction。Final root rmdir必须由original descriptor证明`nlink === 0`；wrapper replacement在commit前拒绝，commit后failure继续返回`residual_disposal_path`，selected quarantine与owner confirmation contract不变。

## Phase546 加固

Phase546让private disposal root同时持有parent handle，并把owner isolation/restore、selected quarantine rmdir、owner unlink和final wrapper contraction接入feature-probed descriptor-relative mutation adapter。Linux parent lookup绑定open descriptors，其他平台保持validated path fallback；owner confirmation、commit point和`residual_disposal_path`不变。

## Phase568 加固

Phase568收紧cleanup dry-run前的owner-only quarantine inspection：selected root owner必须在final scan后重新读取并与initial file object及canonical metadata一致，随后root directory仍需匹配open-time full generation。Owner原地改写或child/layout drift不再产生confirmation fingerprint，CLI在mutation入口前以`state_changed`/`unknown`拒绝。真实cleanup仍执行Phase532及后续阶段的fresh descriptor-bound transaction，commit与rollback语义不变。

## Phase570 加固

Phase570在owner-only quarantine的terminal root generation gate之后增加最终owner generation inspection。若owner在该gate期间原地改变，即使root generation未变，dry-run也不会发布fingerprint或confirmation，且不调用unlink/rmdir；Phase532 destructive cleanup的fresh pinned owner、isolation、rollback与contraction语义不变。

## Phase571 加固

Phase571把owner-only quarantine confirmation从owner-token digest升级为quarantine candidate digest。Dry-run发布的32-hex值绑定absolute path、`owner_only`/root location、root full generation、selected owner full generation与canonical metadata；mutation从fresh pinned root重算并在private disposal wrapper或任何namespace mutation前拒绝mismatch。Copied-owner directory replacement因此不能使用original dry-run value触发cleanup，Phase532 owner isolation commit、rollback和residual semantics保持。

## Phase572 加固

Phase572把owner-only quarantine cleanup的positive match/fingerprint投影移到runtime existing result之后。Preflight match只允许调用fresh cleanup；candidate在该窗口replacement时runtime ERROR不再携带旧`true`或旧fingerprint，candidate missing时idempotent WARN也省略positive evidence。Stable success与post-commit disposal residual仍发布runtime返回的exact expected fingerprint，Phase532 commit、rollback和residual contract不变。

## Phase573 加固

Phase573让owner-only quarantine runtime existing result统一投影`quarantine_exists: false`。Owner isolation commit与selected root rmdir已经删除原quarantine basename，后续private disposal wrapper residual只由`residual_disposal_path`表示。Stable success和residual WARN不再保留preflight `true`，Phase532 eligibility、fingerprint、rollback与post-commit residual语义不变。

## Phase575 投影边界修正

Phase575在owner-only quarantine runtime candidate missing时只保留selected path、`quarantine_exists: false`和`removed: false`，撤销preflight entry/layout/owner/state evidence及positive confirmation fields。Phase532 dry-run、runtime existing owner isolation、rollback与post-commit disposal residual保持。

## Phase576 descriptor finalization 加固

Phase576让owner-only quarantine cleanup的resolved stable/residual result先于candidate、owner、private disposal及parent descriptor finalization确定。任一close失败时保持`removed:true`、runtime-confirmed owner fingerprint、selected absence与`residual_disposal_path`，并通过cleanup lifecycle fields和CLI WARN表达secondary uncertainty。Owner isolation commit、rollback、unknown-entry preservation与runtime missing contract不变。

## Phase577 rejection lifecycle 加固

Phase577为shared quarantine candidate reader和owner-isolation前failure增加typed cleanup rejection evidence。Wrong fingerprint或operation hook primary error保持，candidate/owner/private parent handles通过all-settled关闭并报告closure outcome。CLI ERROR不再丢失secondary warning，Phase532 eligibility、rollback、commit与residual rules保持。
