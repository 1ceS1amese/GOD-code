# Phase 18: MCP / Plugin Diagnostics

Phase 18 为 MCP 配置和 plugin / skill manifest 增加独立 CLI 诊断入口。

它不新增 JSON-RPC 方法，不启动 Python Engine，不执行 plugin 自带代码，也不默认启动 MCP server。所有诊断都在 TS Host CLI 层完成。

## 当前状态

基础实现已经落地：

- `god-code mcp inspect-config`
- `god-code mcp inspect-config --json`
- `god-code mcp inspect-config --connect`
- `god-code mcp inspect-config --connect --json`
- `god-code plugins validate <manifest_or_dir>`
- `god-code plugins validate <manifest_or_dir> --json`
- `ts-host/src/cli/mcp.ts`
- `ts-host/src/cli/plugins.ts`
- `ts-host/test/cliMcpPlugins.test.ts`

## MCP 诊断

```bash
god-code mcp inspect-config
god-code mcp inspect-config --json
```

默认只解析 `GOD_CODE_MCP_SERVERS`：

- 未配置时返回 `ok`。
- JSON 非法、字段非法、server id 重复时返回 `error`。
- 文本输出只展示 env key 数量和名称，不输出 env value。

```bash
god-code mcp inspect-config --connect
god-code mcp inspect-config --connect --json
```

显式启动 MCP stdio runtime：

- 连接配置中的 server。
- 加载 MCP tools。
- 输出 tool 数量和 tool 名称。
- 结束后关闭 runtime。

## Plugin / Skill 诊断

```bash
god-code plugins validate <manifest_or_dir>
god-code plugins validate <manifest_or_dir> --json
```

`<manifest_or_dir>` 可以是：

- `plugin.json`
- `skill.json`
- 包含二者之一的目录

目录内同时存在 `plugin.json` 和 `skill.json` 时返回错误。

校验内容：

- `id`
- `name`
- `version`
- `tools`
- `permissions`
- `promptFragments`

## JSON report

MCP 和 plugin 诊断都使用相同的 report shape：

```ts
{
  ok: boolean;
  checks: Array<{
    name: string;
    status: "ok" | "warn" | "error";
    message: string;
    details?: unknown;
  }>;
}
```

## 架构边界

```text
god-code mcp inspect-config
  -> TS CLI mcp helper
  -> loadMcpServerConfigsFromEnv
  -> optional SdkMcpStdioRuntime.connect

god-code plugins validate
  -> TS CLI plugin helper
  -> resolve plugin.json / skill.json
  -> loadPluginManifestFile / parsePluginManifest
```

保持不变：

- JSON-RPC wire contract。
- Python Engine。
- `TurnEngine`。
- `HostToolRegistry.executeRequest(...)`。
- 默认 smoke 仍走 fake model。

## 不做

Phase 18 当前不做：

- Phase18 本身不做 MCP HTTP / SSE / Streamable HTTP runtime 连接；Streamable HTTP 配置诊断已在 Phase33 补齐，Streamable HTTP runtime 已在 Phase34 补齐。
- MCP resources / prompts / auth。
- 自动生成 MCP 配置。
- plugin marketplace。
- plugin sandbox runtime。
- 执行 plugin 自带 JS / TS / shell 代码。
- 注册 plugin tool handler。

## 测试

当前覆盖：

- MCP 空配置、非法 JSON、connect fake MCP fixture。
- Plugin / skill 文件和目录校验。
- 缺字段和双 manifest 目录错误。
- integration 覆盖 `mcp inspect-config --json` 和 demo plugin validate。
- CLI smoke 覆盖 empty config、MCP connect、demo plugin 和 demo skill。

完整验收：

```bash
./tools/check.sh
```
