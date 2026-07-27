# Phase 27: MCP Runtime Error Diagnostics

Phase27 补强 MCP runtime 连接阶段的错误诊断，让 `mcp inspect-config --connect --json` 能定位失败 server 和失败类型。

本阶段仍然是 TS Host 诊断增强：不新增 JSON-RPC 方法，不改变 Python Engine payload，不改变 MCP tool 执行语义。

## 行为

- MCP runtime 连接失败、tools/list 失败、重复 tool name 会抛出结构化诊断错误。
- `god-code mcp inspect-config --connect --json` 的 `mcp_connect.details` 会包含：
  - `error_code`
  - `server_id`
  - `cause_message`
  - sanitized `server` metadata：id、command、args_count、cwd、env_keys
  - tool 相关错误会额外包含 `tool_name` / `original_tool_name`
- 文本诊断会展示 `error_code`、失败 server 和 sanitized server metadata。
- env values 不会出现在 JSON 或文本诊断中。

## 边界

- 不重试 MCP server。
- 不自动修复配置。
- 不解析 stderr 流做额外分类。
- 不暴露 env value 或 secret-like 配置值。

## 验收

- TS unit 覆盖缺失 MCP command 的结构化错误和 env value 脱敏。
- Integration 覆盖 `mcp inspect-config --connect --json` 失败时的 `error_code` / `server_id` / `env_keys`。
- CLI smoke 覆盖 broken MCP server 非零退出和结构化 JSON。
- `./tools/check.sh` 全量通过。
