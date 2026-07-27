# Phase569：Host tool audit disposal source quarantine terminal continuity

## 背景

Phase568为selected disposal自身建立了stable owner/empty authority observation，但`inspectJsonlAuditLockDisposalEntry(...)`仍按以下顺序工作：

1. 检查source quarantine；
2. 检查selected disposal root、layout和owner/empty fingerprint；
3. 直接返回initial source projection与final disposal authority。

Source quarantine absence是两类cleanup authority的必要条件：

- owner-only disposal cleanup；
- empty disposal cleanup。

若source在第一步被观察为missing，却在selected disposal final scan、owner reread或empty fingerprint observation期间重新出现，旧result仍保留`source_quarantine_exists: false`并签发cleanup confirmation。

Built Phase568 baseline probes已分别复现：

- owner-only disposal第二次root scan期间创建source directory，旧dry-run仍返回warning、owner fingerprint与`confirmation_required: true`；on-disk source已经存在。
- empty disposal第二次root scan期间创建source directory，旧dry-run仍返回warning、empty-directory confirmation与`confirmation_required: true`；on-disk source已经存在。

Destructive runtime会在mutation前重新执行source-absence assertions，因此旧行为不会直接删除source-present disposal，但会向operator签发已经失效的确认材料，并把current source state错误投影为absent。

## Runtime Contract

当initial source quarantine为missing，且selected disposal observation准备发布owner或empty fingerprint时，必须把一次terminal no-follow source-path observation作为authority closure的最后一步：

1. 对derived source quarantine path执行`lstat`；
2. `ENOENT`表示absence在当前observation终点仍成立；
3. 任何present entry，无论directory、regular file、symlink或其他类型，都表示source absence drift；
4. `ENOTDIR`、`ELOOP`等path-chain变化视为state drift；
5. 其他inspection error必须撤销authority并投影bounded error evidence。

Terminal source drift必须：

- 设置`sourceQuarantineStateChanged: true`；
- 设置disposal `stateChanged: true`；
- 将disposal `layout`降级为`unknown`；
- 清除owner metadata authority与owner token/PID/time；
- 清除empty directory fingerprint；
- 不执行任何rename、unlink或rmdir。

若terminal `lstat`直接观察到present entry，result更新为`sourceQuarantineExists: true`并投影no-follow entry type；directory layout固定为`unknown`，因为本阶段不为late source再启动第二套bounded quarantine inspection。

## Why Terminal Absence Check

本阶段只对initially-missing source执行terminal check。Initial source present、invalid或uncertain时cleanup本来就不具备source-absence authority；重复扫描整个source quarantine不会增强mutation safety，反而扩大成本和跨对象观察窗口。

Terminal operation只读取derived source path，不枚举temp namespace、不扫描late source children、不读取owner metadata。它闭合的是“source missing”这一cleanup prerequisite，而不是尝试产生source quarantine的完整新inspection。

Read-only result仍不是reservation。Terminal `lstat`返回后source可以立即出现；真实cleanup继续在pinned disposal transaction前后多次断言source missing。

## CLI Contract

不新增CLI字段。Late source appearance复用现有字段：

```text
source_quarantine_exists: true
source_quarantine_state_changed: true
source_quarantine_layout: unknown   # only when final entry is a directory
disposal_layout: unknown
state_changed: true
confirmation_required: false
```

Owner-only与empty cleanup dry-run均返回ERROR，不输出owner/empty fingerprint。Direct/list inspection返回warning。Human/JSON不得输出source child names、owner token、raw path error或race timing。

## Mutation Compatibility

不修改：

- `assertJsonlAuditLockDisposalSourceMissing(...)`；
- owner-only disposal cleanup transaction；
- empty disposal cleanup transaction；
- owner fingerprint或empty directory fingerprint算法；
- commit point、rollback或residual semantics。

Confirmed mutation仍依赖fresh source absence assertions；Phase569只阻止read-only inspection签发已知陈旧的confirmation material。

## Tests

- Runtime owner-only disposal：在第二次source-path `lstat`前创建source directory，必须撤销owner authority。
- Runtime empty disposal：同一terminal source race必须撤销empty fingerprint。
- CLI owner-only cleanup dry-run：无owner fingerprint、无confirmation、无unlink/rmdir。
- CLI empty cleanup dry-run：无empty fingerprint、无confirmation、无rmdir。
- Direct owner-only/empty inspection更新source existence/type/state-changed并保持non-secret。
- Stable source-missing owner-only与empty disposal继续发布原有fingerprint。
- Stable source-present disposal继续保持cleanup ineligible，不增加source child scan。
- Built smoke验证terminal check只新增source `lstat`，selected disposal仍使用既有bounded scan预算且selected `readdir`为0。

## 边界

- Persistent late source appearance会被拒绝；能够在terminal observation前后完成absence ABA的环境仍超出read-only snapshot保证。
- Source existence不证明PID、owner或recovery状态；late directory只投影`layout: unknown`。
- Namespace ownership、ACL与filesystem metadata可信边界不变。
- 不新增JSON-RPC、agent event、provider、tool result、transcript、persistent schema或CLI字段。

## 验收标准

- Initially-missing source必须在owner/empty disposal authority返回前再次no-follow确认missing。
- Persistent late source entry不能产生owner fingerprint、empty fingerprint或cleanup confirmation。
- Result必须明确表达source与disposal state drift，且不扫描或泄漏late source内部内容。
- Destructive cleanup source-absence assertions与transaction semantics保持。
- TypeScript build、Python、TypeScript、built integration与CLI smoke全部通过。
- Workspace及`/tmp`无probe、lock、smoke或patch残留，无FileHandle GC warning。

## 实现结果

- Built Phase568 baseline probes分别在owner-only和empty disposal第二次selected root scan期间创建source quarantine。旧owner cleanup dry-run仍返回source absent、owner fingerprint和confirmation；旧empty cleanup同样返回source absent与confirmation，而direct disk check已证明source存在。
- 新增module-private `finalizeJsonlAuditLockDisposalSourceAbsence(...)`，仅在initial source missing且owner token或empty fingerprint准备发布时执行terminal no-follow `lstat`。`ENOENT`保持authority；present entry更新source existence/type，directory layout固定unknown；path-chain或inspection failure同样fail closed。
- 新增`withdrawJsonlAuditLockDisposalAuthority(...)`集中撤销disposal layout、owner status/token/PID/time和empty fingerprint，并设置`stateChanged: true`。Late source同时设置`sourceQuarantineStateChanged: true`；terminal inspection error只投影bounded source error code，不读取source children。
- 新增2项runtime tests，分别覆盖owner-only与empty disposal在第二次source-path `lstat`前创建source directory；result必须更新source state、降级disposal且无owner/empty authority。新增2项CLI tests同时覆盖direct inspect与cleanup dry-run，确认无fingerprint/confirmation、无token泄漏且`unlink`/`rmdir`均未调用。
- 定向回归通过：`audit.test.ts` 213项、`cliAudit.test.ts` 73项，共286项；TypeScript build通过。
- Built CLI smoke新增owner-only与empty terminal-source probe：每个source path恰好2次`lstat`，owner disposal保持2次bounded scan/4次read，empty disposal保持4次bounded scan/4次read；late source `opendir`、selected/source `readdir`、`unlink`和`rmdir`均为0。两类cleanup返回source-present state-changed ERROR且无fingerprint/confirmation，source与disposal保持。
- 统一验收通过：Python 422项；TypeScript 43个test files、800项；TypeScript typecheck/build、built CLI integration和CLI smoke全部通过。README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase534-537/568历史边界已同步；JSON-RPC、agent event、provider、tool result、transcript、persistent schema和CLI字段集合未变化。
- 最终静态审计确认source/built artifact均包含terminal source continuity，`jsonlAuditSink.ts`无direct `fs.readdir(...)`，smoke脚本通过`bash -n`。Baseline probe遗留的两组source/disposal与一处abandoned lock已按精确路径清理；复查workspace及`/tmp`无audit、Phase569、rotation、smoke、`.tmp`/`.bak`/`.orig`/`.rej`残留，无integration/smoke/engine/test进程与FileHandle GC warning。

## Phase570 后续加固

Phase570在owner-only disposal的terminal source-absence success edge之后追加terminal owner generation inspection。Source持续missing但owner在Phase569 gate期间原地改写时，disposal仍降级unknown并撤销owner fingerprint/confirmation；empty branch与Phase569 late-source semantics保持。

## Phase571 后续加固

Phase571把本阶段terminal missing edge编码进owner-only disposal fingerprint：material包含derived source quarantine absolute path和显式`missing` marker，同时绑定disposal root/owner generations与metadata。Mutation重新确认source missing并重算同一value，其他qid/source path或copied disposal replacement不能使用旧confirmation；late-source authority withdrawal和empty branch保持。
