# Phase 8：MCP Stdio Runtime

Phase 8 的目标是把当前 TS Host 侧已有的 MCP fake registry 骨架，推进到第一版真实 **MCP stdio runtime**。

当前基础实现已落地。MCP 仍然只放在 TS Host，不进入 Python Engine，也不改变 JSON-RPC wire contract。

---

## 1. 目标

Phase 8 固定为：

- 接入显式配置的 MCP stdio server
- 将 MCP tools 转成 GOD-code `ToolCatalogEntry`
- 将 MCP tool handler 注册到 `HostToolRegistry`
- MCP tool 执行继续走 `HostToolRegistry.executeRequest(...)`
- 继续复用 Phase 1 的 permission / audit / cancel 边界

目标调用链：

```text
MCP stdio server
  -> TS MCP client
  -> McpToolRegistry
  -> HostToolRegistry.executeRequest(...)
  -> Python Engine execute_tool flow
```

---

## 2. 为什么放在 TS Host

MCP runtime 涉及：

- server process lifecycle
- stdio transport
- tool discovery
- tool call
- transport error handling

这些都是宿主能力，不应该放进 Python Engine。

Python Engine 只需要看到标准工具目录和标准工具执行结果，不应该知道 MCP server、transport 或 SDK 细节。

---

## 3. Provider / Tool 边界

Phase 8 不改模型 provider 边界。模型仍然只通过 `ModelRequest.tools` 看到工具名和描述。

MCP tool 映射规则：

- MCP tool name 映射为 GOD-code tool name
- 建议命名格式：`mcp.<serverId>.<toolName>`
- MCP tool description 映射到 `ToolCatalogEntry.description`
- MCP input schema 第一版保留在 TS Host 内部，不进入 Python wire contract
- MCP tool result 转成 `ToolExecutionResult`

错误建议：

```text
error.code = "mcp_tool_error"
```

---

## 4. 配置模型

第一版只支持显式配置的 stdio server：

```ts
interface McpServerConfig {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}
```

配置来源：

```text
GOD_CODE_MCP_SERVERS
```

默认行为：

- 未配置 MCP：现有 CLI / smoke 完全不变
- 配置 MCP：TS Host 启动 MCP client，并把 MCP tools 合并进 tool catalog
- MCP server command 只能来自宿主配置，不能来自模型输出

---

## 5. TS Host 设计接口

已在 `ts-host/src/mcp/` 下补运行接口：

```ts
interface McpRuntime {
  connect(): Promise<void>;
  listTools(): Promise<ToolCatalogEntry[]>;
  executeTool(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<ToolExecutionResult>;
  close(): Promise<void>;
}
```

现有 `McpToolRegistry` / `registerMcpToolsWithHostRegistry(...)` 可以继续作为 host registry adapter。

当前实现使用官方 MCP TypeScript SDK 的 stdio client / transport；SDK 细节只留在 `ts-host/src/mcp/`。

---

## 6. 不改的接口

Phase 8 不改变：

- `HostToolRegistry.executeRequest(...)`
- `ToolCatalogEntry`
- `ExecuteToolRequest`
- `ToolExecutionResult`
- `initialize`
- `create_session`
- `submit_turn`
- `execute_tool`
- Python `ToolScheduler`
- Python `ModelRequest`

也就是说，MCP 对 Python Engine 来说只是普通工具。

---

## 7. 明确不做

第一版不做：

- Phase8 本身不做 MCP HTTP / SSE / Streamable HTTP runtime transport；Streamable HTTP 配置诊断已在 Phase33 补齐，Streamable HTTP runtime 已在 Phase34 补齐。
- MCP resource
- MCP prompt
- dynamic server discovery
- remote auth
- Python-side MCP runtime
- plugin market
- REPL / TUI
- 多 MCP server 并发调度策略

---

## 8. 实现测试覆盖

TS 测试已覆盖：

- fake/local MCP stdio server 可以启动和关闭
- `listTools()` 能映射成 `ToolCatalogEntry[]`
- MCP tool name 带 `mcp.<serverId>.` 前缀
- MCP tool 执行仍走 `HostToolRegistry.executeRequest(...)`
- permission deny 对 MCP tool 生效
- audit 能记录 MCP tool 请求、决策、结果
- MCP transport error 返回结构化 `mcp_tool_error`
- close 能清理子进程
- `GOD_CODE_MCP_SERVERS` 配置解析和错误处理
- headless session setup 能加载 env 配置的 MCP tools

Python 默认不新增运行逻辑，只跑回归：

```bash
./tools/run-python-tests.sh
```

TS 回归：

```bash
cd GOD-code/ts-host
npx tsc -p tsconfig.json --noEmit
npm test -- --run
```

Smoke：

```bash
cd GOD-code
node ts-host/dist/cli/main.js rpc-smoke
node ts-host/dist/cli/main.js run "read README.md"
node ts-host/dist/cli/main.js run "bash printf ok"
```

MCP 测试使用本地 fake MCP stdio server，不接真实远端服务。

---

## 9. 默认决策

- Phase 8 第一版只实现 MCP stdio runtime
- MCP runtime 只放 TS Host
- 默认 CLI 行为保持不变
- MCP server 只能来自显式宿主配置
- MCP tools 必须继续经过 Phase 1 policy / audit
- 不改 JSON-RPC
- 不改 Python Engine

## Phase588 后续衔接

Phase588已为Phase8引入的`SdkMcpStdioRuntime.close()`补齐module-private 5000ms settlement deadline。Connected servers snapshot后并发关闭，client reject/timeout进入bounded transport fallback；concurrent/repeated close共享同一active lifecycle。Phase8的public `McpRuntime`签名、tool naming、HostToolRegistry permission/audit路径和explicit configuration保持不变，connect/list-tools primary不会再被cleanup永久pending无限延迟。

## Phase589 后续衔接

Phase589把Phase8 runtime接入prepared-host ownership transaction。MCP已连接后若plugin、tool catalog或context setup失败，Host会与plugin runtime一起并发best-effort close并重新throw原primary；成功`PreparedGodCodeHost`则永久memoize terminal close Promise，使MCP与plugin并发single-attempt finalization。Phase588内部deadline仍是MCP settlement authority，Phase8 public runtime与配置接口不变。

## Phase597 已完成衔接

Phase597已把Phase8 runtime的CLI diagnostic调用方接入shared outer finalizer。Context、connection multi-check与generic operations先形成local checks，close同步throw/reject后按existing owner check投影fixed error；operation primary、optional success evidence、Phase588 internal deadline和Phase8 public runtime/config接口保持。
