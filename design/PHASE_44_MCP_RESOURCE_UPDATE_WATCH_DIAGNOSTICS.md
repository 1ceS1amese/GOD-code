# Phase 44: MCP Resource Update Watch Diagnostics

Phase44 在 Phase43 的一次性 `wait-resource-update` 基础上，增加短生命周期多事件 resource update watch 诊断。

本阶段目标是验证 TS Host 可以在一次 MCP 连接内持续收集多次 `notifications/resources/updated`，为后续后台 resource update event loop 做准备。它不实现跨 CLI 命令持久订阅、不启动 daemon、不把 resource update 注入 PromptBuilder，也不改变 Python Engine wire contract。

## CLI

新增：

```bash
god-code mcp watch-resource-updates <uri>
god-code mcp watch-resource-updates <uri> --server <server_id> --max-events 3 --timeout-ms 1000 --json
```

规则：

- 命令会连接当前显式配置的 MCP server。
- 没有 `--server` 时，先通过 `resources/list` 找到唯一匹配 resource URI。
- runtime 在 subscribe 前注册 `notifications/resources/updated` handler。
- 只收集匹配 URI 的 update notification。
- 达到 `--max-events` 后正常结束。
- 达不到 `--max-events` 会在 `--timeout-ms` 后以 `warn` check 结束。
- 命令结束前 best-effort 调用 `resources/unsubscribe` 并关闭 MCP 连接。
- JSON 输出使用 `mcp_resource_update_watch` check。

## Runtime

`SdkMcpStdioRuntime` 增加：

```ts
watchResourceUpdates(uri, { serverId?, timeoutMs?, maxEvents? })
```

输出结构：

- `server_id`
- `uri`
- `event_count`
- `max_events`
- `timed_out`
- `timeout_ms`
- `updates[]`

`waitForResourceUpdate()` 复用 `watchResourceUpdates(..., { maxEvents: 1 })`，保持 Phase43 输出 contract 不变。

## Fixture 边界

- stdio fixture 会在 `resources/subscribe` 成功后发送 3 次 `notifications/resources/updated`。
- Streamable HTTP fixture 继续保持当前 stateless request fixture，用于验证既有 HTTP tools / resources / prompts / subscription / completion 路径。
- 本阶段不强行在 HTTP fixture 中模拟持久 SSE notification；HTTP resource update event loop 仍需单独设计 transport lifecycle。

## 不做

- 不保持跨 CLI 命令 MCP 连接。
- 不实现后台 daemon / 持久 event loop。
- 不把 resource update 自动注入 PromptBuilder。
- 不实现 MCP auth / OAuth flow。
- 不实现 shell/readline completion。
- 不实现 legacy SSE transport。

## 验收

- TS unit 覆盖 stdio `watchResourceUpdates()` 多事件收集。
- CLI diagnostics 覆盖 `mcp watch-resource-updates ... --json`。
- Integration 覆盖 file-configured stdio update watch。
- CLI smoke 覆盖 stdio update watch。
- Streamable HTTP 既有 MCP runtime / diagnostics 测试不回归。
- `./tools/check.sh` 全量通过。
