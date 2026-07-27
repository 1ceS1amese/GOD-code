# Phase 42: MCP Completion Diagnostics

Phase42 在 MCP prompts、resource templates 和 subscription diagnostics 基础上，增加显式 `completion/complete` 诊断路径。

本阶段只把 MCP completion 暴露为 CLI diagnostics，不实现交互式补全 UI，不把 completion 结果注入 PromptBuilder，也不改变 Python Engine wire contract。

## CLI

新增：

```bash
god-code mcp complete-prompt <name> <argument_name> <argument_value> [context_json]
god-code mcp complete-prompt <name> <argument_name> <argument_value> [context_json] --server <server_id> --json
god-code mcp complete-resource-template <uri_template> <argument_name> <argument_value> [context_json]
god-code mcp complete-resource-template <uri_template> <argument_name> <argument_value> [context_json] --server <server_id> --json
```

规则：

- `complete-prompt` 使用 `ref/prompt`。
- `complete-resource-template` 使用 `ref/resource`。
- `context_json` 必须是 string-valued JSON object，对应 MCP completion context arguments。
- 没有 `--server` 时，会先用 prompts 或 resource templates 列表找唯一匹配项。
- JSON 输出分别使用 `mcp_complete_prompt` / `mcp_complete_resource_template` check。
- 文本输出展示 reference、argument、values 数量和返回值列表。

## Runtime

`SdkMcpStdioRuntime` 增加：

```ts
completePrompt(name, argument, { context?, serverId? })
completeResourceTemplate(uriTemplate, argument, { context?, serverId? })
```

输出结构：

- `server_id`
- `ref_type`
- `ref`
- `argument`
- `values`
- `total`
- `has_more`

stdio 和 Streamable HTTP 共用同一个 runtime 方法。

## 不做

- 不实现 readline / shell completion。
- 不把 completion 结果写入 PromptBuilder。
- 不自动构造 concrete resource URI。
- 不保持跨 CLI 命令 MCP 连接。
- 不实现 MCP auth / OAuth flow。
- 不实现 legacy SSE transport。

## 验收

- TS unit 覆盖 stdio 和 Streamable HTTP prompt / resource template completion。
- CLI diagnostics 覆盖 `mcp complete-prompt ... --json` 和 `mcp complete-resource-template ... --json`。
- Integration 覆盖 file-configured stdio 和 Streamable HTTP 配置。
- CLI smoke 覆盖 stdio / Streamable HTTP completion diagnostics。
- `./tools/check.sh` 全量通过。
