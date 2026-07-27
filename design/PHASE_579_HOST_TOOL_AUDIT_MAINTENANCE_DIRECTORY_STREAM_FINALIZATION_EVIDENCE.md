# Phase579：Host tool audit maintenance directory stream finalization evidence

## 背景

Phase576-578已经把maintenance candidate、operation和failed-open `FileHandle`的finalization变成result-preserving typed lifecycle evidence。Lock child scan仍使用`fs.opendir()`取得独立`Dir` stream，并在`scanJsonlAuditLockDirectoryEntries(...)`的`finally`中直接`await stream.close()`。

该stream descriptor未进入现有finalization graph，产生三个相邻缺口：

1. `stream.read()`发生primary error且`stream.close()`同时失败时，finally close failure覆盖primary scan error；outer candidate只能看到secondary message。
2. Scan已经成功取得authoritative entries时，stream close failure仍使candidate selection reject，把本可继续提交的cleanup改成ERROR。
3. Private temporary initialization或后续operation assertion的scan close failure同样切断transaction result，无法沿Phase576 fields表达secondary uncertainty。

Phase579 red probes确认：

- Active candidate initial child scan叠加read primary failure和close同步throw时，typed error message变成close reason，details错误报告`handlesClosed:true`且无warning。
- Candidate scan读取成功但close throw时，active cleanup在任何mutation前reject，而不是提交并返回cleanup warning。
- Private quarantine initialization scan读取成功但close throw时，helper回收wrapper后仍把close reason作为operation ERROR，candidate与private handles的最终closure outcome无法包含该stream。

## Resource Contract

Directory stream与longer-lived pinned `FileHandle`采用不同lifecycle策略：

- `Dir` stream在scan helper退出前立即close，不延长到namespace mutation或operation结束，避免额外保持directory enumeration resource。
- Maintenance-aware scan使用normalized non-throwing close；close outcome记录到stack-local finalization context，scan primary/result本身保持。
- Pinned `FileHandle`仍按Phase578在candidate/operation结束时统一all-settled close。
- Outer finalizer合并context中已完成的stream close outcomes与尚待关闭的FileHandles，形成一个authoritative `closed`/warning result。
- Read-only inspection、normal acquisition/release和未采用maintenance context的scan继续保持既有direct close/error contract。

Context只保存：

```text
pending FileHandles
aggregate closed boolean
optional bounded warning
```

它不保存Dir entry names、fd numbers、raw resources或raw error objects，也不进入public result、CLI、log、transcript或persistent state。

## Runtime Design

新增module-private `JsonlAuditLockMaintenanceFinalizationContext`：

- `handles`保存Phase578 failed-open handoff；
- `outcome`累计已经立即finalize的Dir stream evidence；
- pinned directory可携带optional context，使shared assertion/scan helper无需依赖global或async-local state；
- maintenance candidate result保存其context，top-level operation finalizer同时合并candidate context和operation context。

`scanJsonlAuditLockDirectoryEntries(...)`在directory携带context时：

1. 完成bounded read或捕获primary read rejection；
2. 通过sync-throw-normalized close helper立即关闭stream；
3. 将close success/failure合并进context；
4. 成功scan照常return，primary read rejection照常rethrow；
5. close rejection不再改变scan control flow。

Outer finalizer按context object identity和FileHandle object identity去重。Aggregate warning继续使用single-line、total 512-character bound；stream与handle close failures可共同出现在同一warning中。

## Covered Maintenance Graph

- Shared active/owner-quarantine candidate scans及其top-level assertions/rollback。
- Owner-disposal candidate scans及cleanup assertions。
- Empty quarantine/disposal pinned-empty initial/final scans。
- Quarantine recovery root/nested candidate scans、reservation assertions、post-transfer assertions与cleanup/rollback scans。
- Active/quarantine private temporary initialization、rollback与contraction scans。
- Empty assertion clone通过Phase578 operation context继承stream outcome。

Inspection-only active/quarantine/disposal enumeration、normal acquisition cleanup以及rotation staging scan不在本阶段扩展；它们不投影maintenance lifecycle fields。

## CLI Projection

Phase579不新增CLI production字段。Runtime resolved result或typed rejection继续复用：

- cleanup：`cleanup_handles_closed`、`cleanup_handle_warning`；
- recovery：`recovery_handles_closed`、`recovery_handle_warning`。

字段名称仍沿用handle terminology，但语义是maintenance-owned descriptor resources的aggregate finalization；不新增stream-specific public字段。Stable close仍报告true且省略warning，preflight/initial missing继续省略lifecycle evidence。

## Tests

- Candidate scan read primary failure叠加stream close failure：primary message/cause保持，typed details为false/warning。
- Candidate scan success叠加stream close failure：active cleanup仍提交，resolved result为false/warning。
- Private temporary initialization scan success叠加stream close failure：helper继续初始化和transaction，final result保留。
- Owner quarantine、owner disposal、empty cleanup和quarantine recovery分别验证context随candidate成功handoff到top-level finalizer。
- Multiple stream close failures与FileHandle close failure共同聚合，warning single-line且不超过512字符。
- Zero-context inspection scan继续按既有inspection error语义处理，不产生maintenance fields。
- CLI JSON/human与compiled smoke覆盖resolved stream-close WARN和read-primary ERROR，不泄漏owner token。

## 接口边界

- 不新增public runtime types、result/error fields或operation identifiers。
- 不新增CLI flags、commands、human/JSON field names或exit status。
- 不修改scan entry budget、truncation、fingerprint、mutation ordering、commit/rollback、residual locator或terminal existence semantics。
- 不修改JSON-RPC、agent event、provider、tool result、transcript、owner metadata或persistent schema。
- 不把stream close failure解释为scan content failure、namespace mutation failure或liveness evidence。

## 验收标准

- Dir stream close failure不得覆盖scan read primary error或成功scan result。
- Candidate/operation context必须在resolved与rejected branch都合并stream和FileHandle finalization evidence。
- Successful maintenance transaction不得仅因stream close uncertainty降级为ERROR。
- Stable close报告true且无warning；任一stream/handle failure报告false与bounded warning。
- Inspection、preflight、initial missing、mutation与跨层contract保持。
- Python、TypeScript、build、built integration和CLI smoke全部通过。
- Workspace及`/tmp`无probe、smoke、integration、audit lock或patch残留，无相关test/engine/CLI进程和FileHandle/Dir GC warning。

## 实现结果

Phase579已按上述resource、control-flow和compatibility边界完成实现。

### Red probe与修复结论

- Active candidate scan的`read()` primary failure叠加`close()`同步throw时，旧实现由`finally`中的close reason覆盖primary error，并错误报告`handlesClosed:true`且无warning；现在typed maintenance error保持read message/cause，stream close outcome进入false/warning details。
- Candidate scan成功但stream close失败时，旧实现会在namespace mutation前reject；现在scan entries照常进入authoritative selection，active cleanup完成提交并通过resolved WARN表达secondary uncertainty。
- Private temporary initialization scan成功但stream close失败时，旧实现中断初始化并返回operation ERROR；现在private transaction继续执行，stream evidence与private/candidate `FileHandle` closure在outer finalizer统一聚合。

### Runtime实现

- 新增module-private `JsonlAuditLockMaintenanceFinalizationContext`，同时保存Phase578 pending failed-open handles和已完成descriptor close aggregate outcome；pinned maintenance directory与candidate result携带该context。
- `scanJsonlAuditLockDirectoryEntries(...)`只在存在maintenance context时使用normalized non-throwing stream close并记录outcome；无context的inspection scan继续直接`await stream.close()`，rotation staging scanner也保持原direct-close实现。
- 六个top-level cleanup/recovery operation与五个maintenance candidate reader分别创建operation/candidate context，并在resolved和rejected branch把candidate context、operation context及returned handles交给shared finalizer。
- Shared finalizer按context object identity和resource object identity去重，先合并context中已完成的stream evidence，再all-settled关闭pending `FileHandle`；消费后的context handle queue被清空，避免重复finalization。
- Stream与handle failure继续使用同一single-line bounded warning formatter；不保存entry names、fd number、raw resource或raw error object。

### CLI与自动化验证

- CLI production mapping无需新增字段；Phase576/577既有cleanup/recovery lifecycle projection同时覆盖stream与`FileHandle` aggregate outcome。
- Runtime audit suite新增9项回归，累计264 tests passed，覆盖scan primary/result preservation、private initialization、stream加handle聚合、inspection direct-close以及owner quarantine/disposal、empty disposal和recovery handoff。
- CLI audit suite新增2项回归，累计106 tests passed，覆盖active cleanup resolved WARN与read-primary ERROR的human/JSON projection及owner-token non-disclosure。
- TypeScript全量为43 test files、884 tests passed。
- `bash tools/check.sh`通过：Python 422 tests、TypeScript 43 files/884 tests、TypeScript build、built integration和完整CLI smoke全部成功，最终输出`CLI smoke ok`。
- Compiled smoke新增`built audit maintenance directory stream finalization evidence`场景，直接验证dist runtime primary-error continuity和dist CLI committed cleanup result preservation、filesystem state与non-disclosure。

### 静态、接口、文档与残留审计

- Source与compiled dist均包含6个top-level operation contexts、5个candidate contexts、context/outcome merger和normalized resource finalizer；rotation staging scanner仍直接close，lock scanner只在maintenance context存在时记录non-throwing outcome。
- Source、CLI与protocol未出现stream-specific public lifecycle field；既有operation identifiers、scan budget、fingerprint、mutation/rollback、residual、wire和persistent contracts保持。
- `README.md`、`PROJECT_PLAN.md`、`INTERNAL_DESIGN.md`、`ARCHITECTURE.md`、`EXTENSION_POINTS.md`、`SECURITY.md`和`protocol/README.md`已同步到Phase579，project item 568与extension item 494已登记完成，Phase578延期边界已回链本阶段。
- Workspace未发现`.tmp`、`.bak`、`.orig`或`.rej`残留。Full check留下的11个`/tmp/god-code-audit-0-*.lock`目录经owner PID核验均无存活进程后已逐项清理；Phase579、smoke、integration与audit相关`/tmp`复核为空。
- 未发现残留vitest、pytest、check、smoke、integration、engine或CLI进程，也未观察到FileHandle/Dir GC warning。

Phase579不改变normal writer、lock acquisition/release、read-only inspection、rotation staging或Phase559 rotation recovery handoff contract。其延期的maintenance descriptor close Promise settlement上界已由Phase580以single-attempt 5000ms deadline闭合；inspection与rotation family仍可在后续阶段独立审计。
