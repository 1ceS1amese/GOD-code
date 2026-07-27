# Phase597：Host MCP diagnostic runtime cleanup primary continuity

## 背景

Phase596闭合plugin diagnostics后，`cli/mcp.ts`仍有三类runtime通过相同模式收尾：

```text
try:
  append one or more checks
finally:
  await runtime.close().catch(() => undefined)
```

受影响路径：

1. `inspectMcpContext()`：`mcp_connect`加`mcp_context`；
2. `checkMcpConnection()`：`mcp_connect`加可选resources/templates/prompts multi-check；
3. `runMcpRuntimeDiagnostic()`：`mcp_connect`加一个generic operation check，覆盖resource、prompt、subscription、update和completion commands。

Promise rejection被静默吞掉，successful report看不到cleanup uncertainty；同步close throw则在`.catch(...)`建立前逃逸，可覆盖已经形成的connect/operation primary。Multi-check路径不能简单追加新的`mcp_cleanup` check，否则会扩展长期稳定的check-name集合和JSON输出。

## 范围

本阶段只修改上述三类short-lived MCP diagnostic runtime lifecycle：

1. 每条路径先在局部数组形成既有operation checks；
2. Runtime close通过shared owned Promise boundary single-attempt执行；
3. Existing error primary跨cleanup failure保持；
4. 无operation error且cleanup失败时，降级一个既有owner check为固定error；
5. Final checks只在cleanup settlement后追加到外层report。

本阶段不修改MCP runtime内部Phase588 close deadline、transport fallback、server config、context limits、resource/prompt payload、completion candidate输出、command routing或public report schema。

## Cleanup owner规则

固定cleanup message：

```text
MCP runtime cleanup failed
```

### inspectMcpContext

- Local checks保持`mcp_connect`后`mcp_context`顺序；
- Connect或context error存在时保持原error；
- Connect与context均成功但close失败时，把`mcp_context`替换为fixed error；
- `mcp_context_config`和`mcp_config` preflight checks不属于runtime cleanup owner。

### checkMcpConnection

- Local checks保持`mcp_connect`与requested resources/templates/prompts顺序；
- 任一connect或optional operation check为error时，cleanup failure只消费，不改写已有primary diagnostics；
- 全部requested checks非error但close失败时，把`mcp_connect`替换为fixed error；
- Optional successful checks保持，可证明其operation已完成，但report因owner cleanup error变为false。

### runMcpRuntimeDiagnostic

- Local checks保持`mcp_connect`后`operationName`顺序；
- Connect或operation error存在时保持原error；
- Operation返回`ok`或`warn`但close失败时，把`operationName`替换为fixed error；
- `mcp_config` preflight check保持。

共同约束：

- Runtime ownership建立后close调用一次；
- Close同步throw与Promise rejection均由owned wrapper消费；
- Operation error message/details保持，不拼接cleanup reason；
- Cleanup downgrade移除原owner success/warn details，只保留existing name、`error`和fixed message；
- Raw cleanup reason、stack、cause、server config value、header/token、runtime/client/transport、PID、path或command不得进入human/JSON report。

## Tests

- Generic resource operation成功叠加close rejection时，operation check唯一fixed error且raw reason不泄漏；
- Generic operation primary叠加同步close throw时保持原operation error；
- Multi-check connection全部成功叠加close rejection时，只把`mcp_connect`降级，optional checks保持且无duplicate；
- Multi-check resource primary叠加同步close throw时保持resource error和connect success；
- Context build成功叠加close rejection时，只把`mcp_context`降级；
- Normal close继续保持context、tools/resources/templates/prompts和generic operation details；
- Compiled smoke从`dist/cli/mcp.js`配合built runtime验证三种owner、sync throw isolation、single close和no raw reason。

## 接口与安全边界

- 所有exported MCP diagnostic functions/options/types与render函数签名保持；
- Existing check names、status union、JSON keys、details shapes和command exit routing保持；
- Finalizer、owner projection helper、outcome与fixed string均module-private；
- 不新增environment variable、CLI flag、command、exit code、check name、warning或protocol field；
- 不修改JSON-RPC、Engine event、provider、tool result、transcript、audit、plugin manifest、MCP wire payload或persistent schema。

## 验收标准

- MCP operation error primary跨runtime close throw/reject保持；
- Successful/warn diagnostics的cleanup uncertainty通过fixed existing-owner error可见；
- Multi-check report不新增或重复cleanup check；
- Raw cleanup reason不进入human/JSON输出；
- Runtime close single-attempt，normal check order/details保持；
- Public TS、CLI、environment、protocol与persistent interfaces保持；
- Python、TypeScript、build、built integration和CLI smoke全部通过；
- Workspace与`/tmp`无MCP diagnostic runtime/server、plugin、host、engine、smoke、integration或audit残留。

## Red Baseline

- `test/mcpDiagnosticsLifecycle.test.ts`新增6项runtime lifecycle probe，旧实现5失败/1通过。
- Normal generic resource operation与successful close保持existing operation check/details。
- Generic/context/multi-check successful operation叠加close rejection仍返回ok，证明cleanup uncertainty被静默吞掉。
- Generic operation primary或optional resource primary叠加同步close throw时整个diagnostic Promise以cleanup secondary拒绝，证明`.close().catch(...)`不能捕获调用阶段throw并覆盖operation/report。

## 实现结果

- `inspectMcpContext()`、`checkMcpConnection()`和`runMcpRuntimeDiagnostic()`现在先在局部数组形成既有runtime checks，close settlement后才追加到外层report。
- 新增shared module-private `finalizeMcpDiagnosticRuntime()`、owned invocation wrapper与owner projection helper。Any existing error保持；无error且cleanup失败时分别把`mcp_context`、`mcp_connect`或generic `operationName`替换为`MCP runtime cleanup failed`，不新增check name。
- Multi-check optional resources/templates/prompts成功项在connection owner cleanup failure时保持；generic warn outcome也会在cleanup uncertainty时降级为error。Cleanup projection移除owner success/warn details，raw reason不进入report。
- 新增6项MCP diagnostic lifecycle测试，覆盖normal generic operation、generic cleanup downgrade/primary、multi-check owner/optional primary和context owner；MCP/plugin/host/tools相关定向回归共74项通过，TypeScript build通过。
- CLI smoke新增`built MCP diagnostic runtime cleanup primary continuity`，从`dist/cli/mcp.js`配合built runtime验证generic、connection和context三类owner、sync throw isolation、single close、optional check保持与raw secondary不泄漏；完整CLI smoke通过。
- 2026-07-26统一`tools/check.sh`验收通过：Python 422项；TypeScript 52个test files、977项；TypeScript build、built integration和完整CLI smoke全部通过。
- Source与built artifact均保留既有public MCP exports，并包含module-private shared finalizer、owner projection和owned invocation wrapper；三条旧`runtime.close().catch(...)`路径已从source与`dist/cli/mcp.js`移除，固定cleanup marker一致。
- 全量门禁留下6个audit fixture目录；对应owner PID `1224314`和`1225544`均已退出。完成owner核验后删除这些目录，最终workspace临时文件、`/tmp/god-code-*`与相关测试进程均无残留。

## Phase598 已完成衔接

Phase598已收口interactive approval/readline和TUI PTY screen stop。Approval answer/abort callback不再直接close，question rejection、deny和cancel primary保持，allow cleanup uncertainty沿existing decision fail closed；TUI render primary跨stop failure保持，successful render cleanup uncertainty沿existing throw boundary固定投影。Phase597 MCP runtime owner rules与public接口保持。
