# Phase577：Host tool audit maintenance rejection handle finalization evidence

## 背景

Phase576保证五类cleanup与pre-commit quarantine recovery的resolved result不会再被descriptor close failure覆盖，并为candidate-existing success/residual result增加cleanup/recovery closure fields。该阶段明确延期了rejected operation的secondary finalization envelope。

Current runtime仍有两个相邻缺口：

1. Candidate已经成功选择并handoff handles后，operation primary error会在non-throwing finalizer之后原样reject；primary message保持，但`closed`/warning outcome被丢弃，CLI ERROR无法说明descriptor finalization是否完整。
2. Candidate selection在已取得pinned directory/owner handles后失败时，shared cleanup/disposal readers和quarantine recovery reader仍直接构造`Promise.all(handle.close())`，empty readers直接await throwing close。首个同步close throw会覆盖fingerprint/validation primary error，且multi-handle reader后续close invocation不会启动。

Phase577 red probes分别确认：

- Active cleanup `beforeQuarantine`抛出primary error并叠加candidate directory close throw时，runtime只返回plain `Error`，CLI只保留preflight-shaped ERROR，不包含Phase576 lifecycle fields。
- Active candidate owner fingerprint mismatch叠加directory close同步throw时，caller收到close message而不是fingerprint mismatch，owner handle close调用次数为0。

## Evidence Contract

1. 一旦maintenance candidate reader取得并拥有pinned handle，后续selection或operation rejection必须保留primary error message/cause，并结构化附加handle finalization outcome。
2. Runtime新增exported `JsonlAuditLockMaintenanceError`，其details至少包含：
   - exact maintenance operation identifier；
   - `handlesClosed`；
   - optional bounded `handleWarning`。
3. Covered operation identifiers：
   - `active_lock_cleanup`
   - `owner_quarantine_cleanup`
   - `empty_quarantine_cleanup`
   - `owner_disposal_cleanup`
   - `empty_disposal_cleanup`
   - `quarantine_recovery`
4. Candidate-selection与post-selection operation rejection均使用同一typed envelope；existing envelope再次经过outer finalizer时必须合并closure boolean和warning，而不是丢弃早期evidence。
5. 所有已handoff handles必须通过async invocation normalization进入all-settled；同步throw不得截断后续handle close。
6. 全部close成功的rejection投影`handlesClosed:true`且省略warning；任一failure投影false与total、single-line、aggregate-bounded warning。
7. CLI ERROR保持`ok:false`、primary message与原preflight/runtime evidence，并将typed failure映射到已经存在的cleanup/recovery snake_case fields。
8. Preflight refusal、invalid flag/fingerprint、initial missing以及尚未取得operation-owned handle的failure不伪造lifecycle fields。
9. Typed failure evidence不被解释为namespace commit、rollback、selected existence或liveness proof。
10. Owner token、raw owner JSON、raw identity和unbounded close reason不得进入error details或rendered report。

## Runtime Design

新增：

```text
JsonlAuditLockMaintenanceOperation
JsonlAuditLockMaintenanceFailureDetails
JsonlAuditLockMaintenanceError
```

Failure details使用neutral lifecycle names：

```text
operation
handlesClosed
handleWarning?
```

Module-private merger接收primary error、authoritative outer operation identifier及finalization outcome：

```text
primary/plain error
  -> preserve normalized primary message and cause
existing maintenance error
  -> merge previous closed/warning with new outcome
  -> outer operation identifier remains authoritative
```

五类cleanup与recovery top-level operation增加explicit rejection capture。`finally`仍先关闭全部candidate/parent/private handles；resolved result沿Phase576写入result fields，rejected branch则throw typed maintenance error。

Candidate readers在取得pinned handles后的catch/finally中改用同一non-throwing all-settled finalizer：

- shared active/owner-quarantine owner reader；
- owner-disposal reader；
- empty quarantine reader；
- empty disposal reader；
- quarantine recovery root/nested/owner reader。

Open helper内部尚未handoff给candidate reader的transient descriptor contract不在本阶段扩展；本阶段边界从candidate reader取得handle ownership开始。

## CLI Projection

`ts-host/src/cli/audit.ts`引入module-private failure projection helper：

- cleanup operation映射到`cleanup_handles_closed`与`cleanup_handle_warning`；
- recovery映射到`recovery_handles_closed`与`recovery_handle_warning`；
- 仅当error为typed maintenance error且operation identifier与command一致时投影。

Status仍为ERROR，message仍为primary operation message。Phase572 positive fingerprint timing、Phase573/574 terminal existence、Phase575 missing snapshot withdrawal和Phase576 resolved-result WARN rules均保持。

## Tests

- Runtime active candidate-selection fingerprint mismatch叠加first close同步throw：primary message保持、owner close仍启动、typed details为false/warning。
- 六条top-level operation分别注入primary hook error与candidate close failure，验证operation identifier、false/warning、primary message、filesystem pre-commit/rollback state和后续handle close continuity。
- Owner disposal、empty quarantine、empty disposal与quarantine recovery candidate-selection failure分别覆盖其独立reader finalization；shared active reader同时覆盖owner-quarantine reader实现。
- Stable rejected operation close success投影`handlesClosed:true`且无warning。
- CLI active cleanup与quarantine recovery ERROR投影对应snake_case lifecycle fields，human/JSON保持primary message且不泄漏owner token。
- Preflight mismatch和runtime missing tests继续省略lifecycle fields。
- Built smoke覆盖compiled runtime candidate-selection rejection、CLI active operation rejection及CLI recovery rejection。

## 接口边界

- 新增一个Host runtime exported error class、operation type与failure details interface。
- CLI不新增字段，只扩展Phase576 optional lifecycle fields在typed ERROR branch的出现条件。
- 不修改CLI flags、command names、JSON-RPC、agent event、provider、tool result、transcript或persistent schema。
- 不改变candidate fingerprint、mutation ordering、commit point、rollback、residual locator或selected existence semantics。
- Existing throwing multi-handle closer继续服务未迁移caller；只将maintenance-owned rejected finalization接入non-throwing envelope。

## 验收标准

- Candidate-selection close failure不得覆盖primary fingerprint/validation error。
- Multi-handle candidate reader的首个同步close throw不得阻止后续close invocation。
- Post-selection primary error必须携带structured closure outcome且message/cause保持。
- CLI ERROR必须投影typed lifecycle fields，同时保持operation、preflight与non-disclosure语义。
- Stable resolved、residual、rollback、runtime missing与preflight refusal行为保持。
- Python、TypeScript、build、built integration与CLI smoke全部通过。
- Workspace及`/tmp`无probe、smoke、integration、audit lock或patch残留，无相关test/engine/CLI进程和FileHandle GC warning。

## 实现结果

Phase577已按上述边界完成实现。

### Red probe与修复结论

- Post-selection maintenance primary error原先只保留plain `Error` message，descriptor close outcome会被丢弃；现在六条operation rejection均返回`JsonlAuditLockMaintenanceError`，保留primary message/cause并携带finalization details。
- Candidate-selection reader原先可能在构造`Promise.all(handle.close())`时被首个同步close throw截断，覆盖fingerprint/validation primary error且不再调用后续handle；现在所有已handoff handles都通过normalized async invocation进入`Promise.allSettled`，primary error保持，后续close invocation继续执行。

### Runtime与CLI实现

- `ts-host/src/audit/jsonlAuditSink.ts`导出`JsonlAuditLockMaintenanceOperation`、`JsonlAuditLockMaintenanceFailureDetails`和`JsonlAuditLockMaintenanceError`。
- 新增maintenance failure merger，在candidate-selection envelope再次经过top-level finalizer时合并closure boolean与bounded warning，并以outer operation identifier作为authoritative operation。
- Active cleanup、owner quarantine cleanup、empty quarantine cleanup、owner disposal cleanup、empty disposal cleanup和quarantine recovery的top-level rejection均接入typed finalization envelope。
- Shared active/quarantine reader、owner-disposal reader、empty quarantine reader、empty disposal reader和quarantine recovery reader均迁移到non-throwing all-settled finalization。
- Aggregate close warning现在对完整结果执行single-line与512-character bound，而不是只限制各个reason fragment。
- `ts-host/src/cli/audit.ts`新增typed failure projection helper；六条command catch仅在operation identifier匹配时，将runtime details映射到Phase576既有`cleanup_*`或`recovery_*`字段。ERROR status、primary message和preflight evidence保持不变。

### 自动化验证

- Runtime audit suite：242 tests passed。
- CLI audit suite：102 tests passed。
- TypeScript全量：43 test files、858 tests passed。
- `bash tools/check.sh`通过：Python 422 tests、TypeScript 43 files/858 tests、TypeScript build、built integration和完整CLI smoke全部成功，最终输出`CLI smoke ok`。
- Compiled smoke覆盖runtime active candidate-selection fingerprint rejection、CLI active cleanup operation rejection和CLI quarantine recovery rejection，均验证primary message、closure fields、filesystem state与owner-token non-disclosure。
- 最终轻量复核通过：`bash -n tools/run-cli-smoke.sh`以及`cd ts-host && npm run build`。

### 静态、文档与残留审计

- Source与compiled dist均包含exported maintenance error及六个exact operation mappings；CLI source与dist均包含六个projection call。
- 五个已迁移candidate reader不再存在raw maintenance `Promise.all(handle.close())`；相关close路径只使用normalized `Promise.allSettled` finalizer。
- `README.md`、`PROJECT_PLAN.md`、`INTERNAL_DESIGN.md`、`ARCHITECTURE.md`、`EXTENSION_POINTS.md`、`SECURITY.md`和`protocol/README.md`已同步到Phase577，project item 566与extension item 492已登记完成。
- Workspace未发现`.tmp`、`.bak`、`.orig`或`.rej`残留。全量测试留下的15个`/tmp/god-code-audit-0-*.lock`目录经owner PID核验均无存活进程后已清理；Phase577、smoke与audit相关`/tmp`复核为空。
- 未发现残留vitest、pytest、smoke、integration、engine或CLI进程，也未观察到FileHandle GC warning。

未handoff给candidate reader的transient opener descriptor lifecycle不在Phase577中扩大；该延期边界已由[Phase578](PHASE_578_HOST_TOOL_AUDIT_MAINTENANCE_TRANSIENT_OPENER_HANDLE_HANDOFF.md)通过module-private failed-open handoff与outer deduplicated finalization补齐。
