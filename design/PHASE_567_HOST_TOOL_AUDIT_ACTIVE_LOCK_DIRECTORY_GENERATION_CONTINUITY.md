# Phase567：Host tool audit active lock directory generation continuity

## 背景

Phase566在valid owner snapshot之后新增terminal lock-directory binding，解决logical lock leaf变为指向renamed original的symlink时仍发布owner authority的问题。但该binding复用mutation-oriented directory object matcher：它要求current descriptor/path/descriptor彼此具有相同完整metadata，却只用device/inode把它们与open-time pinned identity关联。

该语义适合跨rename/unlink的mutation transaction，因为transaction-owned directory的ctime会合法变化；对read-only active lock observation则不够严格。若在Phase565 final child scan之后、final owner snapshot期间新增child：

- directory仍是同一device/inode object；
- owner path/object/content保持；
- terminal descriptor/path/descriptor三次读取看到相同的新ctime；
- 但它们没有与open-time ctime比较。

因此新增child不会触发`stateChanged`，旧inspection仍可发布`ownerEntryExclusive: true`和cleanup fingerprint。

Built Phase566 baseline probe已复现：在final owner snapshot第一个owner-path `lstat`前创建`terminal-late-secret`。旧`cleanupAuditLock(...)`返回`ok: true`、warning、`confirmation_required: true`和owner fingerprint，而direct directory listing已包含`owner.json`与extra child。

## Runtime Contract

新增read-only专用strict directory observation helper。它在同一次检查中读取：

1. initial descriptor identity；
2. no-follow logical directory path identity；
3. final descriptor identity。

三者都必须：

- 是directory；
- 与open-time pinned identity具有相同device/inode/ctimeNs/birthtimeNs；
- 彼此具有相同完整identity。

`inspectJsonlAuditFileLock(...)`的两个directory gates均切换为strict helper：

- final bounded child scan之后、owner snapshot之前；
- valid owner snapshot之后、authority projection之前。

任何child add/remove/rename、directory chmod、directory rename/replacement或其他改变directory ctime/object/path binding的操作，都会设置`stateChanged: true`并撤销owner authority。

## Why Generation Instead Of Another Scan

单纯在owner snapshot之后增加第三次child scan会产生对称窗口：owner file可在第三次scan期间以相同basename被替换，随后若不再读取owner就仍可能发布旧authority；继续交替scan/owner read无法形成有限闭包。

Directory generation continuity提供共同的变化信号：

- child entry mutation会改变directory ctime；
- owner basename replacement会改变directory ctime；
- owner in-place content mutation由pinned owner identity/content snapshot检测；
- logical directory leaf replacement由strict path identity检测。

该组合仍不是kernel reservation，但为read-only observation提供有限、可验证的稳定generation合同。

## Mutation Compatibility

Existing `jsonlAuditLockPinnedDirectoryPathMatches(...)`及mutation assertions保持object-oriented语义，不改为strict generation matching。Cleanup、recovery、release和private wrapper transaction中的rename/unlink会合法改变directory ctime，它们继续依赖descriptor object identity、exact-entry gates和postcondition。

Strict helper只用于`inspectJsonlAuditFileLock(...)`的read-only authority path，避免把read-only稳定性约束误施加到transaction commit/rollback流程。

## CLI Contract

不新增CLI字段。Generation drift继续映射为：

```text
coordination_lock_state_changed: true
coordination_lock_owner_entry_exclusive: false
```

Owner metadata和fingerprint省略。`inspect-path`返回warning；`cleanup-lock`在fingerprint前返回ERROR；quarantine recovery preflight和rotation recovery readiness继承同一uncertainty。Human/JSON不输出extra child name、owner token、ctime值或raw error。

## Tests

- Runtime在final owner snapshot前新增extra child，必须返回state changed且无owner authority。
- Cleanup dry-run面对相同race必须无fingerprint、无confirmation、无unlink/rmdir，extra child保持。
- Rotation recovery面对internal directory generation drift必须返回`state_changed`且无recovery fingerprint。
- Stable exact single-owner lock继续发布owner authority。
- Phase565 child drift、copied-owner replacement和Phase566 terminal symlink tests继续通过。
- Built smoke验证active inspector仍只执行两次bounded child scan，不调用selected `readdir`；late child由strict generation gate拒绝，而不是通过无界或第三次scan处理。

## 边界

- Strict identity依赖filesystem提供的BigInt `ctimeNs`/`birthtimeNs`语义；audit lock namespace仍要求受信任ownership与ACL。
- Read-only result在返回后仍可立即过期，不是reservation或PID liveness proof。
- 本阶段不阻止能够执行快速ABA并控制filesystem metadata语义的恶意环境；它保证persistent generation drift和普通same-user namespace mutation不会被object-only matcher接受。
- 不改变owner schema、fingerprint算法、confirmation flags、mutation commit point或residual semantics。
- 不新增JSON-RPC、agent event、provider、tool result、transcript或persistent schema字段。

## 验收标准

- Active lock authority的directory gates必须与open-time full identity绑定，而不只绑定device/inode object。
- Final scan之后发生的persistent child mutation不能产生owner authority或cleanup fingerprint。
- Mutation-oriented directory helpers与transaction semantics保持兼容。
- Existing Phase565/566 scan、owner、terminal path、state/error projection保持。
- TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- `/tmp`与workspace无probe、lock、smoke或patch残留，无FileHandle GC warning。

## 实现结果

- Built Phase566 baseline probe在final owner snapshot第一个owner-path `lstat`前创建`terminal-late-secret`。旧实现仍返回`ok: true`、warning、`confirmation_required: true`、`ownerEntryExclusive: true`和owner fingerprint，而on-disk directory已包含`owner.json`与extra child；probe finally删除extra并正常release。
- 新增module-private `jsonlAuditLockPinnedDirectoryObservationMatches(...)`。Helper依次读取initial descriptor、no-follow logical path和final descriptor identity，并要求三者全部匹配open-time pinned device/inode/ctimeNs/birthtimeNs；changed/missing/non-directory path返回false，其他inspection failure继续进入bounded error projection。
- `inspectJsonlAuditFileLock(...)`在final bounded scan之后及valid owner snapshot之后的两个directory gates均切换到strict observation helper。Mutation-oriented `jsonlAuditLockPinnedDirectoryPathMatches(...)`及cleanup/recovery/release assertions未改变，因此transaction自身rename/unlink导致的合法ctime变化继续由object identity与postcondition处理。
- 新增2项runtime tests：direct active inspection面对owner snapshot期间late child撤销authority；rotation readiness面对同一internal generation drift返回`state_changed`且无recovery fingerprint。新增1项CLI cleanup test，验证无confirmation/fingerprint、无unlink/rmdir、无owner token或extra basename leakage，late child保持。
- 定向回归通过：`audit.test.ts` 206项、`cliAudit.test.ts` 69项，共275项。TypeScript build通过。
- Built CLI smoke新增generation continuity probe：active inspector保持2次bounded scan、2次open/4次read，selected `readdir`为0；valid branch执行5次lock-path与5次owner-path `lstat`，第4次owner-path读取前注入late child后返回state-changed ERROR，unlink/rmdir均为0且无fingerprint或secret/name leakage。
- 统一验收通过：Python 422项；TypeScript 43个test files、789项；TypeScript build、built CLI integration和CLI smoke全部通过。README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase528/530/542/564-566历史边界已同步；JSON-RPC、agent event、provider、tool result、transcript、persistent schema和CLI字段集合未变化。
- 最终审计确认`jsonlAuditSink.ts`无direct `fs.readdir(...)`，workspace无audit residue及`.tmp`/`.bak`/`.orig`/`.rej`文件，`/tmp`无`god-code-audit-*`、`god-code-phase567-*`、`.god-code-audit-rotation-*`或`god-code-smoke.*`残留，无integration/smoke/engine/test进程与FileHandle GC warning。

## Phase570 后续加固

Phase570在本阶段terminal directory generation continuity之后追加terminal owner generation continuity。Directory generation保持不变但owner file在gate期间原地改写时，active inspection同样撤销owner/exclusive/fingerprint authority；strict directory helper、bounded child scans与mutation object matcher均不改变。

## Phase571 后续加固

Phase571直接把本阶段open-time root device/inode/ctimeNs/birthtimeNs和Phase570 terminal owner full generation编码到active candidate fingerprint。Read-only generation continuity因此不仅控制是否签发，还区分dry-run后同路径的new valid generation；cleanup仍用object-oriented transaction checks处理自身合法ctime变化，但expected fingerprint comparison在这些mutation之前完成。
