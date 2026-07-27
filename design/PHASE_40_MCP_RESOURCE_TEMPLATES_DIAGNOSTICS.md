# Phase 40: MCP Resource Templates Diagnostics

Phase40 在 Phase38 resources / prompts 列表诊断和 Phase39 resource read / prompt get 诊断基础上，增加 MCP resource templates 的列表诊断。

本阶段只调用 `resources/templates/list`，不实例化模板，不读取模板展开后的 resource，不做 completion，也不把模板注入 Python Engine。

## CLI

新增 flag：

```bash
god-code mcp inspect-config --resource-templates
god-code mcp inspect-config --connect --resources --resource-templates --prompts --json
```

规则：

- `--resource-templates` 会隐式启用 `--connect`。
- JSON 输出新增 `mcp_resource_templates` check。
- 文本输出展示 `uri_template`、server id、name 和 mime type。
- diagnostics 继续只展示 sanitized config metadata；env values 和 HTTP header values 不进入输出。

## Runtime

`SdkMcpStdioRuntime` 增加：

```ts
listResourceTemplates(): Promise<McpRuntimeResourceTemplate[]>
```

输出结构：

- `server_id`
- `uri_template`
- `name`
- `description`
- `mime_type`

stdio 和 Streamable HTTP 共用同一个 runtime 方法。

## 不做

- 不实现 template variable completion。
- 不根据 template 自动构造 concrete URI。
- 不把 templates 自动注入 PromptBuilder。
- 不实现 resource subscriptions。
- 不实现 MCP auth / OAuth flow。
- 不实现 legacy SSE transport。

## 验收

- TS unit 覆盖 stdio 和 Streamable HTTP 的 `listResourceTemplates()`。
- CLI diagnostics 覆盖 `mcp inspect-config --resource-templates --json`。
- Integration 覆盖 file-configured stdio 和 Streamable HTTP 配置。
- CLI smoke 覆盖 stdio / Streamable HTTP resource templates diagnostics。
- `./tools/check.sh` 全量通过。
