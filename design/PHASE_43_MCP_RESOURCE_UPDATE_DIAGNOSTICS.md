# Phase 43: MCP Resource Update Diagnostics

Phase43 在 MCP resource subscription diagnostics 基础上，增加显式 `notifications/resources/updated` 等待诊断路径。

本阶段只验证短生命周期连接内的 resource update notification，不实现跨 CLI 命令持久订阅、不把 resource 自动注入 PromptBuilder，也不改变 Python Engine wire contract。

## CLI

新增：

```bash
god-code mcp wait-resource-update <uri>
god-code mcp wait-resource-update <uri> --server <server_id> --timeout-ms 1000 --json
```

规则：

- 命令会连接当前显式配置的 MCP server。
- 没有 `--server` 时，先通过 `resources/list` 找到唯一匹配 resource URI。
- runtime 在 subscribe 前注册 `notifications/resources/updated` handler。
- 只等待一次匹配 URI 的 update notification。
- 命令结束前 best-effort 调用 `resources/unsubscribe` 并关闭 MCP 连接。
- 超时会返回 `warn` check，不作为 runtime connection error。
- JSON 输出使用 `mcp_resource_update` check。

## Runtime

`SdkMcpStdioRuntime` 增加：

```ts
waitForResourceUpdate(uri, { serverId?, timeoutMs? })
```

输出结构：

- `server_id`
- `uri`
- `updated`
- `timed_out`
- `timeout_ms`
- `notification_uri`

该方法复用现有 MCP SDK `Client.setNotificationHandler(ResourceUpdatedNotificationSchema, ...)`。handler 的生命周期限制在单次 wait 调用内，完成后移除，避免影响后续 runtime 调用。

## Fixture 边界

- stdio fixture 会在 `resources/subscribe` 成功后发送 `notifications/resources/updated`。
- Streamable HTTP fixture 继续保持当前 stateless request fixture，用于验证既有 HTTP tools / resources / prompts / subscription / completion 路径。
- 本阶段不强行在 HTTP fixture 中模拟持久 SSE notification；HTTP resource update 事件循环需要单独设计 transport lifecycle。

## 不做

- 不保持跨 CLI 命令 MCP 连接。
- 不实现后台 resource update event loop。
- 不把 resource update 自动注入 PromptBuilder。
- 不实现 MCP auth / OAuth flow。
- 不实现 shell/readline completion。
- 不实现 legacy SSE transport。

## 验收

- TS unit 覆盖 stdio `waitForResourceUpdate()`。
- CLI diagnostics 覆盖 `mcp wait-resource-update ... --json`。
- Integration 覆盖 file-configured stdio update wait。
- CLI smoke 覆盖 stdio update wait。
- Streamable HTTP 既有 MCP runtime / diagnostics 测试不回归。
- `./tools/check.sh` 全量通过。
