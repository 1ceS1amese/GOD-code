# Phase 41: MCP Resource Subscription Diagnostics

Phase41 在 MCP resources/read 和 resource templates diagnostics 基础上，增加显式 resource subscribe / unsubscribe 诊断。

本阶段只验证 `resources/subscribe` 和 `resources/unsubscribe` 请求路径，不实现长生命周期事件监听，不维护跨命令订阅状态，也不把 resource 更新推入 Python Engine。

## CLI

新增：

```bash
god-code mcp subscribe-resource <uri>
god-code mcp subscribe-resource <uri> --server <server_id> --json
god-code mcp unsubscribe-resource <uri>
god-code mcp unsubscribe-resource <uri> --server <server_id> --json
```

规则：

- 命令会连接当前显式配置的 MCP server。
- 没有 `--server` 时，会先用 `resources/list` 找唯一匹配 URI。
- 多 server 存在相同 URI 时，返回错误并要求传 `--server <server_id>`。
- JSON 输出分别使用 `mcp_subscribe_resource` / `mcp_unsubscribe_resource` check。
- 文本输出展示 URI、server id 和最终 subscribed 状态。
- diagnostics 继续只展示 sanitized config metadata；env values 和 HTTP header values 不进入输出。

## Runtime

`SdkMcpStdioRuntime` 增加：

```ts
subscribeResource(uri, { serverId? })
unsubscribeResource(uri, { serverId? })
```

输出结构：

- `server_id`
- `uri`
- `subscribed`

stdio 和 Streamable HTTP 共用同一个 runtime 方法。

## 不做

- 不保持跨 CLI 命令的持久 MCP 连接。
- 不等待或渲染 `notifications/resources/updated`。
- 不把 resource update 推入 transcript 或 PromptBuilder。
- 不实现 resource template completion。
- 不实现 MCP auth / OAuth flow。
- 不实现 legacy SSE transport。

## 验收

- TS unit 覆盖 stdio 和 Streamable HTTP 的 subscribe / unsubscribe runtime 方法。
- CLI diagnostics 覆盖 `mcp subscribe-resource ... --json` 和 `mcp unsubscribe-resource ... --json`。
- Integration 覆盖 file-configured stdio 和 Streamable HTTP 配置。
- CLI smoke 覆盖 stdio / Streamable HTTP subscription diagnostics。
- `./tools/check.sh` 全量通过。
