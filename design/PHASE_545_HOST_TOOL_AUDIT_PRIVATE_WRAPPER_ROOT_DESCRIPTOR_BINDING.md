# Phase545：Host tool audit private wrapper root descriptor binding

## 背景

Phase540至Phase544已经为selected lock/quarantine/disposal directories、owner files、recovery reservation和runtime lock建立descriptor transaction graph，并在descriptor-backed unlink/rmdir后验证original object确实脱链。

Main lock cleanup和owner-only quarantine cleanup仍各自创建一个transaction-owned private wrapper root：

- `<lock>.cleanup-XXXXXX` quarantine root；
- `<quarantine>.dispose-XXXXXX` disposal root。

这些roots由`mkdtemp`创建并chmod为0700，但helper当前只返回path。后续owner/lock rename、rollback和final rmdir没有持续固定original wrapper directory object，也无法应用Phase544 detachment proof。

Phase545把这两个private roots纳入descriptor graph。CLI command、fingerprint、commit point、residual field和namespace格式保持不变。

## Pinned Private Root Contract

Private root creation返回：

- generated absolute path；
- no-follow `O_DIRECTORY` handle；
- BigInt device/inode/ctimeNs/birthtimeNs identity。

Creation sequence：

1. `mkdtemp`创建unique directory；
2. 立即open/pin current root；
3. chmod 0700；
4. 重验path/descriptor identity；
5. 要求initial entry set为空；
6. 把handle ownership交给cleanup transaction。

Initialization在取得handle后失败时，只删除descriptor-bound exact-empty original root，并验证`nlink === 0`；所有路径关闭handle。Pinning前发生的不确定replacement不递归删除。

## Wrapper Entry-Set Binding

Shared wrapper assertion按排序后的exact entry set重验：

- main quarantine root：
  - initial：empty；
  - lock rename后：`lock`；
  - owner isolation后：`lock`, `owner.json`；
  - selected lock rmdir后：`owner.json`；
  - owner unlink后：empty。
- owner-only quarantine disposal root：
  - initial：empty；
  - owner isolation后：`owner.json`；
  - owner restore或unlink后：empty。

每次entry read前后都要求wrapper current path仍与original descriptor匹配。Known child candidate仍由其独立directory/owner handles验证；wrapper handle不能替代child handles。

## Main Cleanup Lifecycle

Quarantine root handle跨越：

- `beforeQuarantine` callback；
- selected lock rename到`lock` child；
- owner isolation到root；
- selected child rmdir commit；
- pre-commit rollback；
- owner unlink；
- final root rmdir或residual result。

Final root rmdir后必须通过Phase544 directory detachment proof。Post-commit proof failure继续返回`residualQuarantinePath`，不搜索被移动的root。

## Owner-Only Quarantine Cleanup Lifecycle

Disposal root handle跨越：

- `beforeOwnerIsolation` callback；
- owner isolation；
- `afterOwnerIsolation` callback；
- selected quarantine rmdir commit；
- pre-commit owner restore；
- isolated owner unlink；
- final root rmdir或residual result。

Final root rmdir同样要求original descriptor `nlink === 0`和target missing。Post-commit failure沿用`residualDisposalPath`。

## Failure Semantics

- Wrapper path replacement或unexpected entry在commit前拒绝，并只在original wrapper仍可绑定时rollback。
- Rollback root rmdir只有在exact-empty、path-bound和post-rmdir detachment proof均通过时返回complete。
- Commit后wrapper drift不改变selected lock/quarantine已经removed的事实，但必须通过既有residual field暴露。
- Unknown entries不递归删除；original root被移动到未知path时不扫描temp namespace寻找。
- Wrapper handle与candidate handles在top-level `finally`全部关闭；close failure遵循现有cleanup error传播边界。

## Tests

- Main cleanup在`beforeQuarantine`发生private root replacement时拒绝，不把replacement当作original wrapper。
- Main cleanup final wrapper rmdir的wrong-object fake success返回residual而不是完整contraction。
- Owner-only quarantine cleanup在private disposal root replacement时拒绝并保留owner/candidate。
- Owner-only quarantine cleanup final disposal rmdir的wrong-object fake success返回residual。
- Existing success、rollback、extra-entry、owner replacement、post-commit residual和CLI tests保持。
- TypeScript、Python、built integration和CLI smoke全量回归通过。

## 边界

- Wrapper descriptor binding仍不能阻止path syscall删除replacement；Phase544 postcondition只能检测。
- 不新增native `unlinkat`/`renameat2`、FFI、addon或helper process。
- 不改变private namespace naming、0700 mode、owner schema或fingerprint。
- 不增加CLI字段；residual path在original root被移动时仍是derived transaction path，不承诺发现未知新位置。
- 不扩展到与audit lock maintenance无关的generic temp directories。

## 验收标准

- 两类private wrapper roots从creation后到transaction终止持续持有original directory descriptor。
- 每次known child mutation前后都验证wrapper path与exact entry set。
- Rollback/final wrapper rmdir均要求descriptor-backed detachment proof。
- Wrapper replacement、extra entry和wrong-object fake-success不会被报告为完整成功。
- Candidate directory/owner descriptor、commit point、rollback和residual contracts保持。
- 所有handles在success、error、rollback和residual路径关闭。
- 全量统一验收通过且无FileHandle GC warning、audit temp residue或workspace临时补丁文件。

## 实现结果

- 新增`JsonlAuditLockPinnedTemporaryDirectory`，private temporary root helper在`mkdtemp`后立即取得no-follow directory handle，并返回generated path、handle与BigInt identity。
- 新增shared exact-entry assertion与descriptor-backed empty-root removal helper；两者在entry读取或rmdir前后持续重验current path与original descriptor。
- Main lock cleanup按empty、`lock`、`lock + owner.json`、`owner.json`、empty绑定private quarantine lifecycle，rollback与post-commit contraction均复用同一pinned root。
- Owner-only quarantine cleanup按empty、`owner.json`、empty绑定private disposal lifecycle，owner restore、owner unlink和final contraction保持selected candidate与wrapper两组handles。
- Top-level `finally`统一关闭candidate directory、owner file与可选wrapper handles；creation initialization failure只尝试删除descriptor-bound exact-empty original root并保留原始错误。
- 新增四项竞争测试：main/disposal wrapper pre-commit replacement拒绝，以及两类final wrapper rmdir wrong-object fake-success residual报告。
- 定向audit回归通过：`audit.test.ts` 94项、`cliAudit.test.ts` 45项，共139项；TypeScript build通过。
- 统一验收通过：Python 422项；TypeScript 43个test files、653项；TypeScript build、built CLI integration和CLI smoke全部通过。
- `/tmp`下无`god-code-audit-*`临时残留，workspace无`.tmp`、`.bak`、`.orig`或`.rej`文件，也没有FileHandle GC warning。

## Phase546 后续

Phase546让本阶段的private root同时持有parent descriptor，并以shared mutation adapter执行root创建和完整child lifecycle。Linux使用经过descriptor identity验证的procfd child path固定parent resolution，非Linux/procfs unavailable继续使用validated logical path；Phase545 exact entry set、rollback、detachment proof和residual contracts保持。
