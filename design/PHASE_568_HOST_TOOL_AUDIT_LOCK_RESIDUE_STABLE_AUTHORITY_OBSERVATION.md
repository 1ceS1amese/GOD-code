# Phase568：Host tool audit lock residue stable authority observation

## 背景

Phase567为active lock inspection建立了open-time directory generation continuity，但quarantine/disposal residue inspection仍存在两个独立authority窗口：

1. quarantine root、nested `lock/`、disposal root及empty fingerprint opener仍复用mutation-oriented directory object matcher。该matcher允许同一device/inode目录以新的ctime继续通过，因此final scan附近发生的child generation变化可能被当前一致、但非open-time一致的descriptor/path snapshot接受。
2. residue owner只在initial bounded scan后读取一次。若`owner.json`在final scan期间原地改写，目录entry set与directory ctime均不变化；旧inspection会在文件已包含新metadata时发布旧owner token及由其派生的fingerprint。

Built Phase567 baseline probe已复现第二类问题：在owner-only quarantine第二次root `opendir`期间原地写入另一份valid owner metadata。旧`inspectAuditLockQuarantine(...)`仍返回`layout: owner_only`并发布旧owner fingerprint，而磁盘owner token已经变为新值。

## Runtime Contract

Residue authority必须由同一稳定观测闭包产生：

1. 打开并固定root/nested directory的open-time full identity；
2. 执行initial bounded child scan及initial owner inspection；
3. 执行final bounded child scan；
4. 用strict directory observation gate将descriptor/path/descriptor都与open-time device/inode/ctimeNs/birthtimeNs绑定；
5. 根据稳定entry set分类layout并选择唯一authoritative owner；
6. 重新读取selected owner，并要求initial/final owner status、file identity和valid metadata一致；
7. owner reread后再次对所有参与layout判断的pinned directories执行strict terminal generation gate；
8. 仅发布final validated owner inspection或stable empty directory fingerprint。

任何selected owner原地改写、owner basename替换、root/nested child增删改名、directory metadata变化、logical leaf replacement或检查期间消失，均必须撤销residue authority并投影为`stateChanged: true`、`layout: unknown`。

## Owner Continuity

新增module-private owner inspection comparator：

- `ownerPath`与`status`必须相同；
- identity必须同时缺失，或device/inode同时相同；
- metadata必须同时缺失，或所有canonical owner字段完全相同；
- valid owner因此同时要求stable file object和stable semantic metadata；
- missing/invalid owner不产生authority，但status drift仍会使整个observation失效。

Final result使用第二次validated owner inspection，而不是initial snapshot。这样即使两次内容语义相同，也不会继续持有旧读取结果；若语义或file object不同，则不发布owner字段。

## Directory Continuity

以下read-only gates切换为`jsonlAuditLockPinnedDirectoryObservationMatches(...)`：

- quarantine nested final gate；
- quarantine root final gate；
- selected owner reread后的nested/root terminal gates；
- disposal root final及terminal gates；
- `openJsonlAuditLockPinnedEmptyDirectory(...)`的initial/final path gates。

Mutation helpers继续使用`jsonlAuditLockPinnedDirectoryPathMatches(...)`。Cleanup/recovery transaction中的rename、unlink和entry mutation会合法改变ctime，不能套用read-only open-time generation合同。

## Quarantine Layout Contract

- `owner_only`与`lock_and_owner`选择root owner并执行final root owner reread。
- `lock_with_owner`选择nested owner并执行final nested owner reread。
- 只要nested directory参与initial layout observation，selected owner reread后必须同时复验nested与root generation，防止非selected目录在reread窗口内改变layout。
- `empty`不选择owner；其fingerprint由strict empty opener重新确认exact empty generation后产生。
- `unknown`不发布owner location、owner metadata或empty fingerprint。

Initial `rootOwnerMetadataStatus`与`lockOwnerMetadataStatus`保留为诊断字段；authoritative `ownerMetadataStatus`及owner metadata字段只能来自final validated selected owner。

## Disposal Layout Contract

- `owner_only`执行selected owner final reread及root terminal generation gate，然后发布final owner metadata。
- `empty`通过strict empty opener生成fingerprint。
- `unknown`不发布owner metadata或empty fingerprint。
- source quarantine inspection继续独立投影；本阶段不改变source/disposal之间的调用顺序或字段集合。

## CLI Contract

不新增CLI或wire字段。Stable observation失败继续映射为现有结果：

```text
state_changed: true
layout: unknown
owner_fingerprint: omitted
confirmation_required: omitted/false
```

Direct inspect返回warning；cleanup dry-run在confirmation fingerprint前返回ERROR。Human/JSON不得泄漏旧/新owner token、unexpected child basename、raw ctime或内部race细节。

## Tests

- Runtime：owner-only quarantine在final root scan期间原地改写selected owner，必须`stateChanged`、unknown且无owner authority。
- Runtime：nested `lock_with_owner` selected owner原地改写，必须撤销authority。
- Runtime：owner-only disposal selected owner原地改写，必须撤销authority。
- Runtime：empty quarantine/disposal在empty fingerprint final scan附近发生child generation drift时，不得发布empty fingerprint。
- CLI：direct quarantine/disposal inspection与cleanup dry-run面对selected owner drift时不得输出fingerprint、confirmation、owner token或执行unlink/rmdir。
- Existing stable owner-only、lock-with-owner、lock-and-owner、empty residue paths继续通过。
- Built smoke覆盖quarantine/disposal selected owner rewrite，并确认selected directory仍只做bounded `opendir/read` scan、不调用`readdir`、不执行cleanup mutation。

## 边界

- 该合同是有限read-only observation，不是filesystem reservation；结果返回后仍可立即过期。
- Stable semantic owner reread不证明PID存活，也不证明进程仍持有锁。
- Strict generation依赖filesystem提供BigInt `ctimeNs`/`birthtimeNs`；受信任namespace ownership与ACL要求不变。
- 不改变owner schema、fingerprint算法、cleanup commit point、recovery semantics或residual preservation。
- 不新增JSON-RPC、agent event、provider、tool result、transcript、persistent schema或CLI字段。

## 验收标准

- Quarantine/disposal authoritative owner必须经过initial/final semantic+object continuity验证。
- 所有参与residue layout判断的directory必须在authority发布前保持open-time full generation连续。
- Empty residue fingerprint必须来自strict exact-empty generation observation。
- Persistent owner rewrite或directory generation drift不能产生owner/empty fingerprint。
- Mutation-oriented transaction helpers保持原语义。
- TypeScript build、Python、TypeScript、built integration与CLI smoke全部通过。
- Workspace及`/tmp`无probe、lock、smoke、patch残留，无FileHandle GC warning。

## 实现结果

- Built Phase567 baseline probe确认旧owner-only quarantine在第二次selected root scan期间原地写入另一份valid owner metadata后，仍返回`layout: owner_only`并发布旧owner fingerprint；direct disk read已显示新token，证明fingerprint来自陈旧snapshot。
- 新增module-private `jsonlAuditLockOwnerInspectionsMatch(...)`。Valid owner要求initial/final path、status、device/inode及canonical version/token/PID/acquired time全部一致；missing/invalid只接受相同status且不携带identity/metadata authority。
- Quarantine inspector现在在final root/nested bounded scans及strict generation gates后分类layout，重新读取唯一selected root/nested owner，再终检所有参与layout判断的pinned directories；只有final validated owner inspection可以发布owner location/status/token/PID/time。Disposal owner-only路径执行同样owner reread与root terminal gate。任何漂移统一返回`stateChanged: true`、`layout: unknown`。
- `openJsonlAuditLockPinnedEmptyDirectory(...)`的两个logical path gates切换为open-time strict observation helper；empty quarantine/disposal fingerprint与cleanup candidate都拒绝persistent generation/path drift。Mutation-oriented `jsonlAuditLockPinnedDirectoryPathMatches(...)`未改变，cleanup/recovery/release transaction仍容纳自身合法ctime变化。
- 新增5项runtime tests：owner-only quarantine、nested `lock_with_owner`与owner-only disposal的selected owner原地改写，以及empty quarantine/disposal terminal generation drift。新增2项CLI tests同时覆盖direct inspect和cleanup dry-run，确认无owner fingerprint/confirmation、无旧新token泄漏且`unlink`/`rmdir`均未调用。
- 定向回归通过：`audit.test.ts` 211项、`cliAudit.test.ts` 71项，共282项；TypeScript build通过。
- Built CLI smoke新增quarantine/disposal stable authority probe：每个selected owner-only root保持2次bounded `opendir`、4次`read`，selected `readdir`为0；第二次scan期间原地改写owner后，两类cleanup均返回state-changed unknown ERROR，无fingerprint/confirmation，`unlink`/`rmdir`为0，改写后的owner保持。
- 统一验收通过：Python 422项；TypeScript 43个test files、796项；TypeScript typecheck/build、built CLI integration和CLI smoke全部通过。README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase531-539/564历史边界已同步；JSON-RPC、agent event、provider、tool result、transcript、persistent schema和CLI字段集合未变化。
- 最终静态与残留审计确认source/built artifact均包含Phase568闭包，`jsonlAuditSink.ts`无direct `fs.readdir(...)`，smoke脚本通过`bash -n`；workspace无audit residue及`.tmp`/`.bak`/`.orig`/`.rej`文件，`/tmp`无`god-code-audit-*`、`god-code-phase568-*`、`.god-code-audit-rotation-*`或`god-code-smoke.*`残留，无integration/smoke/engine/test进程与FileHandle GC warning。

## Phase569 后续加固

Phase569补齐stable disposal自身观测完成后，source quarantine可能重新出现的cross-path authority窗口。Initially missing source现在在owner/empty fingerprint返回前再次no-follow确认；late entry使source/disposal进入state changed并清除Phase568已验证的owner/empty authority。Phase568 selected owner、directory generation和strict empty opener合同保持不变。

## Phase570 后续加固

Phase570要求owner-bearing quarantine在terminal root/nested gates之后、owner-only disposal在terminal source gate之后，再次检查selected owner full file generation与canonical metadata。Persistent terminal owner rewrite会撤销Phase568/569形成的owner authority；empty residue与strict exact-empty opener不增加owner读取，bounded scan预算保持。

## Phase571 后续加固

Phase571把Phase568 stable residue graph本身作为owner confirmation material。Quarantine fingerprint编码root/optional nested generations、exact layout/location和terminal owner generation；owner-only disposal再编码source-missing path。Direct/list/dry-run共享inspector value，copied residue generation不再继承相同token fingerprint。Empty directory fingerprint算法与Phase568 strict opener保持独立且不变。
