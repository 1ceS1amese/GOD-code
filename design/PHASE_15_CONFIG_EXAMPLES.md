# Phase 15: Configuration Examples Baseline

Phase 15 补齐 provider、MCP、plugin / skill 和 transcript 的可复制配置示例。

它不新增 runtime 能力，不改变 CLI 命令，不改变 JSON-RPC wire contract，也不自动读取 `.env` 或额外配置文件。所有示例都只是文档化当前已有接口。

## 当前状态

基础实现已经落地：

- `examples/config/provider.env.example`
- `examples/config/mcp-stdio-servers.json`
- `examples/config/transcript.env.example`
- `examples/plugins/demo-plugin/plugin.json`
- `examples/plugins/demo-skill/skill.json`
- `design/PHASE_15_CONFIG_EXAMPLES.md`

## 示例覆盖

Provider 示例覆盖：

- `fake`
- `openai`
- `openai-compatible`
- `openai-responses`
- `openai-compatible-responses`

MCP 示例覆盖 `GOD_CODE_MCP_SERVERS` 当前 JSON array 形态。

Plugin / skill 示例覆盖当前声明式 manifest schema：

- `id`
- `name`
- `version`
- `tools`
- `permissions`
- `promptFragments`

Transcript 示例覆盖 `GOD_CODE_TRANSCRIPT_DIR` 默认和显式配置方式。

## 架构边界

保持不变：

- Provider config 仍由 Python `load_provider_config_from_env(...)` 解析。
- MCP stdio config 仍由 TS Host `loadMcpServerConfigsFromEnv(...)` 解析。
- Plugin / skill manifest 仍由 TS Host `parsePluginManifest(...)` 解析。
- Transcript dir 仍由 TS Host `resolveTranscriptDir(...)` 解析。
- 默认 provider 仍为 `fake`。

## 不做

Phase 15 当前不做：

- 自动加载 `.env` 文件。
- 新增 MCP 配置文件读取 CLI。（MCP 配置诊断已在 Phase18 补齐）
- provider HTTP health check。
- plugin manifest 校验 CLI。（已在 Phase18 补齐）
- plugin sandbox runtime。
- 执行 plugin 自带 JS / TS / shell 代码。
- 真实 API key 或真实远端服务示例。

## 验收

结构和解析：

```bash
ls examples/config/provider.env.example examples/config/mcp-stdio-servers.json examples/config/transcript.env.example
python3 -m json.tool examples/config/mcp-stdio-servers.json
python3 -m json.tool examples/plugins/demo-plugin/plugin.json
python3 -m json.tool examples/plugins/demo-skill/skill.json
```

完整验收：

```bash
./tools/check.sh
```
