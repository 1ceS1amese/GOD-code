# Phase570：Host tool audit terminal owner file generation continuity

## 背景

Phase566-569依次为active lock、quarantine/disposal residue和source quarantine absence增加terminal directory/source gates。但owner-bearing branches的最后一次owner content snapshot仍发生在这些awaited gates之前：

- active lock：owner snapshot -> terminal lock-directory generation gate；
- quarantine：selected owner reread -> terminal nested/root generation gates；
- disposal：selected owner reread -> terminal source-quarantine absence gate。

Owner file原地写入不会改变containing directory或shared parent的ctime。若在上述terminal gate期间把`owner.json`原地改写为另一份valid metadata，directory/source gate仍可成功，旧result会发布改写前的owner token及fingerprint。

Built Phase569 baseline probes已分别复现：

- active cleanup在第五次logical lock-path `lstat`期间改写owner，仍签发old coordination fingerprint；
- owner-only quarantine cleanup在第五次quarantine-root `lstat`期间改写owner，仍签发old owner fingerprint；
- owner-only disposal cleanup在第二次source-path `lstat`期间改写owner，仍报告source absent并签发old owner fingerprint。

三条probe的on-disk token均已是replacement value，证明directory/source continuity不能代替owner file generation continuity。

## Runtime Contract

Owner-bearing read-only authority在所有branch-specific terminal non-owner gates完成后，必须执行最后一次bounded owner inspection。Terminal owner inspection要求：

1. owner path与前一validated inspection一致；
2. metadata status一致；
3. valid owner的device、inode、ctimeNs、birthtimeNs、mtimeNs和size全部一致；
4. canonical version、owner token、PID、acquired time全部一致；
5. 单次inspection内部继续执行no-follow path/open、descriptor/path identity和4096-byte bounded content snapshot。

Terminal inspection失败或与前一validated owner不同，必须撤销owner authority：

- active lock：`stateChanged: true`、`ownerEntryExclusive: false`，清除owner fields；
- quarantine：`stateChanged: true`、`layout: unknown`，清除selected owner fields；
- disposal：`stateChanged: true`、`layout: unknown`，清除owner fields/fingerprint；
- cleanup dry-run不生成confirmation，不执行mutation。

Stable authority只从terminal owner inspection发布，不继续使用较早snapshot。

## Private Owner Generation Evidence

`JsonlAuditLockOwnerInspection`增加module-private full file identity evidence，不增加exported runtime/CLI字段。Valid pinned inspection保存其descriptor-validated：

```text
device / inode / ctimeNs / birthtimeNs / mtimeNs / size
```

Owner inspection comparator从仅比较device/inode与semantic metadata，升级为比较完整file generation与metadata。这样即使原地写回相同JSON，只要filesystem反映新的ctime/mtime generation，也不会继续复用旧snapshot。

Missing/invalid owner不携带file identity或metadata；其terminal continuity仍要求相同path/status。它们不产生fingerprint authority。

## Authority Order

### Active lock

```text
initial owner pin
-> final child scan
-> owner snapshot
-> terminal directory generation
-> terminal owner inspection
-> authority projection
```

### Quarantine

```text
initial selected owner inspection
-> final root/nested scans
-> selected owner reread
-> terminal root/nested generation
-> terminal selected owner inspection
-> layout/owner projection
```

### Disposal owner-only

```text
initial owner inspection
-> final root scan/generation
-> selected owner reread
-> terminal source absence
-> terminal owner inspection
-> authority projection
```

Empty branches没有owner authority，不增加owner inspection。

## CLI Contract

不新增CLI字段。Terminal owner drift复用既有state-changed/unknown投影并省略owner fingerprint：

```text
state_changed: true
layout: unknown              # quarantine/disposal
confirmation_required: false
owner_fingerprint: omitted
```

Active cleanup沿用`coordination_lock_state_changed: true`和ERROR。Human/JSON不输出old/new token、full file timestamps、raw metadata或race timing。

## Mutation Compatibility

不修改destructive cleanup/recovery/release的pinned owner transaction、fingerprint算法、commit point、rollback或residual semantics。Mutation paths已经在namespace syscall前后独立验证owner descriptor/path/content；Phase570只收紧read-only authority发布。

## Tests

- Active runtime/CLI cleanup：terminal directory gate期间原地改写owner，必须无authority/fingerprint。
- Quarantine owner-only runtime/CLI cleanup：terminal root gate期间改写owner，必须unknown且无fingerprint。
- Disposal owner-only runtime/CLI cleanup：terminal source gate期间改写owner，必须unknown且无fingerprint。
- Nested quarantine selected owner terminal drift同样拒绝。
- Stable active/quarantine/disposal owner-bearing paths继续发布相同字段。
- Owner basename replacement、directory/source generation drift与Phase565-569 tests继续通过。
- Built smoke验证不增加child scan或`readdir`，只增加bounded terminal owner open/read；无unlink/rmdir和secret leakage。

## 边界

- Terminal inspection给出有限read-only observation终点，不是filesystem reservation；返回后owner或namespace仍可立即变化。
- 受信任namespace ownership/ACL和filesystem timestamp语义要求不变。
- 快速ABA且能够恢复全部file generation metadata的环境不在保证范围。
- 不新增JSON-RPC、agent event、provider、tool result、transcript、persistent schema或CLI字段。

## 验收标准

- 所有owner-bearing read-only authority必须以branch-specific terminal gates之后的owner inspection结束。
- Persistent owner rewrite不能产生active/quarantine/disposal cleanup fingerprint。
- Comparator必须覆盖full owner file generation和canonical metadata。
- Child scan预算、mutation transactions和public interfaces保持。
- TypeScript build、Python、TypeScript、built integration与CLI smoke全部通过。
- Workspace及`/tmp`无probe、lock、smoke或patch残留，无FileHandle GC warning。

## 实现结果

- Built Phase569 baseline probes分别在active lock第五次logical lock-path `lstat`、owner-only quarantine第五次root-path `lstat`和owner-only disposal第二次source-path `lstat`期间原地改写owner。旧cleanup dry-run仍签发改写前fingerprint/confirmation，而on-disk token已是replacement value；三组probe artifact均已按精确路径清理。
- `JsonlAuditLockOwnerInspection`新增module-private `fileIdentity`，由descriptor-validated owner snapshot携带device、inode、ctimeNs、birthtimeNs、mtimeNs与size。`jsonlAuditLockOwnerInspectionsMatch(...)`现在同时比较full file generation、path/status和canonical metadata；exported runtime、CLI、wire与persistent字段未增加。
- Active lock在terminal directory generation gate之后执行最后一次owner inspection，并只从terminal snapshot发布owner fields。Owner-bearing quarantine在terminal root/optional nested gates之后重新读取layout-selected owner；owner-only disposal在Phase569 terminal source-absence gate之后重新读取owner。任一不连续或terminal inspection failure都复用既有state-changed/unknown authority withdrawal。
- 新增4项runtime tests，覆盖active、owner-only quarantine、nested `lock_with_owner`和owner-only disposal的terminal owner rewrite；新增3项CLI cleanup tests，验证无fingerprint/confirmation、无old/new token或fingerprint泄漏且`unlink`/`rmdir`均未调用。定向回归通过：`audit.test.ts` 217项、`cliAudit.test.ts` 76项，共293项；TypeScript build通过。
- Built CLI smoke新增terminal owner generation probe：active与quarantine observed path各恰好5次`lstat`，disposal source path恰好2次；active/quarantine/disposal selected directory均保持2次bounded `opendir`、4次`read`，selected `readdir`、`unlink`和`rmdir`均为0。三类cleanup均返回state-changed ERROR、无fingerprint/confirmation，改写后的owner保持。
- 统一验收通过：Python 422项；TypeScript 43个test files、807项；TypeScript typecheck/build、built CLI integration和CLI smoke全部通过。README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase528/530-532/534-535/537-538/565-569历史边界已同步；JSON-RPC、agent event、provider、tool result、transcript、persistent schema和CLI字段集合未变化。
- 最终静态与接口审计确认source/built artifact均包含terminal owner logic，`jsonlAuditSink.ts`无direct `fs.readdir(...)`，smoke脚本通过`bash -n`，current phase markers均为Phase570。Workspace及`/tmp`无audit/probe/smoke、`.tmp`/`.bak`/`.orig`/`.rej`残留，无integration/smoke/engine/test进程与FileHandle GC warning。

## Phase571 后续加固

Phase571使用本阶段terminal owner `fileIdentity`与canonical metadata作为candidate-bound fingerprint的owner node，并组合active/quarantine/disposal branch-specific directory/source material。Token-only helper退出authoritative path；shared inspector发布Host-local optional fingerprint，mutation从fresh pinned candidate重算。Phase570 drift withdrawal仍决定是否存在authority，Phase571只收紧stable authority确认，不改变terminal owner comparator或bounded read预算。
