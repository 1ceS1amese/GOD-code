# Phase564：Host tool audit lock maintenance bounded child scan

## 背景

Phase531和Phase534分别限制了quarantine/disposal parent namespace的扫描量与结果物化量，但selected residue directory内部仍通过`fs.readdir(...).sort()`完整读取child set。该读取被list/direct inspection、disposal source correlation、quarantine recovery、owner/empty cleanup以及runtime lock exact-entry gate复用。

Built Phase563基线probe向selected quarantine和disposal root分别模拟100,000个children。一次direct quarantine inspection完整接收并排序两次数组；随后direct disposal inspection再次读取source quarantine两次，并读取disposal root两次。最终布局虽然安全地归类为`unknown`，但资源消耗发生在authority拒绝之前，且`rootEntryCount`把100,000作为exact total公开。

Phase564把active lock、quarantine root、nested `lock`和disposal root的exact child-set读取统一到descriptor-bound bounded scanner。所有safe layout最多只需要区分零项、单一`owner.json`、单一`lock`或`lock + owner.json`，因此保留2个名称并读取一个sentinel即可拒绝更大的未知集合。

## Shared Scan Contract

新增：

```text
MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES = 2
```

Shared scanner满足：

1. 输入logical directory path与持续打开的no-follow directory handle；
2. 从handle解析descriptor-relative read path，procfs不可用时先证明logical path仍绑定同一handle；
3. 使用`fs.opendir(..., { bufferSize: 2 })`流式读取；
4. 最多保留并排序2个entry names，再读取一个sentinel声明truncation；
5. `scannedEntryCount`只表示已保留名称数，truncated scan不计算或公开overflow total；
6. Scanner不读取child content、不跟随child symlink、不输出child names；
7. Directory stream在success/failure路径均关闭，caller继续负责现有inspection或transaction error映射。

所有exact-entry assertions要求expected set长度不超过scan limit，并同时满足not-truncated和sorted exact match。Assertion前后仍验证logical path、descriptor和原directory identity。

## Runtime Inspection Contract

`JsonlAuditLockQuarantineEntryInspection`新增：

```text
rootEntryScanCount?
rootEntryScanLimit?
rootEntryScanTruncated?
lockEntryScanCount?
lockEntryScanLimit?
lockEntryScanTruncated?
```

`JsonlAuditLockDisposalEntryInspection`新增：

```text
rootEntryScanCount?
rootEntryScanLimit?
rootEntryScanTruncated?
```

规则：

- `rootEntryCount`与`lockEntryCount`只在对应scan未截断时表示exact total；
- quarantine root或nested lock任一scan truncated时，layout固定为`unknown`；
- disposal root scan truncated时，layout固定为`unknown`；
- truncated state不选择owner、不产生empty-directory fingerprint，也不授予cleanup/recovery authority；
- initial/final retained names或truncation bit不一致时继续标记`stateChanged`；
- overflow名称和overflow总数不进入runtime或CLI对象。

Quarantine/disposal directory candidates在scan期间保持open descriptor。Initial path snapshot、descriptor identity、final path binding与两次bounded scan共同形成stable-state evidence。

## Mutation Gate Contract

Shared bounded exact-entry assertion覆盖：

- quarantine recovery candidate selection、pre-transfer revalidation、post-transfer state与rollback contraction；
- owner-only quarantine/disposal cleanup；
- empty quarantine/disposal cleanup；
- main coordination lock cleanup、runtime acquisition/release cleanup以及reservation contraction；
- temporary private wrapper exact-empty checks。

任何truncated集合都在`rename`、`unlink`或`rmdir`前拒绝。Unknown/overflow children不会被忽略、递归删除或自动清理；原有fingerprint、owner descriptor、commit point、rollback与residual reporting语义保持。

## CLI Contract

`AuditLockQuarantineEntryDetails`新增：

```text
root_entry_scan_count
root_entry_scan_limit
root_entry_scan_truncated
lock_entry_scan_count
lock_entry_scan_limit
lock_entry_scan_truncated
```

`AuditLockDisposalEntryDetails`新增：

```text
root_entry_scan_count
root_entry_scan_limit
root_entry_scan_truncated
```

List/direct/dry-run/recovery projections共用同一mapper。Truncated residue必须保持warning/error authority，省略exact count、owner fingerprint、empty fingerprint和recovery confirmation。Generic human renderer只输出scalar scan metadata，不接收child names。

## Tests

- Three-child quarantine root的initial/final scan各最多调用`limit + 1`次`Dir.read()`，且不调用selected root `readdir`。
- Overflow quarantine输出root scan metadata、无exact count、`layout: unknown`、无owner/empty fingerprint且不泄露overflow名称。
- Nested lock overflow输出独立lock scan metadata并拒绝recovery authority。
- Overflow disposal输出root scan metadata、无exact count和fingerprint。
- 在cleanup hook后注入第三个child时，exact-entry gate在owner unlink前拒绝；在recovery hook后注入时，candidate gate在owner transfer前拒绝并按既有reservation rollback/residual语义保留未知对象。
- Empty、owner-only、lock-with-owner与lock-and-owner正常布局继续输出exact count并保持既有action/fingerprint。
- CLI human/JSON映射root/nested scan metadata，truncated report不含overflow名称。
- Built smoke禁止selected quarantine/disposal `readdir`并统计每次bounded scan的`Dir.read()`上界。

## 边界

- Scanner不是分页API，不返回continuation token，也不统计overflow总数。
- 本阶段不扩大quarantine recovery或cleanup eligibility。
- 本阶段不递归删除unknown residue，不根据PID或age自动清理。
- Parent quarantine/disposal namespace的4096/128预算保持Phase531/534定义。
- Owner metadata仍使用既有bounded no-follow file reader；本阶段不改变owner fingerprint算法。
- 不新增JSON-RPC、agent event、provider、tool result、transcript或persistent schema字段。

## 验收标准

- Selected lock maintenance directory每次scan最多保留2个名称并只额外读取一个sentinel。
- Quarantine/disposal inspection不再完整物化或排序unbounded child set。
- Truncated scan永远不产生exact count、owner/empty fingerprint或mutation authority。
- 所有相关exact-entry mutation gates在受保护的child rename、unlink或rmdir前有界拒绝overflow state；recovery reservation mkdir继续遵守既有rollback/residual contract。
- Existing descriptor lifecycle、rollback、commit、residual和CLI confirmation contracts保持。
- TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- `/tmp`与workspace无probe、residue、smoke或patch残留，无FileHandle GC warning。

## 实现结果

- Built Phase563 baseline probe确认旧路径在一次direct quarantine加一次direct disposal检查中，对selected quarantine root完整接收4次100,000-name synthetic arrays，对selected disposal root完整接收2次；两类inspection最终虽分类`unknown`，但都先公开`rootEntryCount: 100000`并承担无界物化/排序成本。
- 新增exported `MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES = 2`与module-private descriptor-bound scanner。Scanner从open directory handle解析procfd或validated fallback read path，以`opendir({ bufferSize: 2 })`最多保留2个names并读取1个sentinel；stream始终进入close路径，overflow name和total不返回。
- `JsonlAuditLockQuarantineEntryInspection`新增root与nested lock两组scan count/limit/truncated，`JsonlAuditLockDisposalEntryInspection`新增root组。Initial/final scan同时比较bounded names与truncation bit；exact count只在not-truncated时输出，truncated residue固定`layout: unknown`且不解析selected owner或empty fingerprint。
- Inspection期间quarantine root、nested lock和disposal root均保持no-follow directory descriptor。Active coordination lock inspection也改用bounded scanner；truncated active lock不标记single-owner exclusive，也不读取owner authority。
- `assertJsonlAuditLockPinnedDirectoryEntries(...)`与empty-directory opener复用同一扫描器。Acquire/release、failed acquisition cleanup、main lock cleanup、owner/empty quarantine/disposal cleanup、quarantine recovery candidate/revalidation/rollback以及private wrapper contraction均要求not-truncated exact set。`ts-host/src/audit/jsonlAuditSink.ts`不再存在直接`fs.readdir(...)`调用。
- CLI `AuditLockQuarantineEntryDetails`新增`root_entry_scan_*`和`lock_entry_scan_*`，`AuditLockDisposalEntryDetails`新增`root_entry_scan_*`；list/direct/dry-run/recovery共用既有mapper和human renderer，child names与非精确总数不进入JSON/human输出。
- 新增5项runtime tests，覆盖quarantine root与nested overflow、disposal root overflow、pre-unlink disposal gate和pre-transfer recovery gate；新增2项CLI tests覆盖quarantine/disposal scan projection与overflow-name suppression。Phase563 recovery test与built smoke同时改为按selected staging realpath计数，避免active-lock scanner影响全局`opendir`序号。定向回归通过：`audit.test.ts` 199项、`cliAudit.test.ts` 65项，共264项。
- Built CLI smoke新增quarantine、disposal与cleanup三段probe：selected root initial/final分别为2次open/6次read，cleanup owner-only到overflow revalidation为2次open/5次read；selected `readdir`和owner unlink均为0，unknown children保持。Smoke finally显式清理OS-temp residue namespace。
- 统一验收通过：Python 422项；TypeScript 43个test files、778项；TypeScript build、built CLI integration和CLI smoke全部通过。README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase531/533-535/540/541/547/563历史边界已同步；JSON-RPC、agent event、provider、tool result、transcript和persistent schema未变化。
- `/tmp`无`god-code-audit-*`、`god-code-phase564-*`、`.god-code-audit-rotation-*`或`god-code-smoke.*`残留；workspace无audit residue directory及`.tmp`、`.bak`、`.orig`或`.rej`文件，无残留integration/smoke/engine进程，验收输出无FileHandle GC warning。

## Phase565 后续加固

Phase565补齐本阶段active lock只执行一次bounded scan的稳定性缺口。Active inspector现在在同一directory descriptor上执行initial/final scans，valid owner handle跨越final scan并验证path/object/content连续性；scan或owner drift设置`stateChanged`并撤销owner metadata/exclusive authority，stable truncation与inspection error同样不能生成cleanup fingerprint。Quarantine/disposal inspection与Phase564 exact-entry mutation gates保持不变。

## Phase567 后续加固

Phase567补齐final bounded scan之后仍可能发生child mutation的generation缺口。Active inspection的directory gates现在要求open-time full device/inode/ctimeNs/birthtimeNs连续，因此owner snapshot期间新增或删除child即使未进入第三次scan，也会通过ctime drift撤销authority。Phase564两次bounded scan预算、quarantine/disposal scanner与mutation exact-entry gates保持不变。

## Phase568 后续加固

Phase568补齐quarantine/disposal bounded scanner在final scan后仍沿用initial owner snapshot的authority缺口。Stable layout现在复读唯一selected owner并比较semantic/object continuity，随后终检所有参与layout判断的directory open-time generation；empty opener也使用strict path generation gates。两次bounded scan预算仍不增加，mutation exact-entry gates继续允许transaction自身合法ctime变化。
