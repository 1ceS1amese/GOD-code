# Phase 13: Integration Baseline / Golden Events

Phase 13 把 Phase12 之后的 CLI 诊断能力固化成发布前稳定护栏。

它不新增 runtime 能力，不改变 JSON-RPC 方法集合，也不默认访问真实 provider HTTP。目标是让当前 fake-provider 路径、CLI JSON 输出、transcript history 和 protocol golden event sequence 能被一键黑盒验证。

## 当前状态

基础实现已经落地：

- `integration/cli_integration.py`
- `tools/run-integration-tests.sh`
- `tools/check.sh` 已在 TS build 后运行 integration tests
- `protocol/goldens/read-turn.json`
- `protocol/goldens/edit-turn.json`
- `protocol/goldens/bash-turn.json`
- `protocol/goldens/list-turn.json`
- `protocol/goldens/search-turn.json`
- `protocol/goldens/write-turn.json`

## 验证范围

Phase 13 覆盖四类稳定契约：

1. CLI JSON contract
   - `doctor --json`
   - `doctor provider-health --json`（fake provider 路径）
   - `provider inspect-config --json`（离线 provider config 路径）
   - `provider contract-test --json`（离线 provider contract 路径）
   - `mcp inspect-config --json`
   - `plugins validate <manifest> --json`
   - `tools list --json`
   - `tools inspect Read --json`
   - `run --json "bash printf ok"`

2. CLI exit code contract
   - usage error 返回 `2`
   - successful fake-provider run 返回 `0`

3. Golden event sequence
   - `read`
   - `edit`
   - `bash`
   - `list`
   - `search`
   - `write`

4. Transcript contract
   - 运行一个 turn 后，`sessions list` 能看到 session
   - `sessions replay <session_id>` 能重放 user / tool_result / assistant 条目
   - Phase16 后追加验证 `sessions search --json`、`sessions replay --json`、`sessions delete --json --yes`

## Golden normalization

集成测试会把运行时动态值归一化后再和 `protocol/goldens/*.json` 比较：

- `session_id` -> `session-1`
- `turn_id` -> `turn-1`
- `tool_call_id` -> `tool-call-1`
- 场景临时 cwd -> `<cwd>`

这样可以保留事件顺序、payload shape、工具输入输出和 assistant summary，又不会把 UUID、临时路径写死。

## 架构边界

```text
tools/run-integration-tests.sh
  -> integration/cli_integration.py
  -> node ts-host/dist/cli/main.js ...
  -> Python Engine subprocess
  -> fake provider
  -> built-in host tools
```

保持不变：

- JSON-RPC wire contract
- `TurnEngine`
- `ModelAdapter`
- `HostToolRegistry.executeRequest(...)`
- 默认 provider 为 `fake`

## 不做

Phase 13 当前不做：

- 真实 provider HTTP health check
- Phase13 本身不做 MCP HTTP / SSE / Streamable HTTP runtime transport；Streamable HTTP 配置诊断已在 Phase33 补齐，Streamable HTTP runtime 已在 Phase34 补齐。
- TUI
- 多 session 并发
- 多 turn 并发
- 并发 tool calls
- 自动更新 golden 文件

## 验收

单独运行：

```bash
cd GOD-code
cd ts-host && npm run build && cd ..
./tools/run-integration-tests.sh
```

完整验收：

```bash
cd GOD-code
./tools/check.sh
```
