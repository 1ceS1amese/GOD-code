# Phase 26: MCP Tool Schema Display

Phase26 补强 MCP tool schema 的可见性，让 MCP diagnostics 和 tools inspect 都能直接验证 MCP tool 输入 schema。

本阶段仍然是 TS Host CLI 展示增强：不新增 JSON-RPC 方法，不改变 Python Engine payload，不改变 MCP tool 执行语义。

## 行为

- `god-code mcp inspect-config --connect` 的文本输出为每个 MCP tool 显示 schema 摘要。
- `god-code mcp inspect-config --connect --json` 继续输出完整 `input_schema`。
- `god-code tools inspect <mcp.tool.name> --json` 可展示 MCP tool 的完整 `input_schema`。
- 未声明 schema 的 tool 文本输出为 `<not declared>`；已声明 object schema 会显示 type、required 和 properties。

## 验收

- TS unit 覆盖 MCP diagnostics 文本 schema 摘要。
- Integration 覆盖 file-configured MCP tool 的 `tools inspect --json` schema。
- CLI smoke 覆盖 `mcp inspect-config --connect --json` 和 `tools inspect mcp... --json` 的 schema。
- `./tools/check.sh` 全量通过。
