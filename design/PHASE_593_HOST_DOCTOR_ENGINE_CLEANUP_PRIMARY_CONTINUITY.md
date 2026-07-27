# Phase593：Host doctor engine cleanup primary continuity

## 背景

Phase592已让`GodCodeEngineProcess.stop()`具备bounded terminal settlement，但doctor的两个engine调用方仍缺少outer primary-aware边界：

- `checkPythonEngine()`在initialize成功后立即写入`ok` check，随后无条件吞掉stop failure，可能把cleanup uncertainty报告为健康；
- initialize/start primary与stop secondary虽然当前偶然由`catch(() => undefined)`隔离，但没有显式check ownership contract；
- `checkProviderHealth()`同样先写入turn outcome，再吞掉stop failure；successful health turn叠加forced-exit timeout仍报告`ok`；
- provider-health waiter cleanup在engine stop前串行执行，若timer/listener cleanup同步throw，会阻断Phase592 stop；
- waiter可能在event/timeout路径已cleanup后被finally重复调用，没有显式single-attempt ownership；
- raw cleanup reason若直接并入doctor message，可能把stderr、path、command或process detail带入human/JSON report。

Phase593把python-engine check与provider-health check改为operation diagnostic加all-settled finalization，再以固定、非敏感cleanup projection提交唯一check。

## 范围

本阶段覆盖：

1. `checkPythonEngine()` operation/check ownership与engine stop finalization；
2. `checkProviderHealth()` waiter cleanup和engine stop composite finalization；
3. provider-health waiter cleanup idempotence；
4. operation primary、successful-operation cleanup failure与report projection priority；
5. source tests、doctor CLI回归与`dist/` compiled smoke。

本阶段不修改provider health timeout值、provider config判断、host tool catalog check、Phase589 prepared-host close policy或doctor command/options/schema。`checkHostTools()`的host-close report consistency若需进一步收口，留给独立后续阶段。

## Operation Diagnostic Contract

每条engine check先在局部变量中形成一个且仅一个operation diagnostic，不立即写入共享`checks`：

- start/initialize或provider-health setup/submit/wait失败形成原有`error` message；
- provider health non-success turn保留原有turn status/error message；
- successful initialize或successful health turn形成候选`ok` diagnostic；
- operation diagnostic一旦形成，cleanup secondary不能替换其原始error message。

Finalization完成后才把最终diagnostic push到`checks`，因此每个check name保持single-entry，不出现先`ok`后`error`的重复投影。

## Composite Finalization Contract

Module-private doctor engine finalizer接收engine与optional waiter cleanup：

1. waiter cleanup通过owned Promise wrapper调用，捕获sync throw与reject；
2. engine stop通过独立owned Promise wrapper调用；
3. 两项在同一all-settled join中启动，一个failure不能阻断另一项；
4. waiter cleanup invocation先同步撤销timer/listeners，再启动stop，避免stop exit event投递到已结束waiter；
5. finalizer只返回`ok/failed`状态，不返回或格式化raw reason；
6. operation diagnostic为error时，任何cleanup failure都只被消费；
7. operation diagnostic为ok且任一cleanup失败时，转换为固定cleanup error projection。

Fixed cleanup projections：

```text
initialized but engine cleanup failed
<provider>: health check cleanup failed
```

Raw stop/listener error、stderr、signal、PID、path、command、token或process object不得进入doctor report。

## Provider-health Waiter Contract

`waitForTurnFinished()`返回的cleanup变为idempotent single-attempt function：

- 第一次调用清除timer并detach`god_code_event`与`exit` listener；
- event success、engine exit、timeout与outer finally竞争时只有首次调用执行mutation；
- repeated cleanup直接返回；
- cleanup state在listener removal前标记完成，reentrant callback不能重复detach；
- cleanup throw仍由outer finalizer捕获，不能阻断engine stop。

Turn correlation、timeout数值、result payload和existing error messages保持。

## Tests

- Python initialize success叠加engine stop reject时只输出一个`python_engine:error`，使用固定cleanup message且不泄漏secondary；
- Python initialize primary叠加stop reject时保持原primary check message；
- Sync stop throw被owned wrapper捕获并形成fixed cleanup projection；
- Provider health success叠加第二个engine stop failure时只输出一个fixed provider cleanup error；
- Provider submit primary叠加waiter cleanup throw和engine stop failure时保持submit primary，且engine stop仍被调用；
- Waiter event/timeout/finally repeated cleanup只detach一次，不产生late listener mutation；
- Existing doctor human/JSON、provider config、audit skip、fake health与unsupported provider tests全部回归；
- Compiled smoke从`dist/cli/doctor.js`验证python/provider primary continuity、successful cleanup downgrade、cleanup throw isolation与no raw reason projection。

## 接口与安全边界

- `runGodCodeDoctor()`、`renderDoctorReport()`、`renderDoctorReportJson()`、`DoctorCheck`、`DoctorReport`和`RunDoctorOptions`签名保持；
- Finalizer outcome、owned invocation wrapper、fixed cleanup strings与waiter cleanup marker均module-private；
- 不新增environment variable、CLI flag、command、exit code、check name、status、JSON key、warning或protocol field；
- 不修改JSON-RPC、Engine event、provider、tool result、transcript、audit、plugin、MCP或persistent schema；
- Cleanup reason、Promise、timer、listener、engine/child/peer object、stderr、signal、PID、path、command、token和transport不得进入human/JSON report或日志。

## 验收标准

- Python-engine与provider-health各提交唯一operation-owned check；
- Operation error primary跨waiter/engine cleanup failure保持；
- Successful operation的cleanup uncertainty通过fixed error投影可见；
- Waiter cleanup failure不阻断Phase592 stop，repeated cleanup single-attempt；
- Raw cleanup reason不进入doctor human/JSON输出；
- Public TS、CLI、environment、protocol与persistent interfaces保持；
- Python、TypeScript、build、built integration和CLI smoke全部通过；
- Workspace与`/tmp`无doctor、engine、probe、smoke、integration、audit、plugin、MCP或patch残留。

## 实现结果

- 实现前`test/doctorLifecycle.test.ts`红测基线为4失败/1通过：existing operation error已偶然保持，但successful python/provider checks吞掉stop failure，sync stop throw向外逃逸，waiter cleanup throw阻断engine stop。
- `checkPythonEngine()`与`checkProviderHealth()`现在先形成唯一局部diagnostic，finalization后只push一次。Operation error message保持；候选ok叠加cleanup failure时分别使用`initialized but engine cleanup failed`与`<provider>: health check cleanup failed`。
- 新增module-private `finalizeDoctorEngine()`与owned invocation wrapper。Optional waiter cleanup先同步启动，engine stop随后独立启动，两项通过all-settled汇合；sync throw/reject均被消费，raw reason不进入report。
- Provider-health waiter cleanup改为memoized Promise。Timer、`god_code_event` listener和`exit` listener分别进入owned settlement；event/timeout/finally repeated cleanup复用同一Promise，任一detach failure不阻断其余detach或engine stop。
- 新增5项doctor lifecycle测试，覆盖python cleanup downgrade、python primary、sync stop throw、provider success cleanup downgrade/single detach，以及provider submit primary跨waiter+engine cleanup failure；existing doctor/engine/provider相关回归112项通过。
- CLI smoke新增`built doctor engine cleanup primary continuity`，从`dist/cli/doctor.js`验证python/provider fixed cleanup projection、operation primary、waiter throw isolation、stop invocation与secret/raw secondary不泄漏。
- Public doctor types/functions/options、check names/status/keys、environment、CLI、protocol和persistent schema均未改变；`checkHostTools()` prepared-host close report consistency明确留给后续阶段。
- 2026-07-26统一`tools/check.sh`验收通过：Python 422项、TypeScript 48个文件/959项、TypeScript build、built integration与CLI smoke全部成功；source/dist静态核对确认新finalizer marker一致，旧best-effort stop与direct cleanup路径不存在。
- 验收后确认测试owner PID已退出，并清理6个精确`/tmp/god-code-audit-0-*`夹具；无GOD-code、Python Engine、integration或CLI smoke遗留进程，workspace与`/tmp`残留核对通过。

## Phase594 已完成衔接

Phase594已收口doctor `checkHostTools()`的prepared-host close report ownership。Tool catalog setup/read先形成single local diagnostic，已取得host时再观察Phase589 close；operation primary保持，successful count叠加cleanup failure时使用fixed sanitized projection，最终只提交一个`tool_catalog` check。Phase593 engine finalizer与doctor public schema保持不变。
