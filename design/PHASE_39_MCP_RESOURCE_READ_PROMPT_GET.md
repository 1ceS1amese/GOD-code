# Phase 39: MCP Resource Read / Prompt Get Diagnostics

Phase39 在 Phase38 的 resources / prompts 列表诊断基础上，增加显式读取 resource 和获取 prompt 的 CLI 诊断路径。

本阶段仍然只在 TS Host 内部处理 MCP 连接与 SDK 调用，不改变 Python Engine，不新增 JSON-RPC wire 方法，不把 resource / prompt 自动注入模型上下文。

## CLI

新增：

```bash
god-code mcp read-resource <uri>
god-code mcp read-resource <uri> --server <server_id> --json
god-code mcp get-prompt <name> [arguments_json]
god-code mcp get-prompt <name> [arguments_json] --server <server_id> --json
```

规则：

- `read-resource` 会连接当前显式配置的 MCP server，并调用 `resources/read`。
- `get-prompt` 会连接当前显式配置的 MCP server，并调用 `prompts/get`。
- 没有 `--server` 时，会先用 `resources/list` 或 `prompts/list` 找唯一匹配项。
- 多 server 存在相同 resource URI 或 prompt name 时，返回错误并要求传 `--server <server_id>`。
- `arguments_json` 必须是 JSON object，且 value 必须是 string，匹配 MCP `prompts/get` 参数约束。
- JSON 输出保留 normalized content / message 结构；文本输出只展示摘要和短文本预览。
- config diagnostics 仍只展示 env/header key，不展示 secret-like value。

## Runtime

`SdkMcpStdioRuntime` 增加：

```ts
readResource(uri, { serverId? })
getPrompt(name, args?, { serverId? })
```

输出结构：

- resource read: `server_id`、`uri`、`contents[]`
- content: `uri`、`mime_type`、`text` 或 `blob`
- prompt get: `server_id`、`name`、`description`、`messages[]`
- prompt message: `role`、normalized content

stdio 和 Streamable HTTP 共用同一 runtime 方法。

## 不做

- 不实现 resource templates。
- 不实现 resource subscriptions。
- 不把 resource 自动注入 PromptBuilder。
- 不把 prompt 自动作为 system/user prompt fragment 注入模型。
- 不做 prompt argument schema UI。
- 不实现 MCP auth / OAuth flow。
- 不实现 legacy SSE transport。

## 验收

- TS unit 覆盖 stdio 和 Streamable HTTP 的 `readResource()` / `getPrompt()`。
- CLI diagnostics 覆盖 `mcp read-resource ... --json` 和 `mcp get-prompt ... --json`。
- Integration 覆盖 file-configured stdio 和 Streamable HTTP 配置。
- CLI smoke 覆盖 stdio / Streamable HTTP 新命令。
- `./tools/check.sh` 全量通过。
