# Phase589：Host prepared runtime lifecycle finalization

## 背景

`prepareGodCodeHost()`会按顺序创建MCP与plugin runtime，再完成MCP连接、tool catalog注册和MCP context构建。当前实现只在成功返回的`PreparedGodCodeHost.close()`中串行关闭runtime，因此存在两类真实生命周期缺口：

- MCP已经连接后，plugin load、tool name校验、registry注册、MCP context配置或context读取失败时，函数直接抛出，已创建runtime不会回滚；
- 成功返回后的`host.close()`先等待plugin，再等待MCP，一个close reject会阻断另一runtime，一个close pending会延迟另一runtime开始；
- concurrent或post-settlement repeated `host.close()`会重复执行runtime close，没有terminal exactly-once lifecycle；
- cleanup error可能覆盖host setup primary，使caller看不到真正的配置、plugin或context失败原因。

Phase588已把`SdkMcpStdioRuntime.close()`内部的client/transport等待限制在bounded lifecycle；`PluginSkillRuntime.close()`当前只重置内存状态。Phase589在这两个runtime之上补齐prepared-host ownership transaction，不重复实现runtime内部deadline。

## 范围归类

本阶段只修改`prepareGodCodeHost()`拥有的runtime生命周期：

1. runtime创建后的host setup失败回滚；
2. 成功返回后的terminal、memoized、并发best-effort close；
3. source test与compiled smoke对上述行为的验证。

以下边界独立留给后续阶段：

- `runGodCodeTurn()`与`runGodCodeRpcSmoke()`中host close和engine stop的复合finalizer连续性；
- `GodCodeReplSession.cleanup()`的renderer、host和engine复合清理；
- `GodCodeEngineProcess.stop()`的concurrent/repeated stop、SIGKILL后exit settlement与peer finalization；
- plugin sandbox子进程、tool execution cancellation或新的public lifecycle diagnostics。

## Host Setup Transaction

`prepareGodCodeHost()`在registry创建完成后进入runtime ownership transaction：

```text
create MCP runtime
  -> create plugin runtime
  -> connect/register/list MCP tools
  -> load/validate/register plugin tools
  -> build MCP context messages
  -> transfer both runtimes to PreparedGodCodeHost
```

在ownership transfer前任一步骤throw时：

1. 对已经创建的plugin与MCP runtime同时发起single-attempt close；
2. 每个调用都通过owned Promise boundary捕获同步throw与异步reject；
3. 使用`Promise.allSettled(...)`等待两个runtime各自的既有settlement contract；
4. cleanup failure不覆盖、不拼接也不替换setup primary；
5. setup primary以原对象重新throw，保持error type、message、cause和diagnostic details；
6. 未创建的runtime不产生close调用；已创建但尚未connect/load的runtime仍可安全close。

Registry及其部分tool registration在失败后不会对外返回；本阶段不增加registry rollback API。

## Prepared Host Close Contract

成功返回的`PreparedGodCodeHost`保存一个terminal close Promise：

1. 第一次`close()`同时发起plugin与MCP runtime close；
2. 一个runtime的同步throw、reject或等待不会阻止另一runtime开始；
3. runtime close outcome通过`Promise.allSettled(...)`消费，public `host.close()`保持best-effort resolve；
4. concurrent caller共享同一Promise；
5. lifecycle settle后Promise仍被保留，post-settlement repeated close不重复触发runtime close；
6. 每个owned runtime在整个prepared-host生命周期中最多close一次；
7. 无runtime配置时close仍返回resolved Promise。

Host层不增加第二套timeout：MCP继续使用Phase588的内部deadline，plugin close继续使用其当前本地同步状态重置。Host timeout若早于MCP的client加transport fallback总窗口，会错误地提前报告整个runtime已完成，因此不在本层截断。

## Primary与诊断连续性

- Plugin manifest/load错误、duplicate tool错误、MCP context配置错误和MCP resource/prompt diagnostic保持原始类型与内容；
- rollback close的reason不进入primary message、cause、JSON projection、CLI stderr或audit记录；
- 成功返回后的close没有新增warning/result channel，因此继续采用best-effort resolve，而不是把secondary cleanup reason暴露为新的public contract；
- Close settlement只表示runtime的既有close Promise已经settle，不额外证明外部进程、socket或transport状态。

## Tests

- MCP成功连接后注入plugin setup primary，同时让plugin与MCP close reject：两个close均single-attempt，原始plugin primary保持；
- 成功prepared host的plugin close受控pending时，MCP close必须在其settlement前开始；
- Concurrent close caller必须共同等待pending lifecycle，不能提前resolve；
- Pending释放后以及post-settlement repeated close都不能重复调用任一runtime close；
- 一个runtime同步throw或reject时，另一个runtime仍被调用，`host.close()`最终resolve；
- Existing MCP stdio/HTTP、plugin、tool catalog、doctor、headless、REPL和audit tests全部回归；
- Compiled smoke从`dist/headless/godCodeHostSetup.js`执行setup rollback与terminal repeated close，证明build artifact不是只在source tests中生效。

## 接口与安全边界

- `prepareGodCodeHost(options)`、`PrepareGodCodeHostOptions`、`PreparedGodCodeHost`和`close(): Promise<void>`签名保持；
- 不新增environment variable、config field、CLI flag、command、exit code、warning或report field；
- 不修改JSON-RPC、engine event、tool result、provider、transcript、plugin manifest、MCP payload或persistent schema；
- Lifecycle helper、runtime union和memoized Promise均为module-private；
- Cleanup reason不得泄漏MCP URL/header/token、plugin path、command、cwd、transport或process handle。

## 验收标准

- Ownership transfer前的任意host setup failure都会关闭全部已创建runtime；
- Setup primary跨rollback close throw/reject保持原对象；
- Prepared host close并发、best-effort、terminal且same-runtime exactly-once；
- Concurrent与post-settlement repeated caller都观察同一close lifecycle；
- Phase588 MCP deadline与public host接口保持，不引入host-level提前截断；
- Python、TypeScript、build、built integration和CLI smoke全部通过；
- Source/dist静态接口一致，workspace与`/tmp`无test fixture、MCP process、engine、smoke或patch残留。

## Red Baseline

- `test/godCodeHostSetup.test.ts`新增3项runtime lifecycle probe，旧实现3项全部失败。
- Setup rollback probe保留了plugin primary，但connected MCP与plugin close调用均为0，证明ownership transfer前没有回滚。
- Terminal close probe的concurrent caller得到不同Promise；旧串行实现先阻塞在plugin close，尚未进入MCP close。
- Close isolation probe中plugin同步throw直接reject `host.close()`并阻断MCP close，证明缺少owned all-settled boundary。

## 实现结果

- `godCodeHostSetup.ts`把MCP/plugin runtime creation、tool catalog preparation与MCP context build包入ownership transaction。Catch路径调用module-private `closePreparedHostRuntimes(...)`，通过owned Promise wrapper和`Promise.allSettled(...)`并发关闭全部已创建runtime，再重新throw原setup error对象。
- 成功返回的`PreparedGodCodeHost`保存永久`closeSettlement`。第一次close并发发起plugin/MCP finalization并best-effort resolve；concurrent和post-settlement repeated close返回同一Promise，same-runtime在prepared-host生命周期内最多调用一次。Phase588 MCP内部deadline与public Host interfaces保持。
- 新增`test/godCodeHostSetup.test.ts` 3项probe，验证MCP connected后的setup rollback primary continuity、pending plugin下MCP concurrent start/terminal Promise identity，以及plugin同步throw isolation；3项全部通过。MCP、plugin、platform、REPL、transcript与audit相关回归共425项通过。
- Compiled smoke从`dist/headless/godCodeHostSetup.js`配合built MCP/plugin runtimes执行真实stdio MCP setup rollback和成功host terminal close，验证secondary rollback rejection不覆盖plugin primary、plugin/MCP并发启动、concurrent/post-settlement Promise identity与single-attempt；完整CLI smoke通过。
- 全量`tools/check.sh`通过：Python 422项；TypeScript 44个test files、937项；TypeScript build、built integration与完整CLI smoke全部成功。
- 全量首轮暴露既有Phase567 generation-drift probe对owner-path读取次数的filesystem timing假设：并行负载下语义正确但读取数可从5增至8。断言收敛为至少5次，同时继续严格验证injection、`stateChanged`、authority withdrawal、secret不泄漏和on-disk extra保持；runtime代码未改变，定向304项和后续全量均通过。
- Source/dist静态验证确认各有一个module-private `closePreparedHostRuntimes(...)`和一个terminal `closeSettlement`，旧`await pluginRuntime?.close(); await mcpRuntime?.close()`串行路径已删除。`PrepareGodCodeHostOptions`、`PreparedGodCodeHost`、`prepareGodCodeHost()`签名及environment、CLI、protocol和persistent schema均未变化。
- README、项目计划、内部设计、架构、扩展点、安全、protocol、Phase8与Phase588衔接文档已同步到Phase589。
- 残留审计发现14个audit test lock/quarantine fixture；其owner PID `794503`、`810441`、`811687`、`816131`、`816523`、`817762`均已退出，随后删除exact test prefix。最终`/tmp`无audit、Phase589 host lifecycle、MCP、smoke或integration残留；workspace无`.tmp`、`.bak`、`.orig`或`.rej`，也无check、Vitest、pytest、MCP fixture、engine或CLI进程。

## Phase590 后续衔接

Phase590已把`runGodCodeTurn()`与`runGodCodeRpcSmoke()`接到primary-preserving all-settled finalizer。Phase589 terminal host close现在与engine stop及可选renderer finish fan-out执行，secondary failure不再阻断其他resource或覆盖operation primary；无primary时cleanup priority保持。`GodCodeReplSession` composite cleanup随后由Phase591闭合，`GodCodeEngineProcess.stop()`自身SIGKILL/peer lifecycle随后由Phase592闭合。

## Phase591 后续衔接

Phase591已把Phase589 terminal host close接入REPL generation cleanup。Start failure、explicit stop和engine-exit后的restart cleanup都复用memoized outcome；host close与renderer/engine fan-out且不会覆盖start、submit或outer-run primary。Prepared host public interface保持；当时保留的`GodCodeEngineProcess.stop()`自身deadline、SIGKILL/exit settlement与peer close已由Phase592闭合。

## Phase592 后续衔接

Phase592已把与Phase589 host close并列调用的`GodCodeEngineProcess.stop()`收口为generation terminal lifecycle。Headless与REPL composite finalizer现在观察memoized engine stop；shutdown、graceful/forced exit和peer close均有确定settlement，failed forced exit阻止restart。Prepared host与engine仍保持独立resource ownership，public Host接口不变。

## Phase594 已完成衔接

Phase594已把doctor `checkHostTools()`接到本阶段的prepared-host terminal close。Doctor不再在close前提交tool count，也不允许close secondary产生第二个同名check或覆盖tool-catalog operation primary；successful count叠加异常close时只使用fixed sanitized cleanup projection。Phase589 public host interface和runtime close策略保持不变。

## Phase595 已完成衔接

Phase595已把`tools list/inspect`共享的`listHostTools()`接到本阶段的prepared-host terminal close。Catalog read primary跨close secondary保持，successful read叠加异常close时只使用fixed sanitized error，原catalog array identity与normal render保持。至此production prepared-host调用方均有显式outer lifecycle ownership，Phase589 public接口不变。
