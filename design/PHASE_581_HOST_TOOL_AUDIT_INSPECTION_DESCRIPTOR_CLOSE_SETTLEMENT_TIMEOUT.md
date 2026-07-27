# Phase581：Host tool audit inspection descriptor close settlement timeout

## 背景

Phase580为maintenance-owned `Dir`和`FileHandle` close Promise增加5000ms settlement deadline，但read-only inspection明确保留原direct-close graph。当前inspection路径仍存在相同的永久pending风险：

- `inspectJsonlAuditRotationStagings(...)`父目录enumerator；
- `inspectJsonlAuditLockQuarantines(...)`父目录enumerator；
- `inspectJsonlAuditLockDisposals(...)`父目录enumerator；
- rotation staging和lock/quarantine/disposal descriptor-bound child scanners；
- active lock、rotation staging、quarantine、disposal与owner metadata inspection持有的pinned `FileHandle`；
- inspection-only directory/owner/empty opener在validation失败后的短生命周期handle。

这些路径没有maintenance context，也不调用Phase580 helper。任一returned close Promise永久pending时，read-only runtime API和对应CLI command都不会产生inspection、ERROR report或exit settlement。

Phase581 red probe在active lock inspection第一条child `Dir` stream上调用真实close后返回受控pending Promise。虚拟时间推进60秒后`inspectJsonlAuditFileLock(...)`仍未settle；测试主动resolve后才返回原inspection。这证明read-only graph需要独立timeout ownership。

## Inspection Settlement Contract

新增module-private inspection descriptor deadline：

```text
JSONL_AUDIT_INSPECTION_CLOSE_SETTLEMENT_TIMEOUT_MS = 5000
```

Inspection-owned resource遵守：

1. 每个close只调用一次；
2. 所有同一finalization set中的resources并发启动close与timer；
3. sync throw、async rejection和resolve保持原reason/settlement；
4. 5000ms event-loop timer deadline前未settle时形成固定safe timeout failure；
5. timeout不重试、不cancel、不推断kernel descriptor状态；
6. late resolve/reject由owned observer消费，不产生unhandled rejection或回写inspection；
7. 多resource finalizer等待一个deadline而不是resource count乘以deadline，并在返回前确保每个resource获得一次close invocation。

与Phase580相同，timer不是hard real-time guarantee；同步阻塞event loop时只能在重新获得调度后触发。

## Shared Internal Design

抽取module-private generic settlement race：

```text
resource.close()
  -> owned fulfilled/rejected observer
  -> race(operation-family timeout settlement)
```

Maintenance wrapper继续传入Phase580 constant和message；inspection wrapper传入Phase581 constant和固定message：

```text
audit inspection descriptor close timed out after 5000 ms
```

Inspection finalizer按resource object identity去重并`Promise.allSettled(...)`，返回module-private：

```text
closed boolean
first failure reason when closed=false
```

它不格式化或持久化raw reason。Caller继续使用既有inspection error mapper或CLI catch边界。

## Scanner Control Flow

父目录enumerators与descriptor-bound child scanners改为显式保存scan primary outcome，再执行non-throwing bounded finalization：

1. read成功、close成功：返回原scan result；
2. read成功、close reject/timeout：throw close failure；
3. read primary failure、close成功：throw read primary；
4. read primary failure、close reject/timeout：仍throw read primary；secondary close outcome只用于资源settlement，不覆盖更早的content/access failure。

Parent list runtime API仍以rejection表达close uncertainty；CLI继续映射ERROR并保留默认zero/empty details。Single-entry scanner failure继续进入`inspectionErrorCode: "inspection_failed"`、`layout: "unknown"`与authority withdrawal。

## Pinned Inspection Resources

Read-only inspection openers通过module-private bounded-inspection marker请求timeout语义：

- active lock root；
- quarantine root与nested lock；
- disposal root；
- owner metadata handle；
- empty-directory identity handle。

Successful pinned handles在inspection最终分支通过shared inspection finalizer关闭。Validation失败或state-change return前取得的short-lived handle也使用同一bounded closer。Acquisition、maintenance和mutation caller不携带marker，因此不改变其close contract。

多handle inspection finalizer不再逐个await direct close；全部handles并发close。任一failure/timeout设置既有`inspectionErrorCode`并撤销owner fingerprint、empty fingerprint、layout或其他positive authority，不新增lifecycle fields。

## Runtime与CLI Projection

Phase581不新增public字段。

- Parent rotation/quarantine/disposal list close timeout：runtime reject固定message，CLI返回`ok:false`/ERROR和既有default details。
- Active lock close timeout：`inspectionErrorCode: "inspection_failed"`，owner authority与fingerprint撤销。
- Rotation staging entry close timeout：layout固定`unknown`，recovery fingerprint/eligibility不形成。
- Quarantine/disposal entry close timeout：layout固定`unknown`，owner/empty fingerprint不形成。
- Stable inspection close：全部现有fields和status保持。

Timeout message/code不进入fingerprint、owner metadata、confirmation、transcript或persistent state。

## Covered Graph

- 三个parent namespace list enumerators。
- Rotation staging与lock directory bounded child scanners。
- Active lock、rotation staging、quarantine、disposal single-entry inspectors。
- Inspection owner metadata和empty-directory identity helpers。
- Inspection-mode failed-open/validation cleanup handles。
- 复用上述runtime API的targeted inspection与recovery-readiness CLI graph。

本阶段不修改：

- Phase576-580 maintenance contexts/finalizer projection；
- Phase559-562 mutating rotation recovery handle finalizer；
- cooperative lock acquisition/release；
- normal writer、rotation transaction与durability handles；
- mutation/cleanup/recovery transaction ordering。

## Tests

- Active lock child stream pending：deadline后inspection返回`inspection_failed`并撤销owner authority。
- Rotation staging child stream pending：deadline后entry为unknown/uncertain。
- Rotation/quarantine/disposal parent enumerator pending：runtime在deadline后reject固定timeout message。
- Parent read primary叠加pending close：read primary message保持。
- Multi-handle quarantine inspection中一个close pending：其他handles仍close一次，总等待一个deadline。
- Timeout后close Promise late rejection：无unhandled rejection，inspection不被改写。
- CLI human/JSON覆盖parent ERROR和single-entry uncertainty，不泄漏owner token或entry names。
- Compiled smoke验证dist runtime/CLI、timer guard、late rejection consumption与read-only filesystem non-mutation。

## 接口与安全边界

- Timeout只表示returned close Promise未按期settle，不证明descriptor open/closed。
- Read-only inspection在任何timeout下不得rename、unlink、rmdir、restore或写owner metadata。
- 不新增CLI flags、commands、exit code、human/JSON field names、environment variables或public runtime option。
- 不改变scan/result budgets、truncation、classification、fingerprint material、liveness或mutation authority。
- 不输出fd、raw resource、raw owner JSON、owner token或unbounded error object。
- 不修改JSON-RPC、agent event、provider、tool result、transcript、owner metadata或persistent schema。

## 验收标准

- 任一inspection-owned close Promise永久pending时，runtime/CLI必须在一个5000ms timer deadline后settle。
- 同一inspection finalization set中的全部resources必须各调用close一次并并发等待。
- Read primary failure不得被close timeout覆盖。
- Close timeout必须撤销positive inspection authority或使parent list明确ERROR。
- Late resolve/reject不得产生unhandled rejection、二次projection或filesystem mutation。
- Maintenance、rotation recovery、acquisition、writer与跨层contracts保持。
- Python、TypeScript、build、built integration和CLI smoke全部通过。
- Workspace及`/tmp`无probe、smoke、integration、audit lock或patch残留，无相关test/engine/CLI进程和FileHandle/Dir GC warning。

## 实现结果

- Red baseline已冻结：active lock inspection第一条child `Dir` stream调用真实close后返回受控pending Promise；虚拟时间推进60秒时原实现仍未settle，只有测试主动resolve后才继续。
- `jsonlAuditSink.ts`新增module-private inspection 5000ms constant，并把Phase580 maintenance wrapper与Phase581 inspection wrapper接到同一个owned-observer settlement race。Inspection resources按object identity去重、并发`Promise.allSettled(...)`，late resolve/reject只被observer消费。
- Rotation/quarantine/disposal三个parent enumerator、rotation staging与lock child scanner、active/rotation/quarantine/disposal/owner/empty pinned inspection handle及failed-open cleanup均已接入bounded close。Read primary优先于secondary close failure；mutation、maintenance、acquisition和writer caller保持原contract。
- Runtime新增5个deadline/primary/late-rejection/read-only测试，`test/audit.test.ts`共273项通过；CLI新增2个ERROR与uncertainty projection测试，`test/cliAudit.test.ts`共110项通过。
- Compiled smoke覆盖parent list timeout ERROR、targeted quarantine timeout uncertainty、authority withdrawal、late rejection consumption与filesystem non-mutation，并从`dist/`执行成功。
- 全量`tools/check.sh`通过：Python 422项；TypeScript 43个test files、897项；TypeScript build、built integration与CLI smoke全部成功。
- 静态接口校验通过：source/dist各仅有一个maintenance与inspection timeout constant及一个generic race helper；wrapper message/constant、parent primary-preserving close、inspection marker和scanner三分支均匹配设计；未新增CLI/protocol timeout option、field或environment variable。
- 残留审计完成：workspace无`.tmp`、`.bak`、`.orig`或`.rej`；核对21个`/tmp/god-code-audit-0-*`残留仅包含预期owner fixture、全部owner PID已退出后以`unlink`/`rmdir`清理；最终无Phase581、inspection timeout、smoke、integration或audit lock残留，也无check、Vitest、pytest、engine或CLI进程。
