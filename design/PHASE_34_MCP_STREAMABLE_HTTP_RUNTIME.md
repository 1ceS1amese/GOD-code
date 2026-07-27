# Phase 34: MCP Streamable HTTP Runtime

Phase34 在 Phase33 的配置诊断基础上，把 MCP `streamable-http` server 接入真实 runtime。

本阶段仍然保持 MCP 生命周期在 TS Host 内部：不新增 JSON-RPC 方法，不改变 Python Engine payload。Streamable HTTP tools 和 stdio tools 一样映射为 `ToolCatalogEntry`，执行仍走 `HostToolRegistry.executeRequest(...)`。

## 配置

```json
{
  "id": "remote-demo",
  "transport": "streamable-http",
  "url": "https://mcp.example.test/mcp",
  "headers": {
    "Authorization": "Bearer replace-me"
  }
}
```

## 行为

- `mcp inspect-config --connect` 会使用 SDK `StreamableHTTPClientTransport` 连接 `streamable-http` server。
- `tools/list` 返回的工具映射为 `mcp.<server_id>.<tool_name>`。
- `tools inspect <mcp.tool.name> --json` 可查看 Streamable HTTP MCP tool schema。
- Headless run / rpc-smoke 的 tool catalog 可包含 Streamable HTTP MCP tools。
- MCP tool 调用通过 SDK `client.callTool(...)` 发起，返回结果沿用现有 `mcpResultToToolExecutionResult(...)`。
- `headers` 会传入 HTTP request，但 diagnostics 只展示 header key，不展示 value。

## 不做

- 不实现 legacy MCP SSE transport。
- 不实现 OAuth / auth flow。
- 不实现 MCP resources / prompts。
- 不做自动重连策略配置或 token refresh。
- 不改变 permission / audit / HostToolRegistry 边界。

## 验收

- TS unit 覆盖本地 Streamable HTTP MCP server 的 connect、listTools、callTool、tool error 和 headless setup。
- CLI diagnostics 覆盖 Streamable HTTP `mcp inspect-config --connect --json`。
- Integration 和 CLI smoke 覆盖本地 Streamable HTTP fixture，不依赖外网。
- `./tools/check.sh` 全量通过。
