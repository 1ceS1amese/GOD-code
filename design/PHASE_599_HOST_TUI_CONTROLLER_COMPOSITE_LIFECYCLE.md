# Phase599：Host TUI controller composite lifecycle

## 背景

Phase598闭合terminal approval与PTY smoke的两个局部同步finalizer后，final lifecycle static audit继续检查Host active call graph。Audit、MCP runtime、prepared host、headless run、REPL、engine process、doctor、tools、plugin/MCP diagnostics和Phase598局部finalizer都已有primary-aware boundary；`TuiController`仍保留一条尚未分类的复合生命周期：

- `start()`在screen start、history load、live session start或first render失败时没有owned rollback；
- `startLiveSession()`在session start失败后不调用candidate stop；
- `stop()`未memoize，raw-mode reset或render throw会阻断session/screen cleanup；
- `sessions.map((session) => session.stop())`会在同步throw时阻断后续session进入`Promise.allSettled`；
- screen stop可覆盖已形成的operation result或其他cleanup evidence；
- `run()`没有outer `try/finally`，input setup/handler failure会泄漏screen、raw mode和sessions；
- pending action使用裸`finally(...)`删除Set，rejected action会生成无人观察的rejected derivative Promise；
- line/key input listeners与readline close没有single-attempt run-owned finalization；
- inactive multi-session close按顺序await，首个failure会阻断后续session stop。

这些路径都位于live `god-code tui`调用链，不是dead helper或测试专用代码。

Static audit同时确认两个后续独立边界：transcript watch的`FSWatcher.close()`/pending observer，以及local provider process log descriptor close。它们分别保留给Phase600和Phase601，不与TUI generation state混合实现。

## 范围

本阶段只调整：

1. `TuiController.start()`的resource rollback；
2. candidate live session start ownership；
3. `TuiController.stop()`的terminal memoization和all-settled cleanup；
4. `TuiController.run()`的input/pending/controller composite finalization；
5. selected/inactive live-session stop的sync-throw normalization和multi-session fan-out。

本阶段不修改TUI reducer/action semantics、renderer frame、screen control sequences、keyboard mapping、modal approval decision、GodCodeReplSession内部Phase591 lifecycle、Python Engine、JSON-RPC、provider、MCP、plugin、tool result、transcript、audit或persistent schema。

## Controller ownership contract

固定outer cleanup failure message：

```text
GOD-code TUI cleanup failed.
```

### Start

- Interactive preflight在任何resource ownership前保持原错误；
- Screen成功start后由controller generation持有；
- Candidate session从factory返回后由`startLiveSession()`持有，start/get-id/register/state setup任一步失败都single-attempt stop candidate；
- Start primary以原对象传播，candidate/session/screen cleanup failure不得覆盖或拼接；
- Start first render失败时停止已注册session与screen，不能留下active alternate screen。

### Stop

- First stop建立terminal memoized Promise；concurrent和post-settlement caller获得同一Promise；
- Stop开始时同步snapshot并撤销live session map、active session、screen和raw-mode ownership，避免reentrant cleanup重复消费；
- Exit-state render、raw-mode disable、每个unique session stop和screen stop分别经过owned Promise normalization；
- 任一同步throw或rejection不能阻断其他resource；
- 全部成功时resolve；任一cleanup失败且无outer operation primary时只reject固定Error，不泄漏raw reason；
- Same generation的每个session、screen和raw-mode disable最多attempt一次。

Controller stop保持terminal；本阶段不新增restart语义。

## Run input contract

- `run()`记录start/input-loop primary，并在所有退出路径结算input finalizer、captured pending actions和controller stop；
- Keypress和line/SIGINT callback中的同步错误必须reject input-loop Promise，不能从EventEmitter callback逃逸；
- Keypress listener detach与readline close由run ownership执行一次；natural close/normal exit不得二次close；
- Pending actions使用双分支`then` observer删除Set，立即观察rejection且不生成rejected derivative；
- Pending actions与controller stop并发settle，任一failure不能阻断另一边；
- Start/input primary跨input/controller cleanup保持；operation成功叠加任一cleanup failure时只抛固定outer Error。

Pending action自身的业务failure继续不自动终止interactive loop；本阶段只保证其被观察并在run结束前settle。

## Selected live-session close contract

- Single selected session stop同步throw与rejection统一为Promise rejection，原operation reason保持；
- Inactive multi-session close并发attempt全部candidate，首个failure不能阻断其余session；
- Successful stop才从runtime ownership map删除；failed candidate保留给terminal controller stop重试/观察；
- Existing reducer selection、event text和public return shapes保持。

## Tests

- Start session primary叠加candidate stop failure时保持原start object且stop一次；
- First render primary叠加session/screen cleanup failure时保持render object并attempt全部resources；
- Concurrent/repeated stop共享Promise，unique sessions、screen和raw-mode disable exactly-once；
- Explicit stop叠加session sync throw、screen throw和raw-mode throw时仍attempt全部并只抛fixed Error；
- Run input setup primary触发controller cleanup并保持原primary；
- Successful run叠加cleanup failure时只抛fixed Error且raw reason不泄漏；
- Rejected pending action被owned observer消费，不产生unhandled derivative并且terminal stop执行；
- Inactive multi-session close在首个sync throw后仍停止后续session，成功/失败ownership保持；
- Existing TUI start/submit/multi-session/render/input tests保持。

Compiled smoke从`dist/cli/tuiSession.js`验证start primary、stop Promise identity、sync/async all-settled cleanup、fixed no-leak projection和multi-session fan-out。

## 接口与安全边界

- `TuiControllerOptions`、`TuiSessionLike`、constructor、public methods和`runGodCodeTui()`签名保持；
- TUI state/action/result、renderer、screen sequences、approval decision和CLI command保持；
- Lifecycle settlement、fixed message、input finalizer和owned wrappers均module-private；
- 不新增environment variable、CLI flag、command、exit code、JSON key、event、warning或protocol field；
- Raw cleanup reason、Promise、session/screen/input/output object、frame、prompt、path、command、token、transport或process handle不得进入CLI、tool result、wire、audit、transcript或日志。

## 验收标准

- Start failure不留下candidate session、registered session、screen或raw mode；
- Stop same-generation memoized且所有resource all-settled single-attempt；
- Run在start/input/callback failure后仍完成input与controller cleanup；
- Operation primary保持，cleanup-only failure固定脱敏；
- Pending action rejection无unhandled derivative；
- Inactive session close不被首个sync throw串行阻断；
- Public TS、CLI、environment、protocol与persistent interfaces保持；
- Python、TypeScript、build、built integration和CLI smoke全部通过；
- Workspace与`/tmp`无TUI、engine、MCP、plugin、host、smoke、integration、Vitest、pytest或audit残留。

## Red Baseline

- `test/tuiControllerLifecycle.test.ts`新增8项composite lifecycle probe，旧实现8/8失败，并由pending action裸`finally`产生1个Vitest捕获的unhandled rejection。
- Candidate session start failure未stop candidate；first render与input setup primary后session/screen均未cleanup。
- Concurrent stop返回不同Promise并重复调用session stop；首个session同步throw阻断后续session与screen，raw cleanup reason直接泄漏。
- Successful run的raw-mode cleanup failure覆盖为raw error并阻断session/screen；inactive close首个sync throw阻断后续candidate。

## 实现结果

- `start()`在resource ownership后失败会观察terminal stop并保持原primary；`startLiveSession()`对factory candidate建立ownership，start/get-id/register/setup失败时single-attempt stop candidate，stop secondary不覆盖primary。
- `stop()`改为terminal memoized Promise。Stop同步snapshot并撤销raw mode、unique live sessions和screen ownership，再all-settled exit render、raw-mode disable、sessions与screen；任一cleanup failure只reject固定`GOD-code TUI cleanup failed.`。
- `run()`现在覆盖start、keypress或line/SIGINT loop、input finalizer、pending actions和controller stop。Event callback throw进入operation Promise；pending Set使用双分支observer，不再创建rejected derivative。Stop开始后的late session start由terminal gate拒绝并清理candidate。
- Selected session stop同步throw被Promise normalization；inactive multi-session close fan-out全部candidate，successful owner删除、failed owner保留并传播首个operation reason。
- 新增8项TUI controller lifecycle测试，旧实现8/8失败且有1个unhandled rejection，实现后8/8通过且无unhandled；TUI/REPL相关定向回归共79项通过，TypeScript build通过。
- CLI smoke新增`built TUI controller composite lifecycle`，从`dist/cli/tuiSession.js`验证start primary/candidate cleanup、stop Promise identity、sync/async all-settled fixed projection、inactive fan-out与input primary cleanup；完整CLI smoke通过。
- 2026-07-26统一`tools/check.sh`验收通过：Python 422项；TypeScript 54个test files、993项；TypeScript build、built integration和完整CLI smoke全部通过。
- Source与built artifact保留既有public TUI exports，并包含module-private stop settlement、fixed markers、pending observer和owned finalizer wrapper；旧pending裸`finally`、direct session-stop map与unowned screen stop路径已移除。
- 全量门禁留下6个audit fixture目录；对应owner PID `1326313`和`1327566`均已退出。完成owner核验后删除这些目录，最终workspace临时文件、`/tmp/god-code-*`与相关测试进程均无残留。

## Phase600 后续衔接（已完成）

Phase600已闭合final audit确认的transcript watch callback lifecycle：全部active/archive `FSWatcher`按owner root记录并隔离同步close failure，timeout/max-event outer Promise仍及时settle；pending event裸`finally`已改为owned双分支observer。Public transcript watch result、CLI JSON和discovery schema保持。
