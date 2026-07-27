# Phase 38: MCP Resources / Prompts Diagnostics

Phase38 在 MCP stdio runtime 和 Streamable HTTP runtime 已可连接并列出 tools 的基础上，把 MCP resources / prompts 的列表诊断接入 `mcp inspect-config`。

本阶段只做显式诊断，不把 resources / prompts 注入 Python Engine，不改变 JSON-RPC wire contract，也不改变 MCP tool execution flow。

## CLI

新增：

```bash
god-code mcp inspect-config --resources
god-code mcp inspect-config --prompts
god-code mcp inspect-config --connect --resources --prompts --json
```

规则：

- `--resources` 会隐式启用 `--connect`，连接已配置 MCP server 并执行 `resources/list`。
- `--prompts` 会隐式启用 `--connect`，连接已配置 MCP server 并执行 `prompts/list`。
- `--json` 输出完整 sanitized resource / prompt metadata。
- 文本输出展示 resource URI、server id、name、mime type，以及 prompt name、server id、description、argument 数量。
- secret-like config values 仍不进入 diagnostics；HTTP header 继续只展示 key。

## Runtime

`SdkMcpStdioRuntime` 增加：

```ts
listResources(): Promise<McpRuntimeResource[]>
listPrompts(): Promise<McpRuntimePrompt[]>
```

输出结构只用于 diagnostics：

- resource: `server_id`、`uri`、`name`、`description`、`mime_type`、`size`
- prompt: `server_id`、`name`、`description`、`arguments`

stdio 和 Streamable HTTP transport 共用同一个 runtime 方法；差异只来自 SDK transport。

## 不做

- 不实现 `resources/read`。
- 不实现 resource templates。
- 不实现 subscriptions。
- 不实现 `prompts/get`。
- 不把 prompts 自动注入 PromptBuilder。
- 不把 resources 作为 tool 或 context 自动加入 model input。
- 不实现 MCP auth / OAuth flow。
- 不实现 legacy SSE transport。

## 验收

- TS unit 覆盖 stdio MCP server 的 `listResources()` / `listPrompts()` 映射。
- CLI diagnostics 覆盖 `mcp inspect-config --connect --resources --prompts --json`。
- Integration 和 CLI smoke 覆盖 file-configured stdio MCP server 的 resources / prompts diagnostics。
- Streamable HTTP fixture 提供 resources / prompts 能力，保证 runtime 共享路径可继续扩展。
- `./tools/check.sh` 全量通过。
