# Phase591：Host REPL composite cleanup lifecycle

## 背景

Phase590已经为one-shot headless run和RPC smoke建立primary-aware composite finalizer，但`GodCodeReplSession`是可重复turn、可stop后restart的长生命周期对象，当前仍存在更复杂的状态缺口：

- concurrent `start()`都能看到`started === false`，会重复prepare host、重复注册listeners并竞争engine initialize；
- concurrent/repeated `stop()`会重复cancel、renderer finish、host close和engine stop；
- `cleanup()`先执行renderer，再串行等待host和engine，一个secondary failure会阻断其余resource及最终state reset；
- start primary可能被renderer/host/engine cleanup reason覆盖；
- active turn在cleanup中被直接丢弃，若engine未及时发出`turn_finished`或`exit`，`submit()`及outer `pendingTurns`可永久pending；
- stop在等待`cancel_turn`时可被30秒RPC或test double永久阻断，无法进入engine stop；
- `runGodCodeRepl()`先await stop再等待pending actions，stop failure会阻断pending settlement并覆盖start/readline primary；
- rejected pending action使用裸`finally(...)`清除Set时会创建无人观察的rejected derivative Promise。

Phase591按REPL session generation建立memoized start、stop和resource cleanup lifecycle，并把active turn与outer runner纳入同一primary-preserving边界。

## Session Generation Contract

每次成功start到下一次stop属于一个resource generation：

1. `startSettlement`只表示当前active start attempt；concurrent caller返回同一Promise，不重复prepare、listen或initialize；
2. `stopSettlement`表示当前generation的terminal stop；concurrent和post-settlement repeated caller复用同一Promise；
3. `cleanupSettlement`保存该generation的renderer/host/engine all-settled outcome，start failure、explicit stop和engine-exit后recovery都复用；
4. 正常stop完成后，下一次start等待旧stop/cleanup并清除terminal markers，再创建新host/engine generation；
5. Cleanup失败时start不自动越过resource uncertainty；caller先观察原cleanup reason，避免在未证明engine已停止时静默重用；
6. Start attempt自身settle后清除active start marker，使失败后可以按上述cleanup gate显式重试。

Public `start(): Promise<void>`和`stop(): Promise<void>`签名不变，但同一active lifecycle现在具有Promise identity。

## Start Primary Continuity

Host preparation、tool executor binding、listener registration、engine start/initialize/create session全部位于start primary envelope内。

任一步骤失败时：

- 立即进入memoized resource cleanup；
- renderer finish、host close与engine stop全部被调用并all-settled；
- cleanup同步throw或reject不覆盖、不拼接start primary；
- listeners和mutable session state在async cleanup前撤销；
- start primary以原对象传播。

## Stop与Active Turn Contract

Stop开始时若active turn已有`turnId`，Host对captured identity发起best-effort `cancel_turn`，但不等待其settlement。Returned Promise附加owned rejection observer；late cancel不能阻断cleanup、触发unhandled rejection或作用于新generation state。

Resource cleanup同步执行state transfer：

1. detach engine event/exit listeners；
2. snapshot并清除host与active turn；
3. 设置`status: stopped`与`started: false`；
4. active turn以固定local error reject，确保`submit()`和outer pending action可settle；
5. engine stop、captured host close和renderer finish独立fan-out；
6. 按renderer、host、engine logical priority选择第一个cleanup failure；
7. 同一generation每个resource最多finalize一次。

固定active-turn stop reason为：

```text
GOD-code REPL session stopped during an active turn.
```

`submit()`只允许清理由自己创建的active-turn object。若cleanup或engine exit已转移ownership，submit catch不得再次finish renderer或改变新generation state。

## Turn Renderer与Engine Exit

- `clearActiveTurn(expected)`先比较object identity，再清除state，最后finish renderer；renderer throw不能把session留在`running`；
- submit RPC primary叠加renderer finish failure时保持submit primary；
- `turn_finished`上的renderer failure作为该turn completion failure返回，而不是在EventEmitter回调中形成未关联throw；
- engine exit先把session标为stopped并转移active turn，再以engine-exit error reject；renderer secondary只被消费；
- host仍由后续stop或restart前cleanup finalization，不在event callback中执行async teardown。

## Outer REPL Runner Contract

`runGodCodeRepl()`记录operation primary，并在finally中：

1. best-effort关闭readline，停止新line/SIGINT admission；
2. 同时启动memoized session stop与captured pending-action all-settled等待；
3. stop failure不能阻断pending action settlement；
4. start/readline primary存在时保持原对象；无primary时传播session stop failure；
5. pending Set通过`then(success, failure)`观察并删除，不创建unhandled derivative rejection。

Pending action仍使用其现有RPC/engine settlement contract；本阶段不增加第二套action timeout。

## Tests

- Start primary叠加pending plugin close与engine stop reject时，engine stop在plugin gate前开始，start primary保持且listeners/state已清理；
- Concurrent start共享Promise且engine start/initialize/create各single-attempt；normal stop后restart创建第二generation；
- Active pending submit叠加permanent cancel Promise时，stop不等待cancel，submit以固定reason reject，renderer/host/engine各single-attempt；
- Concurrent与post-settlement repeated stop共享同一Promise；late cancel reject无unhandled rejection；
- Successful turn renderer failure不会保留active turn或`running`状态；submit RPC primary不被renderer secondary覆盖；
- `runGodCodeRepl()` start primary叠加renderer/engine stop failure时保持primary，并关闭readline、finalize host/engine；
- Existing REPL、TUI live session、transcript、approval、MCP/plugin和headless tests全部回归；
- Compiled smoke从`dist/cli/repl.js`验证start primary、active-turn stop、promise memoization、restart和late cancellation observation。

## 接口与安全边界

- `GodCodeReplSession` constructor、options、status、start/submit/cancel/stop/listTools/getSessionId及`runGodCodeRepl()`签名保持；
- Lifecycle fields、cleanup outcome、fixed local stop error和helpers均module-private；
- 不新增environment variable、config、CLI flag、command、exit code、warning、report或protocol field；
- 不修改JSON-RPC cancel/shutdown、engine event、provider、tool result、transcript、audit、plugin manifest、MCP payload或persistent schema；
- Cleanup/cancel reason、Promise、host/engine/renderer object、prompt、path、token、transport和process handle不得进入CLI输出、wire、audit或日志。

## 验收标准

- Same-generation start/stop/resource cleanup exactly-once且concurrent caller共享Promise；
- Active turn在stop时必定settle，不再因listener detach形成永久pending；
- Cancel pending/reject不阻断resource cleanup或产生unhandled rejection；
- Start/submit/outer-run primary跨secondary cleanup保持；
- Normal stop后的restart创建独立generation，旧late settlement不能改变新state；
- Renderer、host或engine任一cleanup failure不能阻断其他resource；
- Public TS、CLI、environment、protocol与persistent interfaces保持；
- Python、TypeScript、build、built integration和CLI smoke全部通过；
- Workspace与`/tmp`无probe、plugin、MCP、engine、smoke、integration或patch残留。

## 实现结果

- 实现前红测基线为`test/replLifecycle.test.ts` 5/5失败，分别证明engine stop被pending plugin close串行阻断、start/stop Promise identity缺失、submit primary被renderer secondary覆盖以及outer start primary被cleanup覆盖。
- `GodCodeReplSession.start()`与`stop()`改为直接返回memoized lifecycle Promise；active start caller共享identity，terminal stop在下一次start前对concurrent和post-settlement caller保持identity。Normal stop后的start先观察旧stop/cleanup outcome，再清除terminal marker并创建新generation；failed cleanup保持uncertainty gate。
- Start setup现在覆盖prepared host、tool executor、listeners和engine start/initialize/create全链路。Failure进入同一cleanup settlement，renderer、host和engine同步fan-out并all-settled，原start primary保持。
- Stop capture已有turn ID并best-effort调用cancel，但不等待其settlement；cleanup在async close前detach listeners、清除host/active turn、设置stopped，并以固定local reason结束pending submit。Late cancel rejection由owned observer消费，不能作用于restart generation。
- Active turn按object identity清理。Submit RPC primary跨renderer failure保持；`turn_finished`上的renderer failure作为该turn rejection返回且state已回到idle；engine exit先转移turn ownership并保持exit primary，host留给后续stop或restart cleanup。
- `runGodCodeRepl()`记录operation primary，finally best-effort关闭readline，并发启动session stop与captured pending-action settlement；stop secondary不覆盖start/readline primary。Pending Set改用双分支`then`删除，避免裸`finally`创建unhandled rejected derivative Promise。
- 新增`test/replLifecycle.test.ts` 7项，覆盖start cleanup并发/primary、start-stop memoization/restart、pending cancel active stop、submit primary、turn-finished renderer failure、engine exit primary和outer runner primary；定向REPL与transcript回归60项通过。
- CLI smoke新增`built REPL composite cleanup lifecycle`，从`dist/cli/repl.js`验证start primary、start/stop Promise identity、active-turn fixed reason、pending cancel非阻塞、normal restart、late rejection observation和generation exactly-once；完整CLI smoke通过。
- Public constructor/options/status/start/submit/cancel/stop/listTools/getSessionId与`runGodCodeRepl()`签名、environment、CLI、protocol和persistent schema均未改变。
- Source/dist静态检查确认各有generation start/stop/cleanup markers、fixed active-turn stop reason、owned finalizer wrapper和双分支pending observer；old裸`pending.finally(...)`与serial renderer/host/engine cleanup均已删除。
- 权威`tools/check.sh`通过：Python 422项；TypeScript 46个test files、947项；TypeScript build、built integration与完整CLI smoke全部成功。
- 全量门禁后发现6个audit test lock/quarantine fixture，owner PID `917353`与`918608`均已退出；随后按exact `/tmp/god-code-audit-0-*`前缀删除。最终`/tmp`无GOD-code/Vitest residue，workspace无`.tmp`、`.bak`、`.orig`、`.rej`或`.patch`，也无check、integration、smoke、Vitest、pytest、MCP fixture、engine或CLI进程。

## Phase592 后续衔接

Phase592已收口`GodCodeEngineProcess.stop()`自身的concurrent/repeated lifecycle。REPL generation cleanup调用engine stop时现在获得memoized terminal Promise；shutdown deadline、stdin close、SIGKILL后的exit settlement、peer close与child/peer state transfer均在engine内部完成，forced timeout保持resource uncertainty并阻止restart。REPL primary-aware composite policy与public接口不变；当时保留的doctor/provider-health best-effort outer cleanup已由Phase593统一。
