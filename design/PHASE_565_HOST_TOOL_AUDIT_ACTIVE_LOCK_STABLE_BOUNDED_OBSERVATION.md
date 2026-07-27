# Phase565：Host tool audit active lock stable bounded observation

## 背景

Phase564把active coordination lock child enumeration改为descriptor-bound 2-entry scanner，但`inspectJsonlAuditFileLock(...)`只扫描一次，然后读取owner metadata并直接返回。若lock directory在首次scan后发生变化，inspection仍可能把旧single-owner snapshot标记为`ownerEntryExclusive: true`。

Built Phase564 baseline probe已复现：正常holder首次scan看到单一`owner.json`后，在owner open前注入`late-overflow-secret`。旧`cleanupAuditLock(...)`仍返回`ok: true`、dry-run warning、`confirmation_required: true`和owner fingerprint，而实际目录已经包含两个entries。Destructive cleanup仍会在mutation时重新验证并拒绝，因此未发生误删；但dry-run错误签发了operator confirmation evidence，且CLI没有scan或state-drift字段解释该竞态。

Phase565把active lock inspection升级为稳定bounded observation，并使所有Host-local lock diagnostics只在同一directory与owner descriptors证明initial/final状态一致时发布owner authority。

## Runtime Observation Contract

`JsonlAuditLockInspection`新增：

```text
entryCount?
entryScanCount?
entryScanLimit?
entryScanTruncated?
stateChanged?
inspectionErrorCode?
```

Directory observation顺序：

1. 对derived lock path执行initial no-follow `lstat`并记录type/age；
2. no-follow打开directory descriptor，并证明与initial path dev/ino一致；
3. 执行Phase564 2-entry bounded initial scan，投影count/limit/truncated；
4. 仅在scan未截断时读取owner状态；valid owner使用pinned owner-file descriptor，不立即关闭；
5. 在同一directory descriptor上执行bounded final scan；
6. 验证initial/final names与truncation bit、logical path/directory descriptor绑定；
7. valid owner再次通过原owner descriptor读取metadata snapshot并验证path/object/content连续性；
8. 只有全部stable checks通过后才发布owner metadata与`ownerEntryExclusive`；最后all-path关闭owner与directory handles。

`entryCount`仅在initial scan未截断时表示exact count。Stable truncated directory输出scan metadata和`ownerEntryExclusive: false`，不读取或发布owner authority。Initial/final child set、directory path或valid owner object/content任一漂移都输出`stateChanged: true`、`ownerEntryExclusive: false`，不发布owner token/PID/time。非竞态inspection failure只输出non-secret `inspectionErrorCode`。

Close failure也撤销owner authority并进入inspection error projection，不能由cleanup dry-run生成fingerprint。

## Cleanup Authority Contract

`cleanupAuditLock(...)`在owner metadata和exclusive检查前拒绝：

- `stateChanged: true`；
- `inspectionErrorCode`存在；
- `entryScanTruncated: true`。

只有stable、not-truncated、exact single `owner.json`且valid owner metadata的inspection才输出dry-run owner fingerprint。Mutation仍执行Phase530/540/542/545/546/564的fresh descriptor-bound revalidation；本阶段不把read-only inspection转换为reservation。

## CLI Contract

Active lock相关Host-local details新增：

```text
coordination_lock_entry_count
coordination_lock_entry_scan_count
coordination_lock_entry_scan_limit
coordination_lock_entry_scan_truncated
coordination_lock_owner_entry_exclusive
coordination_lock_state_changed
coordination_lock_inspection_error_code
```

字段同步到：

- `audit inspect-path`；
- `audit cleanup-lock`；
- `audit recover-lock-quarantine`的coordination-lock preflight；
- rotation recovery readiness的coordination-lock projection。

`inspect-path`对state drift、inspection failure、truncation和stable unexpected entry set输出warning，不生成cleanup authority。`cleanup-lock`对这些状态输出ERROR且不包含owner fingerprint。Human与JSON只输出scalar metadata，不输出child names、owner token或raw error。

Rotation recovery的initial/final lock comparison同时纳入scan、exclusive、state/error字段；任一internal uncertainty直接形成`coordinationLockStateChanged`与`state_changed` assessment，而不是把不稳定directory当成普通active lock snapshot。

## Tests

- Stable exact single-owner lock执行两次bounded scan，输出exact count、scan metadata、exclusive和valid owner evidence。
- Stable three-child lock每次最多读取`limit + 1`次，不调用selected lock `readdir`，省略exact count和owner authority。
- 在owner open前注入extra child时，initial/final scan drift形成`stateChanged`且无owner token。
- 在owner snapshot后替换同名copied metadata文件时，pinned owner descriptor连续性检查形成`stateChanged`。
- Cleanup dry-run面对child drift、truncation或inspection error不输出fingerprint。
- `inspect-path`、cleanup、quarantine recovery和rotation readiness的snake_case projection保持一致。
- Built smoke复现旧fingerprint签发竞态，验证新实现两次scan、无selected `readdir`、无unlink、无fingerprint且unknown child保持。

## 边界

- Observation不是lock reservation，返回后仍可立即过期；destructive command继续fresh revalidation。
- Stable active holder仍只表示occupied，不证明PID liveness或staleness。
- Scanner不分页、不统计overflow total、不输出child names。
- 本阶段不自动清理active、truncated、changed或invalid lock。
- Owner fingerprint算法、confirmation flags和cleanup transaction commit point不变。
- 不新增JSON-RPC、agent event、provider、tool result、transcript或persistent schema字段。

## 验收标准

- Active lock owner authority必须由same-directory initial/final bounded scans和valid owner descriptor continuity共同证明。
- Child或owner drift不能产生cleanup dry-run fingerprint。
- Truncated scan永远无exact count、owner authority或confirmation evidence。
- Rotation recovery不能把internally uncertain lock inspection视为stable snapshot。
- Existing acquisition/release、cleanup mutation、quarantine recovery和rotation contracts保持。
- TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- `/tmp`与workspace无probe、lock、smoke或patch残留，无FileHandle GC warning。

## 实现结果

- Built Phase564 baseline probe复现了旧dry-run authority缺口：首次single-owner scan后注入`late-overflow-secret`，旧`cleanupAuditLock(...)`仍返回warning、`confirmation_required: true`和owner fingerprint，而on-disk lock已包含两个entries；destructive path虽会fresh拒绝，但operator evidence已经过期。
- `JsonlAuditLockInspection`新增exact/scan/truncation、`stateChanged`和bounded `inspectionErrorCode`字段。Active inspector保持原lock directory descriptor，执行initial/final scans；initial未截断时才读取owner，valid pinned owner handle跨final scan，并在projection前再次验证directory path与owner path/object/content。
- Initial/final child set、truncation、directory binding或owner continuity任一漂移都会设置`stateChanged: true`、`ownerEntryExclusive: false`并清除owner token/PID/time；stable truncation不读取owner，close或其他non-race failure撤销owner authority并只输出non-secret error code。
- Rotation recovery lock snapshot与matcher新增entry count/scan/truncation、exclusive及inspection error evidence；initial/final snapshot drift或任一internal uncertain inspection均形成`coordinationLockStateChanged`和`state_changed` assessment。
- CLI inspect-path、cleanup-lock、recover-lock-quarantine preflight与rotation recovery readiness统一投影`coordination_lock_entry_*`、exclusive、state/error fields。Cleanup在owner validation与fingerprint生成前拒绝state drift、inspection error和truncation；human/JSON不输出owner token、child names或raw error。
- 新增3项runtime tests，覆盖stable truncated active lock的bounded read/no-`readdir`、initial/final child drift与copied-owner replacement；新增2项CLI tests，覆盖truncation projection及drift时无fingerprint、无unlink、无secret/name leakage。定向回归通过：`audit.test.ts` 202项、`cliAudit.test.ts` 67项，共269项。
- Built CLI smoke新增active-lock竞态probe：initial owner-only scan与注入后的final two-entry scan共2次open/5次read，selected `readdir`和unlink均为0；cleanup返回state-changed error，不含fingerprint，late child与owner保持。
- 统一验收通过：Python 422项；TypeScript 43个test files、783项；TypeScript build、built CLI integration和CLI smoke全部通过。README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase528/530/542/564历史边界已同步；JSON-RPC、agent event、provider、tool result、transcript与persistent schema未变化。
- 最终审计确认`jsonlAuditSink.ts`无direct `fs.readdir(...)`，workspace无audit residue及`.tmp`/`.bak`/`.orig`/`.rej`文件，`/tmp`无`god-code-audit-*`、`god-code-phase565-*`、`.god-code-audit-rotation-*`或`god-code-smoke.*`残留，无integration/smoke/engine/test进程与FileHandle GC warning。

## Phase566 后续加固

Phase566补齐本阶段valid owner final snapshot之后没有再次检查lock directory leaf的顺序窗口。Owner path检查会跟随中间目录symlink，因此renamed original directory被原path symlink指回时仍可能命中同一owner。新terminal directory binding在owner snapshot之后再次要求logical lock path是绑定original descriptor object的directory；失败复用`stateChanged`与owner authority withdrawal，Phase565 scan/owner/error字段保持不变。

## Phase567 后续加固

Phase567将本阶段owner snapshot前后的directory path gates升级为open-time full generation matching。Final scan之后发生的child entry或owner basename mutation会改变directory ctime，即使initial/final names已匹配且directory device/inode未变，也会设置`stateChanged`并撤销authority。Initial/final 2-entry scan、pinned owner content continuity和CLI字段保持。

## Phase570 后续加固

Phase570把active owner-bearing observation的最终authority node移动到terminal directory generation gate之后的owner inspection。Comparator覆盖owner full file generation与canonical metadata，persistent in-place rewrite会撤销exclusive/owner/fingerprint authority；Phase565 initial/final bounded scans及mutation revalidation合同不变。

## Phase571 后续加固

Phase571让Phase565 stable terminal result生成candidate-bound而非token-only fingerprint。Initial/final scans、strict directory gates和terminal owner snapshot共同提供active path/root/owner generation material；CLI直接投影shared inspector结果。Fresh cleanup candidate必须重算相同active-domain value，dry-run后copied-owner path replacement在任何mutation前拒绝，Phase565 authority withdrawal路径不变。
