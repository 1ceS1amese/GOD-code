# Phase590：Host headless composite finalization continuity

## 背景

Phase589保证单个`PreparedGodCodeHost`能够回滚setup failure并通过terminal Promise并发关闭MCP/plugin runtime，但headless caller仍按串行`finally`清理：

```text
renderer.finish()
  -> await host.close()
  -> await engine.stop()
```

`runGodCodeRpcSmoke()`同样先等待host，再停止engine。该组合存在独立的outer lifecycle缺口：

- renderer同步throw会阻断host close和engine stop；
- host close reject或等待会阻断engine stop开始；
- engine stop failure会覆盖turn/start/initialize/create/submit或engine-exit primary；
- cleanup reason在primary存在时可能替换真正的运行错误；
- `exit` listener只依赖`once`自动触发，未在normal finalization前主动detach；
- 成功operation后的cleanup failure传播顺序没有显式contract。

Phase590只修复headless run和RPC smoke的composite finalizer，不修改Phase589 host内部close，也不修改engine stop内部实现。

## 范围

本阶段覆盖：

1. `runGodCodeTurn()`使用的renderer、prepared host与engine composite finalization；
2. `runGodCodeRpcSmoke()`使用的prepared host与engine composite finalization；
3. event listener detach、primary continuity、cleanup failure priority；
4. source tests和`dist/` compiled smoke。

以下边界留待后续阶段：

- `GodCodeReplSession.start()/cleanup()/stop()`与`runGodCodeRepl()`；
- doctor/provider-health的best-effort engine cleanup；
- `GodCodeEngineProcess.stop()`的concurrent/repeated lifecycle、shutdown deadline、SIGKILL后exit settlement与peer close；
- 新的public warning、cleanup report或CLI field。

## Composite Finalization Contract

Headless operation在进入engine setup前建立`operationFailed`标志。所有run/start/initialize/create/submit/final-result rejection都标记为primary。

`finally`阶段遵守：

1. 先detach `god_code_event`和`exit` listeners，阻止cleanup期间继续投递到已结束的turn waiter；
2. renderer finish、host close和engine stop各通过独立owned Promise wrapper调用，捕获同步throw与异步reject；
3. 三项调用在同一`Promise.allSettled(...)` fan-out中启动，一个resource不能阻断其他resource开始；
4. engine stop invocation会在host runtime close的nested microtasks前开始，使active engine turn cancellation先进入其existing stop path；
5. 等待全部settlement后再结束outer lifecycle；
6. operation已有primary时，cleanup failure全部被消费，原primary对象重新传播；
7. operation成功但cleanup失败时，继续传播第一个cleanup reason，保持既有“成功结果要求cleanup成功”的外部行为；
8. 多个cleanup同时失败时，确定性priority保持现有逻辑顺序：renderer、host、engine；RPC smoke为host、engine；
9. Cleanup reason不拼接、不聚合、不替换primary，也不新增warning surface。

Phase589 host close通常best-effort resolve，但outer wrapper仍防御未来实现或test double的同步throw/reject。Engine stop的内部settlement仍由现有`GodCodeEngineProcess`负责。

## Listener与State边界

- `god_code_event` listener与`exit` listener都在resource finalization前显式detach；
- Listener detach是同步、幂等的EventEmitter operation，不改变wire event或sequence contract；
- `renderer.finish()`仍恰好位于turn lifecycle末尾；其failure不阻止host/engine cleanup；
- `finalResult`、expected turn identity和tool executor接口不变；
- Host registry在engine stop与host close fan-out前不重新绑定或清空。

## Tests

- Engine start primary叠加pending plugin close与engine stop reject时，engine stop必须在plugin gate释放前开始，最终仍返回原start error；
- 同一probe验证renderer finish、host close和engine stop各single-attempt，cleanup reason不进入primary；
- Synthetic successful turn叠加renderer finish与engine stop failure时，host close和engine stop均执行，最终cleanup priority仍为renderer reason；
- RPC smoke initialize/create primary叠加cleanup failure时，原primary保持且所有resource被finalize；
- Existing transcript、REPL、MCP/plugin、engine process、CLI与audit tests全部回归；
- Compiled smoke从`dist/headless/godCodeRunSession.js`注入prototype probes，验证fan-out、primary preservation、listener detach和successful-operation cleanup priority。

## 接口与安全边界

- `runGodCodeSession()`、resume/recover、`runGodCodeRpcSmoke()`及options/result signatures保持；
- Composite helper、outcome type和primary flag均module-private；
- 不新增environment variable、config、CLI flag、command、exit code、warning、report或protocol field；
- 不修改JSON-RPC、engine event、provider、tool result、transcript、audit、plugin manifest、MCP payload或persistent schema；
- Cleanup reason不得泄漏MCP/plugin配置、path、command、token、transport、process handle、prompt或transcript content。

## 验收标准

- Renderer、host或engine任一cleanup throw/reject都不能阻断其他resource finalization；
- Operation primary跨任意cleanup failure保持原对象；
- Operation成功时cleanup failure仍按renderer/host/engine确定性priority传播；
- Headless event listeners在cleanup前全部detach；
- Phase589 host terminal lifecycle与engine stop public behavior保持；
- Python、TypeScript、build、built integration和CLI smoke全部通过；
- Source/dist接口一致，workspace与`/tmp`无probe、plugin、MCP、engine、smoke、integration或patch残留。

## Red Baseline

- `test/godCodeRunSessionLifecycle.test.ts`新增3项composite finalizer probe，旧实现3项全部失败。
- Run start primary叠加pending plugin close时，engine stop在500ms内未开始，证明serial host await阻断engine cleanup。
- Synthetic successful turn的renderer failure直接截断finally，plugin close与engine stop调用均为0。
- RPC initialize primary被后续engine stop secondary替换，证明outer finally缺少primary-preserving boundary。

## 实现结果

- `godCodeRunSession.ts`新增module-private `finalizeGodCodeHeadlessResources(...)`和owned invocation wrapper。Engine stop、prepared-host close与可选renderer finish分别形成Promise并通过`Promise.allSettled(...)`汇合；settlement结果仍按renderer、host、engine logical priority选择。
- `runGodCodeTurn()`与`runGodCodeRpcSmoke()`新增`operationFailed` primary envelope。Run/start/initialize/create/submit/final-result或RPC primary存在时，cleanup reason全部消费并重新throw原对象；operation成功时首个cleanup failure继续传播，不把成功结果伪装为完整settlement。
- Headless turn在fan-out前同时detach `god_code_event`与`exit` listeners。Tool executor、expected turn identity、renderer interface、Phase589 terminal host close和existing engine stop实现均未改变。
- 新增`test/godCodeRunSessionLifecycle.test.ts` 3项probe，验证pending plugin cleanup下engine stop并发开始与start primary保持、synthetic success下renderer cleanup priority且所有resource执行、RPC initialize primary跨host/engine cleanup保持；3项全部通过。Engine、MCP、transcript、REPL、doctor和Host相关回归共122项通过。
- Compiled smoke从`dist/headless/godCodeRunSession.js`注入built engine/plugin prototype probes。它验证pending plugin gate释放前engine stop已开始、run仍等待完整settlement、start primary保持、successful synthetic turn的renderer priority，以及两个listeners归零；完整CLI smoke通过。
- 全量`tools/check.sh`通过：Python 422项；TypeScript 45个test files、940项；TypeScript build、built integration与完整CLI smoke全部成功。
- Source/dist静态验证确认各有一个composite finalizer、一个owned invocation wrapper、两个operation-primary envelopes和显式exit-listener detach；old direct serial `renderer.finish -> await host.close -> await engine.stop`路径已删除。Public run/resume/recover/RPC smoke signatures、options/results、environment、CLI、protocol和persistent schema未变化。
- README、项目计划、内部设计、架构、扩展点、安全、protocol、Phase6与Phase589衔接文档已同步到Phase590。
- 残留审计发现6个audit test lock/quarantine fixture；owner PID `868288`与`869537`均已退出，随后删除exact test prefix。最终`/tmp`无audit、Phase590 headless、plugin、MCP、smoke或integration残留；workspace无`.tmp`、`.bak`、`.orig`或`.rej`，也无check、Vitest、pytest、MCP fixture、engine或CLI进程。

## Phase591 后续衔接

Phase591已把相同的primary-aware composite finalization扩展到`GodCodeReplSession.start()/stop()`的module-private cleanup lifecycle和`runGodCodeRepl()`。Active start、terminal stop与cleanup outcome分别memoize；stop不等待captured cancel，先转移active-turn ownership，再并发finalize renderer、Phase589 host和engine。Normal stop后的restart建立新generation，start/submit/engine-exit/outer-run primary保持；当时保留的`GodCodeEngineProcess.stop()`内部SIGKILL/peer lifecycle已由Phase592闭合。

## Phase592 后续衔接

Phase592使Phase590 composite finalizer调用的engine stop本身具备memoized terminal settlement。Headless operation仍按renderer、host、engine priority处理cleanup reason，但engine resource不再因concurrent stop重复shutdown，也不会在SIGKILL后未观察exit时提前返回。Public headless接口与cross-layer schema不变。

## Phase593 后续衔接

Phase593已把本阶段当时保留的doctor/provider-health best-effort engine cleanup接入operation-owned outer finalizer。Doctor check primary跨Phase592 stop failure保持；successful check叠加cleanup uncertainty时通过fixed sanitized message降级。Headless finalizer本身与public run接口不变。
