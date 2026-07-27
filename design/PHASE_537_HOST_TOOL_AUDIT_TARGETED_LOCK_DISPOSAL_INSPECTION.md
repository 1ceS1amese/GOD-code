# Phase537：Host tool audit targeted lock disposal inspection

## 背景

Phase534的bounded scanner最多读取4096个temp entries并返回128项。Truncation会被明确报告，但当operator已经从`residual_disposal_path`或外部记录获得quarantine/disposal ID时，不应为了查看单项状态而扩大scan预算或依赖该entry恰好出现在bounded结果中。

Phase537新增：

```text
god-code audit inspect-lock-disposal <quarantine-id> <disposal-id> [--json]
```

该命令直接重新派生selected disposal path，不枚举temp directory。

## Selection Contract

两个ID都必须为六字符ASCII alphanumeric。Runtime从当前configured audit file重新派生：

```text
<derived-lock-path>.cleanup-<quarantine-id>.dispose-<disposal-id>
```

CLI不接受任意path、scan root、glob或basename。

## Inspection Contract

Direct command复用Phase534 `inspectJsonlAuditLockDisposal`，因此保持相同证据：

- disposal existence、entry type和age；
- `owner_only`、`empty`或`unknown` layout；
- root entry count与owner metadata status；
- valid owner-only fingerprint、PID和canonical time；
- exact-empty directory fingerprint；
- state change与inspection error；
- source quarantine path、existence、entry type、layout和state。

Missing selected path返回`ok: true`与`exists: false`，不创建entry。

## Difference from Bounded Scan

`inspect-lock-disposals`：

- 用于发现未知residue；
- 固定4096-entry scan和128-result output预算；
- 可能因truncation不返回某个已知ID。

`inspect-lock-disposal <qid> <did>`：

- 用于验证operator已经知道ID的单项residue；
- 不枚举temp directory；
- 不改变Phase534预算；
- 不能发现其他entry。

两者共享相同entry projection，避免list与direct语义漂移。

## Status Semantics

- Missing selected disposal：`ok`，message说明nothing found。
- Existing known disposal：`warn`，要求manual review。
- Unknown、invalid、non-directory、state drift或uncertain source：追加uncertain-state warning。
- Invalid audit config或inspection failure：`error`。
- Persistence disabled：skipped warning，不访问filesystem。

## Safety

- Command只执行direct lstat/readdir/bounded owner parse。
- 不扫描temp namespace。
- 不rename、unlink、rmdir、chmod或创建entry。
- 不读取或修改audit target。
- Symlink不跟随。
- Human/JSON输出不包含UUID owner token或raw metadata identity。
- Fingerprint、source absence、PID和age都不构成cleanup authority。

## Tests

- Valid owner-only selected disposal输出与Phase534 list一致的fingerprint且不泄露token。
- Empty selected disposal输出directory fingerprint。
- Unknown/non-directory selected disposal只报告并保持原状。
- Missing selected disposal返回exists false。
- Disabled persistence不访问filesystem。
- CLI缺失/invalid ID返回stable usage error。
- Built CLI integration验证direct inspection before cleanup和missing state after cleanup。

## 实现结果

- `ts-host/src/audit/jsonlAuditSink.ts`公开`inspectJsonlAuditLockDisposal(...)`，按qid/did直接调用共享single-entry inspector，不经过namespace scanner。
- `ts-host/src/cli/audit.ts`增加targeted report contract、human/JSON renderer，并让list/direct共用`toAuditLockDisposalEntryDetails(...)`与uncertainty predicate。
- `ts-host/src/cli/main.ts`注册`audit inspect-lock-disposal`，只接受两个exact六字符ID和可选`--json`。
- `ts-host/test/cliAudit.test.ts`覆盖owner-only、empty、missing、unknown与disabled状态，并验证token redaction和filesystem不变。
- `integration/cli_integration.py`覆盖built CLI清理前direct命中、缺少disposal ID usage error及Phase535清理后的missing结果。

## 边界

- 本阶段不增加scan预算。
- 本阶段不清理任何disposal。
- 本阶段不为unknown state生成mutation authority。
- 本阶段不接受residual path原文作为参数。

## 验收标准

- Direct command只由current audit path和exact qid/did派生目标。
- Output与Phase534 list entry字段保持一致。
- Missing、existing和uncertain状态有稳定status/message。
- Command在所有路径保持read-only和non-secret。
- Phase530至Phase536行为与接口保持。
- TypeScript、Python和integration全量回归通过。

## Phase568 后续加固

Phase568由shared direct/list inspector为targeted disposal补充selected owner final reread与root terminal generation gate。Owner原地改写或directory drift时direct command继续返回warning，但layout固定`unknown`、`state_changed: true`且不输出owner/empty fingerprint；ID派生、字段集合和read-only contract不变。

## Phase569 后续加固

Phase569让targeted disposal在initial source missing且准备发布owner/empty fingerprint时执行terminal source-path `lstat`。Late entry使direct report更新source existence/type/state-changed并撤销disposal fingerprint，仍不枚举source children或接受任意path。Phase537 exact ID派生、human/JSON字段和read-only语义保持。

## Phase570 后续加固

Phase570让targeted owner-only disposal在terminal source-path check之后再比较owner full file generation与canonical metadata。Persistent owner rewrite复用existing warning、`state_changed`与`layout: unknown`投影并省略fingerprint；exact qid/did派生、source fields与read-only CLI contract不变。

## Phase571 后续加固

Phase571使targeted disposal不再由CLI读取owner token后本地计算fingerprint，而直接投影shared inspector发布的candidate-bound值。该值绑定exact qid/did派生path、owner-only root/owner generations和source-missing marker，因此与bounded list中同一stable entry一致，并与其他path/domain/replacement区分。Human/JSON字段集合和non-secret read-only contract不变。
