# Phase 17: Provider Health Diagnostics

Phase 17 在现有 `doctor` 本地诊断基础上增加显式 provider health check。

默认 `god-code doctor` 仍然只做本地检查，不访问真实 provider HTTP。只有用户显式运行 `god-code doctor provider-health` 时，才会用当前 provider 配置发起一次最小模型请求。

## 当前状态

基础实现已经落地：

- `god-code doctor provider-health`
- `god-code doctor provider-health --json`
- `ts-host/src/cli/doctor.ts`
- `ts-host/test/cliDiagnostics.test.ts`
- `integration/cli_integration.py`
- `tools/run-cli-smoke.sh`

## CLI 行为

```bash
god-code doctor provider-health
god-code doctor provider-health --json
```

输出仍复用 `DoctorReport`：

- `ok`
- `checks[].name`
- `checks[].status`
- `checks[].message`

新增 check：

```text
provider_health
```

行为：

- 未设置 provider 或 `GOD_CODE_PROVIDER=fake`：返回 `ok`，不发 HTTP。
- provider config 有错误：返回 `warn skipped`，不启动 health turn。
- provider config 完整：启动 Python Engine，使用当前 `GOD_CODE_PROVIDER` 作为 `model_adapter`，创建空 tool catalog session，提交一次最小 health turn。
- health turn 成功：`provider_health=ok`。
- health turn 失败：`provider_health=error`，整体 `ok=false`。

## 架构边界

Phase 17 不新增 JSON-RPC 方法：

```text
god-code doctor provider-health
  -> TS Host doctor helper
  -> GodCodeEngineProcess
  -> initialize
  -> create_session(model_adapter=<GOD_CODE_PROVIDER>, tool_catalog=[])
  -> submit_turn(max_tokens=8, temperature=0)
  -> wait for turn_finished
```

默认 doctor 仍然是本地诊断：

```text
god-code doctor
  -> Node runtime
  -> transcript dir
  -> provider env shape
  -> Python Engine initialize
  -> host tool catalog
```

## 保持不变

- JSON-RPC wire contract。
- 默认 provider 仍为 `fake`。
- `doctor` / `doctor --json` 不访问真实 provider HTTP。
- 不打印真实 API key 内容。
- 不新增 provider SDK。
- 不做 retry / fallback / billing / token budget。

## 测试

当前覆盖：

- fake provider health 不发 HTTP 且返回 ok。
- provider config 错误时 health check 被跳过。
- unknown provider family 的 health turn 返回明确 error。
- integration 覆盖 `doctor provider-health --json` fake-provider contract。
- CLI smoke 覆盖 fake provider-health 和 provider config error skip。

完整验收：

```bash
./tools/check.sh
```

## Phase593 后续衔接

Phase593保持本阶段provider-health command、timeout、turn payload和report schema不变，并收口其outer cleanup。Turn outcome先形成唯一diagnostic；waiter timer/listeners与engine stop all-settled。Operation error保持，successful health叠加cleanup uncertainty时只使用固定`<provider>: health check cleanup failed`，raw cleanup reason不进入human/JSON输出。
