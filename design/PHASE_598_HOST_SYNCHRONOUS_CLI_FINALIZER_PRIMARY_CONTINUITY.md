# Phase598：Host synchronous CLI finalizer primary continuity

## 背景

Phase597闭合short-lived MCP runtime diagnostics后，Host CLI仍有两条同步finalizer直接位于`finally`中：

1. `TerminalApprovalPrompt.ask()`在answer/abort callback和outer `finally`中重复执行`readline.Interface.close()`；
2. `runTuiPtySmoke()`在renderer operation后的`finally`中直接执行`TuiScreen.stop()`。

两条路径都依赖同步cleanup。Approval callback内的close若throw，会发生在Promise settlement之前，可能让approval永久pending或形成事件回调throw；outer close还会形成第二次attempt。TUI stop若throw，则会覆盖renderer primary或把successful smoke替换为raw output failure。两条路径都缺少固定、脱敏且primary-aware的existing boundary投影。

## 范围

本阶段只处理以下两个Host-local同步生命周期：

- interactive terminal approval的abort/question settlement、abort-listener detach和readline close；
- TUI PTY smoke在successful screen start后的render与screen stop。

本阶段不修改permission policy、approval mode、approval request summary、TUI renderer/screen public behavior、CLI routing、Python Engine、JSON-RPC、provider、MCP、plugin、tool result、transcript、audit或persistent schema。

## Terminal approval contract

固定cleanup downgrade reason：

```text
Interactive approval input cleanup failed.
```

`TerminalApprovalPrompt.ask()`按以下顺序执行：

1. Pre-aborted signal继续直接返回既有cancelled denial，不创建readline interface；
2. Interface建立后，question answer与abort只竞争settle一个local decision，不在callback内close；
3. Operation settlement后，abort-listener detach和interface close分别经过同步owned invocation，任一步骤throw不能阻断另一步骤；
4. Interface close在一个approval request中最多调用一次；
5. Question/setup rejection是primary，以原对象传播，cleanup failure不得覆盖或拼接；
6. Interactive deny或cancelled denial是decisive primary，cleanup failure不得改写其source/reason；
7. Interactive allow叠加cleanup failure时fail closed，返回既有`ToolApprovalDecision` deny shape，`source: "unavailable"`且reason为固定字符串；
8. Normal allow、deny、abort和non-interactive TTY guard输出保持。

Raw close/listener cleanup reason、stack、cause、input/output object、request内容、path、command、token或stream state不得进入decision reason、tool result、CLI output、audit或日志。

## TUI PTY smoke contract

固定cleanup failure message：

```text
TUI PTY smoke cleanup failed
```

`runTuiPtySmoke()`继续在TTY guard与frame construction后建立screen。Successful `screen.start()`之后：

1. Render与structured passed result属于operation outcome；
2. `screen.stop()`通过同步owned invocation执行一次；
3. Render rejection是primary，以原对象传播，stop failure不得覆盖或拼接；
4. Render成功但stop失败时，通过既有throw boundary抛出固定Error；
5. Raw output/stop reason、stack、cause、frame、terminal sequence或output object不得进入错误消息；
6. Normal passed/skipped result、dimensions、rendered line count和screen sequence顺序保持。

Start failure保持现有边界：`TuiScreen.start()`只在control-sequence write成功后标记active；若start自身throw，当前generation尚未建立active screen ownership，本阶段不伪造stop success或扩展`TuiScreen`状态机。

## Tests

- Normal interactive allow只close一次并保持allow decision；
- Allow叠加close throw时返回fixed unavailable denial且raw reason不泄漏；
- Interactive deny叠加close throw时保持原deny decision；
- Abort cancellation叠加close throw时保持cancelled denial；
- Interface creation期间signal转为aborted时，在question注册前观察并保持cancelled denial；
- Question/setup primary叠加close throw时保持原rejection object；
- TUI render成功叠加stop throw时只抛fixed Error且raw reason不泄漏；
- TUI render primary叠加stop throw时保持原render error object；
- Existing normal TUI passed/skipped和approval non-interactive paths保持。

Compiled smoke从`dist/cli/approval.js`和`dist/cli/tuiPtySmoke.js`验证single close、approval fail-closed projection、deny/operation primary continuity、TUI fixed cleanup projection、render primary continuity和no raw reason。

## 接口与安全边界

- `TerminalApprovalPromptOptions`、constructor与`requestApproval(...)`签名保持；
- `ToolApprovalDecision` union、source值、permission policy与tool error mapping保持；
- `TuiPtySmokeOptions`、`TuiPtySmokeResult`和`runTuiPtySmoke(...)`签名保持；
- Finalization outcome、fixed strings、settlement guard和owned wrappers均module-private；
- 不新增environment variable、CLI flag、command、exit code、JSON key、event、warning或protocol field；
- 不修改JSON-RPC、Engine event、provider、MCP、plugin、tool result、transcript、audit、manifest或persistent schema。

## 验收标准

- Approval question/abort callback不再直接close，interface每个request single-attempt finalization；
- Allow cleanup uncertainty fail closed，deny/cancel/question primary保持；
- TUI successful cleanup uncertainty通过fixed existing throw boundary可见，render primary保持；
- Raw cleanup reasons不进入decision、human/JSON output或日志；
- Public TS、CLI、environment、protocol与persistent interfaces保持；
- Python、TypeScript、build、built integration和CLI smoke全部通过；
- Workspace与`/tmp`无approval、TUI、engine、MCP、plugin、host、smoke、integration、Vitest、pytest或audit残留。

## Red Baseline

- `test/cliSynchronousFinalizersLifecycle.test.ts`新增7项同步lifecycle probe，旧实现7/7失败。
- Normal approval answer实际调用`rl.close()`两次；allow、interactive deny与abort cancellation叠加第二次close throw时分别reject raw cleanup reason，而不是保持或安全降级decision。
- Question setup primary叠加outer close throw时由cleanup secondary替换，原rejection object丢失。
- TUI render成功叠加stop throw时直接泄漏raw stop reason；render primary叠加stop throw时由cleanup secondary替换。

## 实现结果

- `TerminalApprovalPrompt.ask()`现在让answer与abort只竞争settle一个local decision，不再在callback内close。Abort-listener detach与readline close分别经过module-private同步owned wrapper，close single-attempt且任一cleanup throw不能阻断另一个步骤。
- Question/setup rejection以原对象传播；interactive deny与cancelled denial跨cleanup failure保持；interactive allow叠加cleanup uncertainty时返回fixed unavailable denial，raw reason不进入decision或tool result。
- `runTuiPtySmoke()`现在先形成render operation outcome，再单独结算一次screen stop。Render primary保持；successful render叠加stop failure时只抛固定`TUI PTY smoke cleanup failed`。
- 新增7项同步CLI finalizer red probes，旧实现7/7失败、实现后7/7通过；另增加1项interface creation期间abort race回归。Approval、Host tools、REPL、TUI approval/screen/PTY相关定向回归共54项通过，TypeScript build通过。
- CLI smoke新增`built synchronous CLI finalizer primary continuity`，从`dist/cli/approval.js`和`dist/cli/tuiPtySmoke.js`验证single close、allow fail-closed、deny/question primary、TUI cleanup projection、render primary与raw secondary不泄漏；完整CLI smoke通过。
- 2026-07-26统一`tools/check.sh`验收通过：Python 422项；TypeScript 53个test files、985项；TypeScript build、built integration和完整CLI smoke全部通过。
- Source与built artifact保留既有public approval/TUI exports，并包含module-private fixed markers与owned finalizer wrappers；approval callback和TUI operation中的旧direct-finally close/stop路径已移除。
- 全量门禁留下6个audit fixture目录；对应owner PID `1275436`和`1276687`均已退出。完成owner核验后删除这些目录，最终workspace临时文件、`/tmp/god-code-*`与相关测试进程均无残留。

## Phase599 已完成衔接

Phase599的final lifecycle static audit确认`TuiController`仍有live composite gap，并已完成start rollback、run input/pending settlement、terminal stop memoization和multi-session all-settled实现。Phase598 approval/PTY局部finalizer与public接口保持。Audit还确认transcript watcher和local-provider log descriptor是两个独立后续边界，分别交由Phase600/601处理。
