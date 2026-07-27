# Phase563：Host tool audit rotation staging bounded child scan

## 背景

Phase554为rotation staging parent namespace建立4096-entry scan和128-result materialization上限，但selected staging directory内部仍通过：

```text
fs.readdir(rootReadPath).sort()
```

完整物化并排序全部children。该路径被direct/list inspection、Phase555 readiness、Phase556 locked recovery graph和Phase562 post-failure observation共同复用；mutation侧的exact-entry gate也对同一directory执行无界`readdir`。

Built Phase562 probe已复现：向selected staging read path模拟100,000个children时，readiness连续两次接收并排序100,000项数组，最终虽然安全地分类为`invalid_staging_state`，但资源消耗在拒绝前已经发生。若hostile或损坏的private staging积累大量entries，只读诊断、恢复尝试和normal rotation rollback gate都可能遭受无界内存与排序成本。

Phase563把selected rotation staging的child-set读取统一改为descriptor-bound bounded scan。Safe layout最多只允许零项或单一`previous`，因此无需完整枚举invalid directory才能拒绝mutation authority。

## Scan Contract

新增：

```text
MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES = 2
```

Shared scanner满足：

1. 从已打开的staging directory handle解析descriptor-relative directory path；fallback必须先验证logical path仍绑定同一handle；
2. 使用`fs.opendir(..., { bufferSize: 2 })`流式读取；
3. 最多保留并排序2个entry names；
4. 额外读取一个sentinel判断是否还有第三项，但不保存其名称；
5. `scannedEntryCount`只计算保留的前2项，`scanTruncated`表示存在更多children；
6. Scanner不读取child content、不跟随symlink、不输出entry names；
7. Directory stream总是进入close路径；open/read/close failure由caller按现有inspection或mutation error边界处理。

两次stable scan都使用同一上限。Names或truncation状态变化时标记`stateChanged`；任一次initial scan truncated都不能产生valid root snapshot或recovery fingerprint。

## Runtime Inspection Contract

`JsonlAuditRotationStagingEntryInspection`新增：

```text
entryScanCount?
entryScanLimit?
entryScanTruncated?
```

Directory candidate始终输出scan count、limit和truncation状态。`entryCount`只在scan未截断时表示exact child count；截断时省略，避免把下界误报为总数。

Classification规则：

- untruncated zero entries -> `empty`；
- untruncated exact `previous` -> `previous_only`；
- 其他untruncated set -> `unknown`；
- truncated set -> `unknown`，无root/previous recovery authority；
- initial/final names或truncation不一致 -> `stateChanged`。

List inspection、direct inspection、readiness、locked graph和Phase562 observation共享同一projection。

## Mutation Gate Contract

`assertPinnedAuditTemporaryDirectoryEntries(...)`改为复用同一descriptor-bound scanner。所有existing callers的expected set均为empty或single `previous`：

- scan truncated时直接拒绝；
- scanned names与expected exact set不一致时拒绝；
- assertion前后仍验证pinned directory identity；
- 不因invalid directory规模增加内存预算；
- 不删除、忽略或自动清理overflow entries。

该gate覆盖normal rotation staging创建/commit/rollback以及explicit recovery candidate revalidation。

## CLI Contract

`AuditRotationStagingEntryDetails`新增：

```text
entry_scan_count
entry_scan_limit
entry_scan_truncated
```

Human与JSON沿用现有generic staging renderer。Truncated selected staging必须为warning或recovery ERROR，不输出recommended action/fingerprint。`entry_count`仅在exact count已知时出现。

## Tests

- Actual three-child staging只消费每次scan最多`limit + 1`次`Dir.read()`，不调用unbounded staging `readdir`。
- Direct/list inspection输出scan metadata，truncated时省略exact `entryCount`并分类`unknown`。
- Recovery readiness对truncated staging输出`invalid_staging_state`且无fingerprint。
- Locked recovery failure及Phase562 post-failure observation都保留bounded truncated projection。
- Mutation exact-entry gate面对overflow staging在namespace syscall前拒绝。
- Empty和single-previous正常路径保持untruncated exact count与既有action/fingerprint。
- CLI human/JSON映射scan metadata且不泄露overflow names。
- Built runtime smoke注入禁止staging `readdir`并统计`Dir.read()`上界。

## 边界

- Scanner不是分页API，不返回continuation token，也不尝试统计overflow总数。
- `entryScanCount`不是truncated directory的总entry count。
- 本阶段不自动删除unknown/overflow staging，不扩大recovery action集合。
- Parent namespace的4096/128预算保持Phase554定义。
- Lock quarantine/disposal是独立namespace，不在本阶段改变其inspection schema。
- 不读取JSONL、current、`.1`或archive bytes。
- 不新增JSON-RPC、agent event、provider、tool result、transcript或persistent schema字段。

## 验收标准

- Selected rotation staging child materialization严格限制为2个名称，最多额外读取一个sentinel。
- Readiness、locked recovery、post-failure observation和normal mutation gate均不再调用unbounded staging `readdir`。
- Truncated directory永远没有safe action或fingerprint，且mutation在namespace syscall前拒绝。
- Existing empty/previous-only action、rollback、descriptor、lock和Phase557-562 evidence contracts保持。
- TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- `/tmp`与workspace无probe、staging、smoke或patch残留，无FileHandle GC warning。

## 实现结果

- Built Phase562 probe确认旧selected-staging reader会两次接收并排序100,000项synthetic `readdir`数组，最终虽拒绝authority但已产生无界materialization。该probe目录已清理。
- 新增exported `MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES = 2`和module-private descriptor-bound scanner。Scanner从open staging handle解析validated directory read path，以`opendir({ bufferSize: 2 })`最多保留2个names并额外读取1个sentinel，随后只排序该bounded集合；stream始终进入close路径。
- `JsonlAuditRotationStagingEntryInspection`新增`entryScanCount`、`entryScanLimit`和`entryScanTruncated`。Initial/final scan同时比较names与truncation bit；exact `entryCount`只在未截断时输出，truncated candidate固定`layout: unknown`且不返回root/previous authority。
- `assertPinnedAuditTemporaryDirectoryEntries(...)`改为复用同一扫描器。Normal rotation staging lifecycle与explicit recovery candidate的empty/single-`previous` gates现在都要求not-truncated exact set；overflow state在rename、unlink或rmdir前拒绝，不删除或忽略未知entries。
- CLI `AuditRotationStagingEntryDetails`新增`entry_scan_count`、`entry_scan_limit`和`entry_scan_truncated`映射；list/direct/readiness、recovery failure和Phase562 nested observation均复用相同projection。Overflow names与非精确总数不进入human/JSON。
- 新增2项runtime tests，分别验证three-child readiness每次scan最多`limit + 1`次`Dir.read()`且不调用staging `readdir`，以及在candidate exact-entry gate前注入overflow时无namespace rename、typed `candidate_open/not_started`保持且post-failure observation bounded。新增1项CLI test验证truncated scan metadata、无action/fingerprint、无overflow-name泄露。定向回归通过：`audit.test.ts` 194项、`cliAudit.test.ts` 63项，共257项；TypeScript build通过。
- Built CLI smoke新增readiness加locked-failure probe，禁止selected staging `readdir`，累计6次bounded scans恰好18次`Dir.read()`，并验证initial与post-failure projection均为`invalid_staging_state`、无fingerprint且coordination lock干净释放。
- 统一验收通过：Python 422项；TypeScript 43个test files、771项；TypeScript build、built CLI integration和CLI smoke全部通过。README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase553-556/562历史边界已同步；JSON-RPC、agent event、provider、tool result、transcript和persistent schema未变化。
- `/tmp`无`god-code-audit-*`、`god-code-phase563-*`、`.god-code-audit-rotation-*`或`god-code-smoke.*`残留；workspace无staging directory及`.tmp`、`.bak`、`.orig`或`.rej`文件，无残留integration/smoke/engine进程，验收输出无FileHandle GC warning。

## Phase564 后续加固

Phase564把本阶段明确保留的lock quarantine/disposal独立namespace纳入相同的descriptor-bound bounded child-scan原则。Active lock、quarantine root、nested `lock`和disposal root分别最多保留2个names并读取一个sentinel；truncated residue不产生exact count、owner selection或empty fingerprint，相关cleanup/recovery gate在rename、unlink或rmdir前拒绝。Rotation staging scanner、readiness action/fingerprint和Phase563 CLI字段保持不变。
