# Phase 10: REPL Session UX

Phase 10 的目标是把现有 headless `run` 路径扩成一个最小可用的交互式 REPL。

它不是 TUI，也不是多会话管理器。第一版只做一个长期运行的 CLI 会话，让用户可以在同一个 Python Engine session 里连续提交 prompt，并通过少量 slash command 查看状态、列工具和取消当前 turn。

## 当前状态

基础实现已经落地：

- `ts-host/src/cli/repl.ts`
- `GodCodeReplSession`
- `runGodCodeRepl(...)`
- `god-code repl`
- `ts-host/test/repl.test.ts`

默认 CLI 行为保持不变：

- `god-code run <prompt>` 仍然是一次性 headless turn。
- `god-code rpc-smoke` 仍然只做启动和会话 smoke。
- `god-code repl` 是新增入口，不改变 JSON-RPC wire contract。

## 设计边界

Phase 10 复用已有边界：

```text
CLI repl
  -> GodCodeReplSession
  -> GodCodeEngineProcess
  -> JSON-RPC over stdio
  -> Python Engine session
  -> ModelAdapter / Provider
  -> execute_tool
  -> HostToolRegistry.executeRequest
```

不新增 JSON-RPC 方法，也不让 Python Engine 关心 CLI 是否处在 REPL。

## REPL 行为

`GodCodeReplSession` 持有：

- 一个 `GodCodeEngineProcess`
- 一个 Python Engine session
- 一个 HostToolRegistry
- 可选 MCP stdio runtime
- 一个当前 turn 状态

支持：

- `start()`
- `submit(prompt)`
- `cancelCurrentTurn()`
- `getStatus()`
- `listTools()`
- `stop()`

状态限制：

- 同一 REPL session 内只允许一个 running turn。
- 如果 turn 正在运行，新的普通 prompt 会被拒绝。
- `/cancel` 只取消当前 running turn。

## Slash commands

第一版支持：

```text
/help
/status
/tools
/cancel
/exit
```

普通非 slash 行会作为用户 prompt 提交。

## Streaming 与 renderer

REPL 默认启用 `stream: true`，复用 Phase 6 的 `TerminalRenderer`：

- `assistant_delta` 立即输出。
- `assistant_message` 做去重。
- `tool_call_requested` 会结束当前输出行。
- turn 完成后调用 renderer `finish()`。

## MCP / Plugin 边界

REPL 不直接实现 MCP 或 plugin。

它复用现有 host setup：

- 内置工具目录
- `GOD_CODE_MCP_SERVERS`
- `HostToolRegistry.executeRequest(...)`

因此 MCP tools 和后续 plugin tools 在 REPL 下仍然表现为普通工具目录项，执行仍走 Phase1 permission / audit / cancel。

## 不做

Phase 10 第一版不做：

- TUI
- 多 session UI
- 并发 turn
- 并发工具调度
- transcript browser
- 历史搜索
- provider 选择 UI
- 交互式权限确认 UI

## 测试

当前覆盖：

- REPL session 启动和工具列表
- 同一 session 连续 turn
- running turn 时拒绝第二个 prompt
- `/status`、`/tools`、`/cancel`、`/exit`

验收命令：

```bash
cd GOD-code/ts-host
npx tsc -p tsconfig.json --noEmit
npm test -- --run
```

smoke：

```bash
cd GOD-code
printf "/status\n/tools\n/exit\n" | node ts-host/dist/cli/main.js repl
```
