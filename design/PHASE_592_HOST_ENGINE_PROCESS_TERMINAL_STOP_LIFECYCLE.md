# Phase592：Host engine process terminal stop lifecycle

## 背景

Phase590和Phase591已经让headless、RPC smoke与REPL caller通过primary-aware composite finalizer调用`GodCodeEngineProcess.stop()`，但engine process内部仍不是terminal lifecycle：

- `stop()`是`async` wrapper，concurrent caller得到不同Promise，并会重复shutdown、stdin end、wait、SIGKILL与peer close；
- post-settlement repeated stop返回新的resolved Promise，caller无法证明same-generation cleanup exactly-once；
- shutdown只依赖`JsonRpcPeer.request(..., 5000)`自身timeout，test double或替代peer若忽略timeout可永久pending；
- graceful exit等待超时后只调用`SIGKILL`，未等待forced exit，stop可在child仍存活时返回；
- old child的`exit` callback动态读取`this.peer`，若forced exit晚于restart，可能关闭或污染新generation peer/state；
- child/peer直到async teardown末尾才从engine state移除，stop期间新的RPC仍可能进入正在关闭的generation；
- peer close同步throw或late shutdown reject缺少owned terminal observation；
- stderr buffer和exit metadata没有显式generation reset边界。

Phase592把start/stop协调、child/peer ownership transfer、bounded shutdown与graceful/forced exit settlement收口到engine process generation。

## 范围

本阶段覆盖：

1. `GodCodeEngineProcess.start()`与`stop()`的generation settlement协调；
2. shutdown request的独立5000ms bounded observation；
3. stdin close、2000ms graceful exit、SIGKILL与2000ms forced-exit settlement；
4. generation-bound peer closer和child exit handler；
5. turn abort state的同步terminal transfer；
6. source tests、existing engine/REPL/headless/doctor/TUI回归与`dist/` compiled smoke。

本阶段不修改Python Engine shutdown protocol，不新增CLI warning/report，也不改变doctor/provider-health的best-effort policy。Provider-health统一cleanup只复用新的engine stop guarantee，若还需独立outer primary envelope则留给后续阶段。

## Generation Contract

每次成功spawn到对应stop/exit属于一个engine generation：

1. `startSettlement`只表示active start attempt；concurrent start共享同一Promise；
2. `stopSettlement`表示当前generation terminal stop；concurrent和post-settlement repeated stop共享同一Promise；
3. 下一次start同步claim旧stop marker，等待其成功settlement后才spawn新child；failed stop保持resource uncertainty并阻止静默restart；
4. stop在任何await前snapshot child、peer和generation-bound peer closer，并从public engine state清除child/peer、initialized flags与turn maps；
5. stop开始后initialize/create/submit/cancel等RPC立即观察“not started”，不能进入closing generation；
6. normal stop完成后restart重置stderr/exit generation state，旧generation late settlement不能关闭或改写新peer。

Public `start(): Promise<void>`与`stop(): Promise<void>`签名不变；same active lifecycle现在具有Promise identity。

## Shutdown与Process Exit Contract

Stop对captured generation按以下顺序执行：

1. captured peer未closed时发起shutdown request；
2. shutdown fulfilled、reject或5000ms timeout都继续cleanup，shutdown reason保持best-effort secondary；
3. best-effort结束captured child stdin，sync throw不能阻断exit settlement；
4. 等待child exit最多2000ms；
5. graceful timeout时至多一次发送`SIGKILL`；
6. 发送或已发送kill后继续等待exit最多2000ms；
7. forced exit仍未settle时返回固定resource-uncertainty error；
8. 无论process outcome如何，captured peer close都必须single-attempt并settle；
9. process/kill failure优先于peer-close secondary；shutdown与stdin secondary不传播。

固定forced-exit timeout reason为：

```text
GOD-code engine process did not exit after SIGKILL within 2000 ms.
```

Shutdown deadline只允许Host继续finalization，不证明Python process已退出；只有child exit observation或forced-exit timeout outcome决定process settlement。

## Generation-bound Exit与Peer Close

Start为每个child捕获独立stderr buffer、peer和memoized peer closer。Child exit callback：

- 只关闭captured peer，不读取可能已指向新generation的`this.peer`；
- peer close同步throw/reject转换为owned settlement，不能形成EventEmitter throw或unhandled rejection；
- 记录captured generation exit info并撤销initialized flags；
- emit既有`exit` event，不新增payload字段；
- stop随后复用同一peer-close settlement，不重复调用close。

Stop在forced exit timeout后仍关闭captured peer，并保留rejected terminal stop marker，使restart不能跨过未证明已退出的child。Late child exit最多完成旧generation本地closer/exit event，不得作用于新generation；正常public start因failed marker不会创建新generation。

## Turn State Transfer

Stop在async shutdown前：

- 将`initialized`与`initializing`设为false；
- abort全部turn controllers；
- 清空controller、in-flight、finished、finalized与sequence maps；
- 清除public child/peer ownership。

后续late tool result、cancel notification或turn event只能通过已关闭captured peer终止，不能重新建立turn state。Tool executor本身保持可跨normal restart复用。

## Tests

- Concurrent与post-settlement repeated stop返回同一Promise，shutdown/stdin/peer close各single-attempt，state在pending shutdown前已转移；
- Permanent shutdown Promise在5000ms后继续stdin与exit cleanup，late rejection被消费且无unhandled rejection；
- Graceful exit timeout后SIGKILL single-attempt，stop在forced child exit前保持pending；
- SIGKILL后仍无exit时，2000ms后以固定reason reject，peer仍close，restart观察同一resource uncertainty且不spawn；
- Child exit与stop竞争时generation-bound peer close single-attempt，old callback不读取replacement peer；
- Normal stop后restart创建第二generation，stderr/exit state重置，start/stop Promise marker独立；
- Existing initialize/session/turn/cancel/REPL/headless/doctor/TUI tests全部回归；
- Compiled smoke从`dist/ipc/godCodeEngineProcess.js`验证stop identity、shutdown deadline、SIGKILL exit wait、forced timeout restart gate与late settlement observation。

## 接口与安全边界

- `GodCodeEngineProcess` constructor/options/start/setToolExecutor/onGodCodeEvent/initialize/createSession/submitTurn/cancelTurn/shutdown/stop/getLastExitInfo签名保持；
- Lifecycle markers、generation closer、deadline constants、fixed local timeout reason和helpers均module-private；
- 不新增environment variable、config、CLI flag、command、exit code、warning、report、event或protocol field；
- 不修改JSON-RPC shutdown/cancel、Engine event、provider、tool result、transcript、audit、plugin、MCP或persistent schema；
- Promise、timer、child/peer object、kill result、stderr、cleanup reason、path、command、token、transport和process handle不得进入CLI、wire、audit、transcript或日志。

## 验收标准

- Same-generation start/stop与peer close exactly-once，concurrent caller共享Promise；
- Stop在async teardown前撤销closing generation RPC与turn authority；
- Pending/rejected shutdown不阻断bounded graceful/forced process cleanup或产生unhandled rejection；
- SIGKILL后stop等待exit，forced timeout保留resource uncertainty并阻止restart；
- Old exit callback只能关闭captured peer，不能影响新generation；
- Normal restart建立独立generation并重置generation-local diagnostics；
- Public TS、CLI、environment、protocol与persistent interfaces保持；
- Python、TypeScript、build、built integration和CLI smoke全部通过；
- Workspace与`/tmp`无engine、probe、smoke、integration、audit、plugin、MCP或patch残留。

## 实现结果

- 实现前`test/godCodeEngineProcessLifecycle.test.ts`红测基线为6/6失败，分别证明start/stop Promise identity缺失、shutdown test double可永久阻塞、SIGKILL后stop提前settle、forced timeout/restart gate缺失以及old exit callback动态关闭replacement peer。
- `start()`与`stop()`改为直接返回memoized lifecycle Promise。下一次start claim旧stop marker并等待成功；stop failure保存原reason，后续start不spawn。Normal restart创建新的start/stop marker并重置exit diagnostics。
- Stop在async shutdown前snapshot child、peer与peer closer，并同步撤销class fields、initialized flags和全部turn maps。Captured shutdown另加5000ms settlement observer；late reject被owned outcome消费。
- Child stdin best-effort结束后先等待2000ms graceful exit，超时至多一次SIGKILL并再等待2000ms。Forced timeout返回固定local reason，process failure优先于peer-close secondary；signal终止同时检查`signalCode`，不再把已退出child误判为running。
- 每个start generation建立captured stderr buffer和memoized peer closer。Exit callback只关闭captured peer；stop复用同一close settlement，sync throw/reject single-attempt传播且不能被old callback重定向到replacement peer。
- 新增7项生命周期测试，覆盖pending shutdown state transfer、late rejection、SIGKILL exit wait、forced timeout/failed restart、peer-close priority、generation-bound exit peer和真实normal restart；34项existing engine tests与相关headless/REPL/doctor/TUI回归通过。
- CLI smoke新增`built engine process terminal stop lifecycle`，从`dist/ipc/godCodeEngineProcess.js`验证stop identity、shutdown deadline、SIGKILL pending-until-exit、forced timeout/restart gate、late rejection observation及真实start-stop-restart generation。
- Public constructor/options/start/setToolExecutor/onGodCodeEvent/initialize/createSession/submitTurn/cancelTurn/shutdown/stop/getLastExitInfo签名、environment、CLI、protocol和persistent schema均未改变。
- Source/dist静态检查确认各有start/stop markers、failed-stop restart gate、generation peer closer、5000/2000/2000ms deadline链和fixed forced-exit reason；old dynamic `this.peer?.close(...)`与SIGKILL后immediate return路径已删除。
- 首轮全量门禁仅暴露existing `tuiCommandReducer.test.ts`两个独立initial state读取系统时间造成的1ms timestamp差异；测试现改为共享固定`now` callback，不修改reducer或production语义。定向TUI与engine回归45项通过。
- 最终权威`tools/check.sh`通过：Python 422项；TypeScript 47个test files、954项；TypeScript build、built integration与完整CLI smoke全部成功。
- 两轮门禁共发现12个audit test lock/quarantine fixture，owner PID `966782`、`968015`、`973043`与`973948`均已退出；随后按exact `/tmp/god-code-audit-0-*`前缀删除。最终`/tmp`无GOD-code/Vitest residue，workspace无`.tmp`、`.bak`、`.orig`、`.rej`或`.patch`，也无check、integration、smoke、Vitest、pytest、MCP fixture、engine或CLI进程。

## Phase593 后续衔接

Phase593已把doctor与provider-health的engine cleanup接入显式outer primary-aware finalizer。两条路径先形成唯一operation diagnostic，再all-settled provider waiter cleanup与Phase592 stop；operation error保持，successful diagnostic叠加cleanup failure时使用fixed sanitized message降级。Doctor JSON/human schema与Phase592 engine接口不变。
