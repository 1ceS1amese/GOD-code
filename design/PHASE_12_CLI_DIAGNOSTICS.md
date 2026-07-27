# Phase 12: CLI Diagnostics / Tools UX

Phase 12 补齐基础 CLI 调试能力，让当前运行环境、工具目录和脚本化执行更容易观察。

它不改变 JSON-RPC 协议，也不改变 Python Engine 的 turn loop。新增能力都在 TS Host CLI 层。

## 当前状态

基础实现已经落地：

- `god-code run --json <prompt>`
- `god-code run --json --raw-events <prompt>`
- `god-code tools list`
- `god-code tools list --json`
- `god-code tools inspect <tool_name>`
- `god-code tools inspect <tool_name> --json`
- `god-code doctor`
- `god-code doctor --json`
- `god-code doctor provider-health`
- `god-code doctor provider-health --json`
- `ts-host/src/cli/tools.ts`
- `ts-host/src/cli/doctor.ts`
- `ts-host/test/cliDiagnostics.test.ts`

## CLI 行为

```bash
god-code run --json "bash printf ok"
```

脚本模式运行一个 turn：

- 不启用 `TerminalRenderer`
- 不做 streaming 增量渲染
- stdout 输出 `TurnResult` JSON
- `status != "success"` 时返回非 0

```bash
god-code run --json --raw-events "bash printf ok"
```

在 `TurnResult` JSON 上额外输出 `events` 数组，用于脚本调试和 event sequence 验证。

```bash
god-code tools list
```

输出当前 host tool catalog：

- 默认包含六个内置工具
- 如果配置了 `GOD_CODE_MCP_SERVERS`，会连接 MCP stdio server 并包含 MCP tools
- `--json` 输出原始 tool catalog JSON，包括可选 `input_schema`

```bash
god-code tools inspect Read --json
```

输出单个 tool 的详情。文本模式展示名称、描述和 input schema；JSON 模式输出单个 `ToolCatalogEntry`。

```bash
god-code doctor
```

执行本地诊断：

- Node runtime
- transcript dir
- provider 环境变量形态检查
- Python Engine initialize
- host tool catalog

`doctor --json` 输出同一份 report 的 JSON 形态。`checks[].status` 可以是 `ok`、`warn` 或 `error`；只有 `error` 会让 `report.ok=false`。`doctor` 不调用真实 provider HTTP，不读取或打印真实 API key 内容。

```bash
god-code doctor provider-health --json
```

显式执行 provider health check：

- fake provider 路径不发 HTTP，直接返回 `provider_health=ok`。
- provider config 有错误时跳过 health turn。
- provider config 完整时，通过当前 provider 发起一次最小模型请求。
- 输出仍是 `DoctorReport` JSON。

CLI 退出码：

- `0`：命令成功；`doctor` 只有 warn 也算成功
- `1`：运行失败或 runtime error
- `2`：usage / 参数错误

## 架构边界

```text
CLI diagnostics
  -> TS Host helpers
  -> GodCodeEngineProcess.initialize
  -> provider-health explicitly reuses create_session / submit_turn
  -> prepareGodCodeHost
```

保持不变：

- JSON-RPC wire contract
- `TurnEngine`
- `ModelAdapter`
- `HostToolRegistry.executeRequest(...)`
- Phase10 REPL
- Phase11 session history

## 不做

Phase 12 第一版不做（provider health check 已在 Phase17 补齐）：

- provider HTTP health check
- 自动修复
- plugin / MCP 配置文件生成
- 多 session 并发

## 测试

当前覆盖：

- tools list 文本渲染
- tools list JSON 渲染
- tools inspect 文本 / JSON 渲染
- 默认内置工具列表
- MCP fake server tool 出现在 tools list
- tool catalog `input_schema`
- doctor 默认环境通过
- doctor provider config ok / warn / error
- doctor provider-health fake / skipped / error
- doctor error 渲染
- doctor JSON 渲染
- raw event callback

验收命令：

```bash
cd GOD-code
./tools/run-ts-tests.sh
```

smoke：

```bash
cd GOD-code
./tools/run-cli-smoke.sh
```
