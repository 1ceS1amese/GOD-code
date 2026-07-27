# Phase538：Host tool audit targeted lock quarantine inspection

## 背景

Phase531通过4096-entry scan和128-result output预算发现private quarantine residue。该bounded discovery能够稳定限制temp namespace成本，但当operator已经从`residual_quarantine_path`、cleanup/recovery结果或外部记录获得quarantine ID时，仍缺少不依赖scan结果的单项只读检查。

Phase538新增：

```text
god-code audit inspect-lock-quarantine <quarantine-id> [--json]
```

该命令直接重新派生selected quarantine path，不枚举temp directory。

## Selection Contract

Quarantine ID必须为六字符ASCII alphanumeric。Runtime从当前configured audit file重新派生：

```text
<derived-lock-path>.cleanup-<quarantine-id>
```

CLI不接受任意path、basename、glob、scan root或residual path原文。

## Inspection Contract

Direct command复用Phase531 `inspectJsonlAuditLockQuarantine(...)`，并与bounded list共享相同entry projection：

- quarantine existence、entry type和age；
- `owner_only`、`lock_with_owner`、`lock_and_owner`、`empty`或`unknown` layout；
- root/nested lock entry counts与entry types；
- root/nested owner metadata status；
- layout-selected owner location、status、PID、canonical time与non-secret fingerprint；
- state change与inspection error。

Missing selected path返回`ok: true`与`exists: false`，不创建entry。Direct missing不把初始ENOENT投影为operator-visible state drift。

## Difference from Bounded Scan

`inspect-lock-quarantines`：

- 用于发现未知quarantine residue；
- 固定4096-entry scan和128-result output预算；
- 可能因scan/result truncation不返回某个已知ID。

`inspect-lock-quarantine <qid>`：

- 用于验证operator已经知道ID的单项quarantine；
- 不枚举temp directory；
- 不改变Phase531预算；
- 不能发现其他entry。

两者共享entry mapper与uncertainty predicate，避免list/direct字段或warning语义漂移。

## Status Semantics

- Missing selected quarantine：`ok`，message说明nothing found。
- Existing known quarantine：`warn`，要求manual review。
- Unknown、non-directory、state drift、inspection error或layout-selected invalid owner：追加uncertain-state warning。
- Invalid audit config或inspection failure：`error`。
- Persistence disabled：skipped warning，不访问filesystem。

## Safety

- Command只执行direct no-follow lstat/readdir与bounded owner metadata parse。
- 不扫描temp namespace。
- 不rename、unlink、rmdir、chmod或创建entry。
- 不读取或修改audit target。
- Symlink和non-directory entry不跟随。
- Human/JSON输出不包含UUID owner token或raw metadata identity。
- Fingerprint、PID、age和layout都不构成cleanup/recovery authority。

## 实现计划

1. 抽取Phase531 quarantine entry mapper与uncertainty predicate供list/direct共用。
2. 增加targeted quarantine report、human renderer与JSON renderer。
3. 注册CLI route、exact ID parser、help与stable usage error。
4. 增加owner-only、pre-commit、empty/missing、unknown/non-directory和disabled测试。
5. Built CLI integration验证cleanup前direct inspection、missing/invalid ID以及cleanup后的missing结果。
6. 同步project plan、architecture、security、protocol与README。

## 实现结果

- `ts-host/src/cli/audit.ts`增加targeted quarantine report、human/JSON renderer，并让Phase531 list与direct共用entry mapper和uncertainty predicate。
- `ts-host/src/cli/main.ts`注册`audit inspect-lock-quarantine`，只接受一个exact六字符ID和可选`--json`。
- `ts-host/test/cliAudit.test.ts`覆盖owner-only projection一致性、pre-commit nested owner、empty/missing、unknown/non-directory、disabled与token redaction。
- `integration/cli_integration.py`覆盖built CLI清理前direct命中、missing/invalid ID usage error及Phase532清理后的missing结果。
- Command复用既有`inspectJsonlAuditLockQuarantine(...)`，没有新增scan、mutation或owner-token输出路径。

## 边界

- 本阶段不增加scan预算。
- 本阶段不清理或恢复任何quarantine。
- 本阶段不为unknown或valid layout生成mutation authority。
- 本阶段不接受任意filesystem path。
- 本阶段不根据PID或age判断stale/liveness。

## 验收标准

- Direct command只由current audit path和exact quarantine ID派生目标。
- Output与Phase531 list entry字段保持一致。
- Missing、existing和uncertain状态有稳定status/message。
- Command在所有路径保持read-only、no-follow和non-secret。
- Phase530至Phase537行为与接口保持。
- TypeScript、Python、built CLI integration与smoke全量回归通过。

## Phase568 后续加固

Phase568由shared direct/list inspector为targeted quarantine补充layout-selected owner final reread，以及root/optional nested terminal generation closure。Owner原地改写或layout generation drift时direct command仍保持read-only warning，但不发布owner location、metadata或fingerprint；exact ID派生、output字段集合与scan预算不变。

## Phase570 后续加固

Phase570在shared targeted quarantine inspector的terminal root/nested gates之后增加最后一次selected owner generation inspection。Gate期间的owner原地改写不再复用较早snapshot；direct/list projection继续使用既有unknown/state-changed字段，exact ID、output字段集合与bounded scan预算保持。

## Phase571 后续加固

Phase571由shared targeted inspector直接生成并发布candidate-bound owner fingerprint，CLI不再从selected owner token派生。Fingerprint编码exact quarantine path、layout/owner location、root/optional nested generations及terminal owner generation/metadata；同一stable entry的direct/list projection一致，copied candidate或其他layout/path不同。Existing output字段名、ID validation和bounded scan预算保持。
