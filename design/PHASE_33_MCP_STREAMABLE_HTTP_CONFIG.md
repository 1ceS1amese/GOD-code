# Phase 33: MCP Streamable HTTP Config Diagnostics

Phase33 为 MCP 配置层增加 Streamable HTTP transport 的离线配置解析和脱敏诊断，为后续真正的 HTTP runtime 铺路。Streamable HTTP runtime 已在 Phase34 补齐。

本阶段自身不默认访问网络：`mcp inspect-config` 只解析配置，不把 HTTP MCP server 注册成可执行 host tool。`mcp inspect-config --connect` 和 headless tool execution 的 Streamable HTTP runtime 已在 Phase34 补齐。

## 配置

stdio 仍保持向后兼容：

```json
{
  "id": "demo",
  "command": "python3",
  "args": ["server.py"]
}
```

Streamable HTTP 使用显式 transport：

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

示例文件：

- `examples/config/mcp-streamable-http-servers.json`

## 行为

- `transport` 允许 `stdio` 或 `streamable-http`；缺省仍按 `stdio` 解析。
- `streamable-http` 必须提供 http / https URL。
- `headers` 只允许 string record。
- `mcp inspect-config --json` 输出 HTTP server metadata，但只展示 `header_keys`，不展示 header values。
- Phase33 本身只做配置诊断；Phase34 起 `mcp inspect-config --connect` 和 headless tool execution 支持 Streamable HTTP runtime。

## 不做

- Phase33 本身不实现 HTTP / SSE / Streamable HTTP runtime 连接；Streamable HTTP runtime 已在 Phase34 补齐。
- 不做 MCP auth flow。
- 不做 header interpolation 或 secret store。
- 不做 resources / prompts。
- 不改变 JSON-RPC 或 Python Engine payload。

## 验收

- TS unit 覆盖 streamable-http 配置解析、URL/header 校验和脱敏 diagnostics。
- Integration 覆盖 CLI `mcp inspect-config --json` 和 `--connect --json` 的 HTTP 配置行为。
- CLI smoke 覆盖 header value 不泄露和 unsupported transport diagnostic。
- `./tools/check.sh` 全量通过。
