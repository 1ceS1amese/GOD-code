# Phase 45: MCP Completion Candidate Output

Phase45 在 Phase42 的显式 `completion/complete` 诊断基础上，增加 shell/readline wrapper 可消费的 completion candidate 输出格式。

本阶段不实现自动安装的 shell completion hook，不实现交互式 readline UI，不改变 MCP runtime request 语义，也不改变 Python Engine wire contract。它只把已有 completion 结果渲染成更容易被外部 shell/readline 集成消费的格式。

## CLI

已有命令新增输出 flag：

```bash
god-code mcp complete-prompt <name> <argument_name> <argument_value> [context_json] --values-only
god-code mcp complete-prompt <name> <argument_name> <argument_value> [context_json] --jsonl
god-code mcp complete-resource-template <uri_template> <argument_name> <argument_value> [context_json] --values-only
god-code mcp complete-resource-template <uri_template> <argument_name> <argument_value> [context_json] --jsonl
```

输出规则：

- 默认文本输出保持 Phase42 行为。
- `--json` 输出完整 diagnostics report，保持 Phase42 行为。
- `--values-only` 每行输出一个 candidate value。
- `--jsonl` 每行输出一个结构化 candidate：

```json
{"value":"alpha","index":0,"server_id":"demo","ref_type":"prompt","ref":"summarize","argument":{"name":"text","value":"alph"}}
```

输出 flag 互斥：

- `--json`
- `--values-only`
- `--jsonl`

## Runtime

不新增 MCP runtime method。

`completePrompt()` / `completeResourceTemplate()` 继续返回 Phase42 的 `McpRuntimeCompletion`：

- `server_id`
- `ref_type`
- `ref`
- `argument`
- `values`
- `total`
- `has_more`

Phase45 只在 CLI 层增加：

- `renderMcpCompletionValues(report)`
- `renderMcpCompletionJsonl(report)`

## 不做

- 不自动安装 bash / zsh / fish completion script。
- 不实现 interactive readline UI。
- 不构造 concrete resource URI。
- 不把 completion 结果写入 PromptBuilder。
- 不改变 MCP auth / transport 行为。
- 不改变 Python Engine JSON-RPC payload。

## 验收

- TS unit 覆盖 completion values-only 和 JSONL renderer。
- Integration 覆盖 stdio `--values-only` / `--jsonl`。
- Integration 覆盖 Streamable HTTP `--values-only`。
- CLI smoke 覆盖 stdio `--values-only` / `--jsonl` 和 Streamable HTTP `--values-only`。
- `./tools/check.sh` 全量通过。
