# Phase 19: Provider Contract Tests

Phase 19 为 OpenAI-compatible 和 OpenAI Responses provider 增加离线 contract test 入口。

它不访问真实 provider HTTP，不需要真实 API key，不新增 JSON-RPC 方法，也不改变默认 fake provider 路径。所有请求和响应都通过 Python 侧 recording transport / fixtures 验证。

## 当前状态

基础实现已经落地：

- `god-code provider contract-test`
- `god-code provider contract-test --json`
- `py-engine/src/god_code_engine/providers/contracts.py`
- `ts-host/src/cli/provider.ts`
- `py-engine/tests/test_provider_contracts.py`
- `ts-host/test/cliProviderContract.test.ts`

## CLI 行为

```bash
god-code provider contract-test
god-code provider contract-test --json
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

退出码：

- `0`：所有 contract check 通过。
- `1`：contract runner 失败或任一 check 失败。
- `2`：CLI 用法错误。

## Contract 覆盖

当前 matrix：

- `openai_compatible_request_body`
- `openai_compatible_assistant_payload`
- `openai_compatible_tool_call_payload`
- `openai_compatible_stream`
- `openai_responses_request_body`
- `openai_responses_context`
- `openai_responses_tool_call_payload`
- `openai_responses_stream`
- `real_provider_adapter_contract`

覆盖边界：

- Chat Completions endpoint、request body、tool schema、assistant / tool_call mapper。
- OpenAI-compatible SSE delta 和 final assistant payload。
- Responses endpoint、`max_output_tokens`、function tools、assistant context、function_call mapper。
- Responses streaming delta / final response。
- `RealProviderModelAdapter` 的 assistant、tool call、unknown tool rejection、stream fallback 和 missing final response error。

## 架构边界

```text
god-code provider contract-test
  -> TS CLI provider helper
  -> python -m god_code_engine.providers.contracts
  -> provider clients with RecordingTransport
  -> JSON report
```

保持不变：

- JSON-RPC wire contract。
- `TurnEngine`。
- `ProviderRegistry` 默认 fake provider。
- `doctor provider-health` 的真实 provider 显式检查语义。
- 默认 smoke 不访问真实 provider HTTP。

## 安全输出

contract runner 内部会构造 fake API key 以验证 header 组装，但 report details 只输出：

- provider family
- endpoint
- stream flag
- tool names
- context keys

不输出 API key value 或 Authorization header。

## 不做

Phase 19 当前不做：

- 真实 OpenAI / compatible HTTP 请求。
- 新 provider family。
- Anthropic provider。
- retry / fallback。
- billing / token budget。
- provider SDK 引入。

## 测试

当前覆盖：

- Python contract runner 全部 checks。
- contract report 不泄漏 credential-like values。
- TS CLI helper text / JSON render。
- runner invalid JSON 和 non-zero contract failure report。
- integration 覆盖 `provider contract-test --json`。
- CLI smoke 覆盖 text 和 JSON 两条路径。

完整验收：

```bash
./tools/check.sh
```
