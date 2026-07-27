# Phase578：Host tool audit maintenance transient opener handle handoff

## 背景

Phase577已经保证candidate reader取得并持有pinned handles之后，selection rejection和top-level maintenance rejection都保留primary error，并通过typed lifecycle envelope投影descriptor finalization outcome。该边界仍遗漏`fs.open()`成功但helper尚未return handle的transient ownership。

Current runtime存在三类相邻缺口：

1. `openJsonlAuditLockPinnedDirectory(...)`、`openJsonlAuditLockPinnedEmptyDirectory(...)`或`inspectJsonlAuditLockPinnedOwnerMetadata(...)`在open成功后发生stat/identity/scan/metadata validation failure时，helper会在内部直接close。Secondary close throw可能覆盖primary validation error，outer candidate reader也无法把该未返回handle计入`handlesClosed`。
2. Maintenance operation中的parent/private-root/recovered-lock opener同样可能在return前丢失descriptor lifecycle evidence。`createPrivateJsonlAuditTemporaryDirectory(...)`还会在`Promise.allSettled`参数构造阶段直接调用`close()`；首个同步throw可能阻止后续parent handle close invocation。
3. Empty quarantine/disposal cleanup的terminal assertion会额外打开一个transient empty-directory descriptor。Operation本可继续提交时，该helper的close failure当前会把resolved cleanup改成ERROR，而不是沿Phase576 result-preserving fields报告secondary uncertainty。

Phase578 red probes确认：

- Active candidate root opener注入primary stat failure与secondary close throw时，caller只收到plain close error，primary validation message和typed details全部丢失。
- Quarantine recovery nested opener发生同类failure时，已返回root handle会关闭，但failed-open nested handle不进入outer outcome；typed error错误报告`handlesClosed:true`且message变成close failure。
- Empty quarantine terminal assertion的transient handle close throw会使本应成功的cleanup reject，目录保持未删除，无法通过resolved result报告warning。

## Ownership Contract

Maintenance transient opener遵循三路ownership：

1. `fs.open()`尚未成功：helper没有descriptor，不发生handoff，也不伪造lifecycle fields。
2. Open及全部validation成功：helper正常返回pinned object，由既有caller取得ownership。
3. Open成功但return前validation、scan或metadata读取失败：
   - 采用maintenance handoff collector的caller取得该handle唯一cleanup authority；
   - helper不再close-and-forget；
   - outer candidate或operation finalizer统一执行deduplicated normalized all-settled close；
   - 未采用collector的inspection、acquisition、release及其他既有caller保持原ownership语义。

Handoff只保存当前stack内的`FileHandle` object identity，不保存fd number，不进入error details、CLI、log、transcript或persistent state。Returned handle与failed-open handle不得同时归入两个owner；outer finalizer对object identity去重，每个descriptor最多一次close attempt。

## Covered Runtime Edges

Candidate acquisition：

- shared active/owner-quarantine root directory opener；
- owner-disposal root directory opener；
- empty quarantine/disposal pinned-empty opener；
- quarantine recovery root与nested directory opener；
- shared cleanup、disposal及recovery owner metadata opener。

Top-level operation：

- active cleanup private quarantine parent/root initialization；
- owner-quarantine cleanup private disposal parent/root initialization；
- empty quarantine、owner disposal、empty disposal及quarantine recovery mutation parent opener；
- quarantine recovery reservation后新active lock directory opener；
- empty quarantine/disposal terminal assertion的transient identity descriptor。

Candidate reader只在至少一个returned或handed-off handle存在时创建`JsonlAuditLockMaintenanceError`。Initial missing、non-directory precheck、`fs.open()`前/期间未取得descriptor的failure继续保持既有missing/plain-error contract，不输出closure fields。

## Finalization Contract

- Candidate rejection把returned handles与failed-open collector合并后交给Phase577 finalizer；primary message/cause保持，close success报告`handlesClosed:true`，任一failure报告false与bounded warning。
- Top-level operation把candidate、returned operation handles和transient collector统一finalize；existing typed error再次经过outer finalizer时继续合并outcome。
- Empty terminal assertion成功取得identity后，将transient handle ownership转交top-level finalizer。Namespace mutation与result先按既有语义完成，close failure只把resolved result标记为`cleanupHandlesClosed:false`和warning。
- Private temporary-directory initialization失败时，先按既有规则尝试回收namespace，再把所有已取得parent/root handles交给outer finalizer；secondary close failure不得替换initialization primary error。
- Sync `close()` throw必须先转为rejected Promise，不能阻止其余handles的close invocation。
- Aggregate warning继续满足total、single-line、512-character bound和owner-token non-disclosure。

## CLI Projection

Phase578不增加CLI production字段或新的projection helper。Phase577已经按exact operation identifier映射typed runtime failure：

- cleanup：`cleanup_handles_closed`、`cleanup_handle_warning`；
- recovery：`recovery_handles_closed`、`recovery_handle_warning`。

本阶段只扩大这些既有fields覆盖的descriptor graph。Resolved empty cleanup继续沿Phase576 WARN规则输出secondary close warning；preflight refusal和initial missing仍省略fields。

## Tests

- Active root candidate opener validation failure叠加close failure：primary message保持、typed active operation details为false/warning。
- Owner metadata failed-open path覆盖shared quarantine/disposal reader，验证returned directory与failed-open owner一起finalize。
- Empty pinned opener自身scan/validation failure叠加close failure，验证exact empty operation identifier。
- Quarantine recovery nested opener failure验证returned root仍关闭、failed-open nested close failure进入同一outcome。
- Private temporary root initialization primary failure叠加root close同步throw，验证parent close仍启动且active/owner-quarantine operation identifier正确。
- Mutation parent与recovery reservation opener failure验证top-level collector、rollback/namespace state及primary error保持。
- Empty quarantine/disposal terminal assertion close failure验证operation仍resolved removed，并投影cleanup warning。
- Pre-open failure、initial missing及preflight refusal继续省略lifecycle fields。
- CLI JSON/human和compiled smoke覆盖candidate-open ERROR与resolved transient-close WARN，不泄漏owner token。

## 接口边界

- 不新增public runtime result/error fields；复用Phase577 `JsonlAuditLockMaintenanceError`与六个operation identifiers。
- 不新增CLI flags、commands、human/JSON field names、exit status或preflight schema。
- 不修改fingerprint、candidate selection、mutation ordering、commit/rollback、residual locator、terminal existence或liveness semantics。
- 不修改JSON-RPC、agent event、provider、tool result、transcript、owner metadata或persistent schema。
- Optional handoff参数和collector均保持module-private，不扩展normal writer、lock acquisition/release或inspection的public contract。

## 验收标准

- Open成功但return前失败的maintenance descriptor必须由outer finalizer取得唯一ownership，close failure不得覆盖primary validation error。
- Returned与failed-open multi-handle graph必须全部获得close attempt，首个同步throw不得截断后续close。
- Resolved empty cleanup不得因terminal assertion transient close failure退化为ERROR。
- `handlesClosed:true`必须覆盖candidate及operation已经取得的全部returned/handed-off transient descriptors。
- Initial missing和未取得descriptor的failure不得伪造lifecycle evidence。
- Existing six-operation CLI projection、mutation/rollback与non-disclosure contract保持。
- Python、TypeScript、build、built integration和CLI smoke全部通过。
- Workspace及`/tmp`无probe、smoke、integration、audit lock或patch残留，无相关test/engine/CLI进程和FileHandle GC warning。

## 实现结果

Phase578已按上述ownership和compatibility边界完成实现。

### Red probe与修复结论

- Active candidate root opener在stat primary failure叠加close throw时，旧实现只返回plain secondary close error；现在failed-open handle由candidate collector接管，最终返回保留primary message/cause的`JsonlAuditLockMaintenanceError`和false/warning details。
- Quarantine recovery nested opener旧实现虽然关闭了已返回root handle，却把nested close failure当作primary message并错误报告`handlesClosed:true`；现在returned root与failed-open nested descriptor进入同一deduplicated all-settled finalizer，后续close invocation不中断。
- Empty quarantine terminal assertion旧实现因transient identity handle close failure而reject且不执行removal；现在identity结果先交还operation，transient handle由top-level finalizer关闭，cleanup保持`removed:true`并通过resolved warning表达secondary uncertainty。

### Runtime实现

- `openJsonlAuditLockPinnedDirectory(...)`、`openJsonlAuditLockPinnedEmptyDirectory(...)`、`openJsonlAuditLockMutationParentDirectory(...)`、`requireJsonlAuditLockMutationParentDirectory(...)`和`inspectJsonlAuditLockPinnedOwnerMetadata(...)`增加module-private optional failed-open handle handoff。
- Shared active/quarantine、owner-disposal、empty quarantine/disposal和quarantine recovery candidate readers各自维护local collector。只有returned或handed-off handles非空时才创建Phase577 typed failure；pre-open zero-descriptor error保持plain contract。
- 六个top-level maintenance operation都维护transient collector，覆盖private temporary parent/root、mutation parent、recovery reservation及empty terminal assertion clone。
- `createPrivateJsonlAuditTemporaryDirectory(...)`在初始化失败并完成既有namespace rollback attempt后，把parent/root handles交给outer operation；未提供collector的fallback也改用normalized all-settled finalizer，不再在Promise参数构造阶段直接调用throwing `close()`。
- `readJsonlAuditLockEmptyDirectoryIdentity(...)`在maintenance assertion成功后handoff短生命周期handle，使namespace result与descriptor finalization解耦。
- Maintenance finalizer按`FileHandle` object identity去重后再执行normalized `Promise.allSettled`，避免同一descriptor重复close并保持aggregate bounded warning。

### CLI与自动化验证

- CLI production mapping无需新增代码或字段；Phase577 exact-operation projection自动覆盖新的candidate-open和operation transient failure graph。
- Runtime audit suite新增13项回归，累计255 tests passed，覆盖zero-descriptor omission、directory/empty/owner failed-open、private bootstrap、mutation parent、recovery reservation、multi-handle continuity和两个empty resolved-result path。
- CLI audit suite新增2项回归，累计104 tests passed，覆盖active candidate-open ERROR projection和empty quarantine transient assertion resolved WARN projection。
- TypeScript全量：43 test files、873 tests passed。
- `bash tools/check.sh`通过：Python 422 tests、TypeScript 43 files/873 tests、TypeScript build、built integration和完整CLI smoke全部成功，最终输出`CLI smoke ok`。
- Compiled smoke新增`built audit maintenance transient opener handle handoff`场景，直接验证dist runtime candidate-open typed failure和dist CLI empty cleanup result preservation、filesystem state与non-disclosure。

### 静态、文档与残留审计

- Source与compiled dist均包含六个top-level transient collectors、五个maintenance candidate collectors、optional opener handoff及object-identity deduplication；private temporary finalization不再存在raw `Promise.allSettled([handle.close()])`构造。
- `README.md`、`PROJECT_PLAN.md`、`INTERNAL_DESIGN.md`、`ARCHITECTURE.md`、`EXTENSION_POINTS.md`、`SECURITY.md`和`protocol/README.md`已同步到Phase578，project item 567与extension item 493已登记完成，Phase577延期边界已回链本阶段。
- Workspace未发现`.tmp`、`.bak`、`.orig`或`.rej`残留。Full check留下的9个`/tmp/god-code-audit-0-*.lock`目录经owner PID核验均无存活进程后已清理；Phase578、smoke与audit相关`/tmp`复核为空。
- 未发现残留vitest、pytest、check、smoke、integration、engine或CLI进程，也未观察到FileHandle GC warning。

Phase578不改变normal writer、lock acquisition/release、read-only inspection或rotation recovery专用Phase559 handoff contract。其延期的maintenance bounded child scan `Dir` close control-flow边界已由Phase579纳入同一lifecycle evidence；single-attempt close retry/uncertainty策略仍可在后续阶段独立审计。
