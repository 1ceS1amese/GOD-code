# Phase 20: Provider Config Inspection

Phase 20 为 provider 环境变量增加独立离线诊断入口。

它不访问真实 provider HTTP，不启动 Python Engine，不新增 JSON-RPC 方法，也不改变 Phase19 `provider contract-test` 的输出契约。

## 当前状态

基础实现已经落地：

- `god-code provider inspect-config`
- `god-code provider inspect-config --json`
- `ts-host/src/cli/provider.ts`
- `ts-host/test/cliProviderContract.test.ts`
- `integration/cli_integration.py`
- `tools/run-cli-smoke.sh`

## CLI 行为

```bash
god-code provider inspect-config
god-code provider inspect-config --json
```

输出使用和其他诊断命令一致的 report shape：

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

新增 check：

```text
provider_config
```

行为：

- 未配置 provider 或 `GOD_CODE_PROVIDER=fake`：返回 `ok`。
- 已知 provider 且配置完整：返回 `ok`。
- 未知 provider family 但配置形状完整：返回 `warn`，整体 `ok=true`。
- 缺 `GOD_CODE_MODEL`、缺 `GOD_CODE_API_KEY_ENV`、API key env 未设置或 timeout 非法：返回 `error`，整体 `ok=false`。

## Sanitized details

JSON details 只输出安全元数据：

- `provider`
- `model`
- `api_key_env`
- `api_key_present`
- `configured_base_url`
- `effective_base_url`
- `timeout_s`
- `known_family`

不输出真实 API key value，不输出 Authorization header。

## 架构边界

```text
god-code provider inspect-config
  -> TS CLI provider helper
  -> inspectProviderConfig(process.env)
  -> text / JSON report
```

`doctor` 复用同一套 provider config inspection 逻辑，但保持原有文本兼容。

保持不变：

- JSON-RPC wire contract。
- Python Engine。
- `TurnEngine`。
- `ProviderRegistry`。
- `doctor provider-health` 的显式真实 provider health check 语义。
- `provider contract-test` 的离线 contract runner。

## 不做

Phase 20 当前不做：

- 真实 provider HTTP 请求。
- 自动修复 provider env。
- 新 provider family。
- retry / fallback。
- billing / token budget。

## 测试

当前覆盖：

- fake/default provider config。
- known provider 完整配置。
- missing model / missing API key env value。
- unknown provider family warn。
- invalid timeout error。
- text / JSON 输出不泄漏 secret。
- integration 覆盖 `provider inspect-config --json`。
- CLI smoke 覆盖 fake path 和 config error path。

完整验收：

```bash
./tools/check.sh
```
