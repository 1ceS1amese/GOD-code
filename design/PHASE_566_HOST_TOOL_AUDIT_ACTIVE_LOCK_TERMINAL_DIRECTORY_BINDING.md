# Phase566：Host tool audit active lock terminal directory binding

## 背景

Phase565把active coordination lock inspection升级为same-directory descriptor上的initial/final bounded child scans，并让valid owner descriptor跨越final scan后再次验证path/object/content。但当前顺序是：

1. final child scan；
2. lock directory logical path与pinned directory descriptor绑定；
3. pinned owner snapshot与logical owner path绑定；
4. 发布owner authority。

Owner path的`lstat`会跟随中间目录组件。若在步骤2完成后把original lock directory rename到hidden sibling，并在原lock path创建指向hidden original的symlink，步骤3仍会沿该symlink访问同一owner object。现有代码随后不再检查lock leaf，因此可把`entryType: directory`、valid owner、exclusive与cleanup fingerprint发布给一个实际已经是symlink的lock path。

Built Phase565 baseline probe已复现：在final owner snapshot的第一个owner-path `lstat`前执行上述rename/symlink替换，旧`cleanupAuditLock(...)`返回`ok: true`、warning、`confirmation_required: true`和owner fingerprint，而direct `lstat(lockPath)`已经是symbolic link。Destructive cleanup仍会fresh拒绝，因此未发生误删，但read-only operator evidence错误描述了当前lock leaf。

## Runtime Contract

`inspectJsonlAuditFileLock(...)`在valid pinned owner的final snapshot成功后，必须再次执行terminal directory binding：

1. 使用Phase565持有的original lock directory descriptor；
2. 再次读取descriptor/path/descriptor identity；
3. 要求logical lock path仍是directory并绑定original directory object；
4. 只有terminal gate成功才发布owner metadata与`ownerEntryExclusive`。

Terminal gate失败时：

- 设置`stateChanged: true`；
- 固定`ownerEntryExclusive: false`；
- 不发布owner path/token/PID/time；
- cleanup dry-run不得生成fingerprint。

Stable truncated、missing owner和invalid owner分支不需要新增terminal pass：它们不会持有valid owner descriptor，也不会在既有final directory binding之后执行新的awaited owner operation或产生owner authority。

## Ordering Invariant

Valid owner authority的最后三段顺序固定为：

```text
final bounded child scan
  -> directory binding
  -> pinned owner snapshot
  -> terminal directory binding
  -> authority projection
```

该顺序使persistent directory-to-symlink、directory replacement或renamed-original alias在owner revalidation期间发生时，必须在authority projection前被terminal gate观察到。Terminal check复用existing no-follow lock-path `lstat`与descriptor identity helper，不跟随lock leaf。

## CLI Contract

本阶段不新增CLI字段。Existing：

```text
coordination_lock_state_changed
coordination_lock_owner_entry_exclusive
coordination_lock_owner_metadata_status
coordination_lock_owner_fingerprint
```

继续表达结果。`inspect-path`输出state-changed warning；`cleanup-lock`在fingerprint前返回ERROR；quarantine recovery preflight和rotation recovery readiness继承同一inspection结果。Human/JSON不输出hidden path、owner token、symlink target或raw error。

## Tests

- Runtime在final owner revalidation前把lock leaf替换为指向renamed original directory的symlink，必须返回state changed且无owner authority。
- Cleanup dry-run面对相同race必须无fingerprint、无confirmation且不调用unlink/rmdir。
- Original owner与renamed directory内容必须保持，test finally显式恢复logical lock path后正常release。
- Stable exact single-owner、truncated、child drift和copied-owner replacement测试继续通过。
- Rotation recovery将terminal drift视为internal uncertain lock inspection并返回`state_changed`。
- Built smoke验证terminal lock-path `lstat`存在，race不产生fingerprint且不泄露hidden basename或owner token。

## 边界

- Read-only observation仍不是reservation；terminal gate返回后结果可以立即过期。
- 本阶段不承诺阻止same-user adversary执行快速ABA rename/restore；它保证persistent terminal leaf drift不会被owner-path intermediate symlink traversal掩盖。
- Destructive cleanup仍执行fresh descriptor-bound transaction revalidation。
- 不改变owner schema、fingerprint算法、confirmation flags、mutation commit point或residual semantics。
- 不新增JSON-RPC、agent event、provider、tool result、transcript或persistent schema字段。

## 验收标准

- Valid owner authority之前必须存在owner snapshot之后的terminal directory binding。
- Lock leaf在owner revalidation期间持续变为symlink或replacement时，inspection必须撤销authority。
- Cleanup dry-run不能为terminally drifted lock签发fingerprint。
- Existing Phase565 scan/state/error projection保持兼容。
- TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- `/tmp`与workspace无probe、lock、smoke或patch残留，无FileHandle GC warning。

## 实现结果

- Built Phase565 baseline probe在final owner snapshot第一个owner-path `lstat`前，将original lock directory rename到hidden sibling并在logical lock path创建指回original的directory symlink。旧实现最终仍返回`ok: true`、warning、`confirmation_required: true`、valid/exclusive owner evidence和fingerprint，而direct lock-path `lstat`已是symbolic link；probe finally恢复并正常release。
- `inspectJsonlAuditFileLock(...)`在valid pinned owner snapshot验证成功后，新增第二次`jsonlAuditLockPinnedDirectoryPathMatches(...)`。该terminal gate继续使用同一original directory descriptor；失败进入既有`stateChanged: true`、`ownerEntryExclusive: false`分支，owner path/token/PID/time不会投影。
- Stable truncated、missing owner与invalid owner分支保持一次final directory binding，因为它们不会在该gate后执行valid owner awaited operation或产生owner authority。Close/error、scan metadata与Phase565 CLI字段保持不变。
- 新增2项runtime tests：direct active inspection面对terminal directory-to-symlink rebinding撤销authority；rotation recovery面对同一internal drift返回`state_changed`且无fingerprint。新增1项CLI cleanup test，验证无confirmation/fingerprint、无unlink、无owner token或hidden basename泄露，renamed original与owner保持。
- 定向回归通过：`audit.test.ts` 204项、`cliAudit.test.ts` 68项，共272项。TypeScript build通过。
- Built CLI smoke新增terminal binding probe：valid branch执行5次lock-path与5次owner-path `lstat`；第4次owner-path读取前注入rename/symlink后，cleanup返回state-changed ERROR，unlink/rmdir均为0，无fingerprint或secret/path leakage，finally恢复logical path并正常release。
- 统一验收通过：Python 422项；TypeScript 43个test files、786项；TypeScript build、built CLI integration和CLI smoke全部通过。README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase528/530/542/565历史边界已同步；JSON-RPC、agent event、provider、tool result、transcript、persistent schema和CLI字段集合未变化。
- 最终审计确认`jsonlAuditSink.ts`无direct `fs.readdir(...)`，workspace无audit residue及`.tmp`/`.bak`/`.orig`/`.rej`文件，`/tmp`无`god-code-audit-*`、`god-code-phase566-*`、`.god-code-audit-rotation-*`或`god-code-smoke.*`残留，无integration/smoke/engine/test进程与FileHandle GC warning。

## Phase567 后续加固

Phase567把本阶段两次directory binding从object continuity升级为read-only full generation continuity。Terminal gate现在不仅拒绝symlink/replacement，还要求descriptor/path/descriptor继续匹配open-time ctimeNs/birthtimeNs；因此owner snapshot期间新增child不能依靠same device/inode通过。Mutation-oriented directory matcher保持原语义，避免transaction自身rename/unlink产生误拒绝。

## Phase570 后续加固

Phase570补齐terminal directory binding自身的await窗口：该gate成功后必须再检查一次owner path/object/content及full file generation。Gate期间只改写owner而不改变lock directory时也会进入state changed；Phase566 symlink/replacement protection与mutation-oriented matcher保持。

## Phase571 后续加固

Phase571把Phase566/570证明的terminal logical leaf与owner generation纳入active owner fingerprint。即使replacement在后续dry-run/confirmation窗口重新成为valid exact owner-only directory，只要其root或owner generation不同，fresh recomputation就与旧value不匹配并在private quarantine前拒绝。Terminal binding仍只负责read-only authority，transaction matcher语义不变。
