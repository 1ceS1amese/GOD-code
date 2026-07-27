# Phase 5：OpenAI-compatible provider client

这份文档描述 Phase 5 已落地的代码边界，以及后续继续扩 provider 时应遵守的接入方式。

Phase 5 的主题是：

> 在 Phase 4 provider 骨架上，接入第一版真实 HTTP provider client。

第一版选择 **OpenAI-compatible Chat Completions**。这样既能接 OpenAI 风格接口，也方便后续接本地 OpenAI-compatible 服务。

默认行为仍然是 `fake`。没有显式配置 provider 环境变量时，现有 smoke 和 deterministic fake model 路径不变。

---

## 1. 本阶段目标

Phase 5 解决的是“真实 HTTP provider client 怎么接”。

目标链路：

```text
ModelRequest
  -> RealProviderModelAdapter
  -> OpenAICompatibleProviderClient
  -> /v1/chat/completions
  -> internal provider payload
  -> SimpleProviderResponseNormalizer
  -> ModelAction
```

这一阶段已经把下面这些边界落到代码里：

- OpenAI-compatible request 怎么从 `ModelRequest` 生成
- OpenAI-compatible response 怎么转成内部 provider payload
- HTTP 发送能力怎么隔离，方便测试 fake transport
- provider registry 什么时候选择 OpenAI-compatible client
- tool call / tool result 怎么映射
- 以及给后续 Phase 6 streaming 铺好 provider 边界

---

## 2. 明确不做

本阶段仍然不做：

- OpenAI SDK
- Responses API
- Anthropic provider
- retry / fallback
- token budget
- billing 统计
- 真实网络测试
- CLI 参数
- JSON-RPC 协议修改
- TS Host 工具执行边界修改

实现后仍然要求：

- 默认 provider 是 `fake`
- API key 不写进配置文件
- provider 细节不进入 `TurnEngine`
- HTTP 细节不进入 `ProviderRegistry`

---

## 3. provider client

已新增：

```python
class OpenAICompatibleProviderClient(HttpProviderClient):
    supports_stream = True

    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping:
        ...
```

职责：

1. 把 `ModelRequest` 转成 OpenAI-compatible request body
2. 通过 `HttpTransport` 发送 HTTP POST
3. 把 response 转成内部 provider payload
4. 返回 `JsonMapping` 给 `RealProviderModelAdapter`

它不做：

- tool 执行
- `ModelAction` 构造
- tool catalog 校验
- turn 状态管理
- streaming delta 解析

这些继续由现有层负责：

- `RealProviderModelAdapter`
- `ProviderResponseNormalizer`
- `validate_tool_call_against_catalog(...)`
- `TurnEngine`

---

## 4. HTTP Transport 抽象

已新增一个薄 transport 层：

```python
class HttpTransport:
    def post_json(
        self,
        url: str,
        headers: JsonMapping,
        body: JsonMapping,
        timeout_s: float,
    ) -> JsonMapping:
        raise NotImplementedError
```

默认实现：

```python
class UrllibHttpTransport(HttpTransport):
    ...
```

设计原则：

- 使用 Python stdlib
- 不使用 `requests`
- 不使用 OpenAI SDK
- 测试通过 fake transport 注入
- HTTP error / timeout / invalid JSON 统一包装为 `ProviderClientError`

---

## 5. ProviderRegistry 接入

扩展：

```python
create_default_provider_registry(...)
```

规则：

- 永远注册 `fake`
- `GOD_CODE_PROVIDER=openai`
  - 使用 `OpenAICompatibleProviderClient`
  - 默认 `base_url = "https://api.openai.com/v1"`
- `GOD_CODE_PROVIDER=openai-compatible`
  - 使用 `OpenAICompatibleProviderClient`
  - 优先使用 `GOD_CODE_BASE_URL`
  - 未设置时默认 `https://api.openai.com/v1`
- 其他非 fake provider
  - 继续使用 `UnsupportedHttpProviderClient`
  - 保持 Phase 4 行为

继续沿用 Phase 4 provider env：

```text
GOD_CODE_PROVIDER
GOD_CODE_MODEL
GOD_CODE_API_KEY_ENV
GOD_CODE_BASE_URL
GOD_CODE_PROVIDER_TIMEOUT_S
```

API key 仍然不进入 `ProviderConfig`，只通过 `api_key_env` 间接读取。

---

## 6. Request Formatter

已新增：

```python
format_openai_messages(messages: Messages) -> list[JsonObject]
format_openai_tools(tools: list[ToolCatalogEntry]) -> list[JsonObject]
```

### 6.1 Message 映射

`user`：

```json
{
  "role": "user",
  "content": "..."
}
```

`assistant`：

```json
{
  "role": "assistant",
  "content": "..."
}
```

`tool_call`：

```json
{
  "role": "assistant",
  "content": null,
  "tool_calls": [
    {
      "id": "tool-call-id",
      "type": "function",
      "function": {
        "name": "Read",
        "arguments": "{\"path\":\"README.md\"}"
      }
    }
  ]
}
```

`tool_result`：

```json
{
  "role": "tool",
  "tool_call_id": "tool-call-id",
  "content": "{\"ok\":true,\"output\":{...}}"
}
```

### 6.2 tool_result 兼容补强

为了正确映射 `tool_result`，Phase 5 已补：

```text
TurnEngine 写入 tool_result message 时增加 tool_call_id
transcript replay 保留 tool_call_id
```

这是向后兼容字段：

- fake model 不受影响
- 现有 transcript replay 仍能读取旧记录
- OpenAI-compatible provider 可以正确把 tool result 归还给对应 tool call

---

## 7. Tool Schema Formatter

内置六个工具生成最小 JSON Schema：

- `Read`
- `Edit`
- `Bash`
- `ListFiles`
- `Search`
- `Write`

外部工具 fallback 到 generic object schema：

```json
{
  "type": "object",
  "additionalProperties": true
}
```

OpenAI-compatible request body 固定：

```json
{
  "model": "...",
  "messages": [],
  "tool_choice": "auto",
  "parallel_tool_calls": false
}
```

规则：

- 有 tools 时传 `tools`
- 没有 tools 时不传 `tools`
- `parallel_tool_calls=false`

原因：

当前 `TurnEngine` 一次只处理一个 `ModelAction`，所以多 tool calls 不应该被 provider 生成。

---

## 8. Response Mapper

新增：

```python
map_openai_chat_completion_to_provider_payload(raw: JsonMapping) -> JsonMapping
```

### 8.1 Assistant text

OpenAI-compatible response：

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "hello"
      }
    }
  ]
}
```

转成内部 payload：

```json
{
  "kind": "assistant",
  "content": "hello"
}
```

### 8.2 Tool call

OpenAI-compatible response：

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "tool_calls": [
          {
            "id": "tc1",
            "type": "function",
            "function": {
              "name": "Read",
              "arguments": "{\"path\":\"README.md\"}"
            }
          }
        ]
      }
    }
  ]
}
```

转成内部 payload：

```json
{
  "kind": "tool_call",
  "tool_call_id": "tc1",
  "tool_name": "Read",
  "input": {
    "path": "README.md"
  }
}
```

### 8.3 错误规则

这些情况抛 `ProviderResponseError`：

- 缺少 `choices`
- `choices` 为空
- 缺少 `message`
- 多个 `tool_calls`
- tool call 类型不是 `function`
- `function.name` 缺失
- `function.arguments` 不是合法 JSON object
- assistant content 不能转成字符串

这些情况抛或包装为 `ProviderClientError`：

- HTTP error
- timeout
- invalid JSON
- transport 异常

---

## 9. Streaming 边界

Phase 5 先把 non-streaming request / response 和 provider registry 边界落下来。Phase 6 已经在这条边界上继续实现：

- OpenAI-compatible SSE parser
- token delta -> `assistant_delta`
- tool call delta 聚合
- CLI streaming renderer

对应设计见：

- `design/PHASE_6_STREAMING_RENDERING.md`

---

## 10. 测试覆盖与验证

Phase 5 已补的 Python 测试包括：

Provider registry：

- `GOD_CODE_PROVIDER=openai` 注册 `OpenAICompatibleProviderClient`
- `GOD_CODE_PROVIDER=openai-compatible` 注册 `OpenAICompatibleProviderClient`
- 未知 provider 仍使用 `UnsupportedHttpProviderClient`

Request formatter：

- user message 映射正确
- assistant message 映射正确
- tool_call message 映射正确
- tool_result message 映射正确并包含 `tool_call_id`
- 内置工具 schema 正确
- 外部工具 fallback 到 generic schema

Response mapper：

- assistant response -> assistant payload
- tool call response -> tool_call payload
- 多 tool calls -> `ProviderResponseError`
- malformed choices -> `ProviderResponseError`
- function arguments 非 JSON object -> `ProviderResponseError`

Client：

- fake transport 收到正确 URL
- fake transport 收到 `Authorization: Bearer <key>`
- fake transport 收到 `Content-Type: application/json`
- request body 包含 `model/messages/tool_choice/parallel_tool_calls`
- HTTP error / timeout / invalid JSON -> `ProviderClientError`

回归：

- fake model read/list/search/write 仍通过
- `RealProviderModelAdapter` 现有测试继续通过
- `TurnEngine` tool_result 增加 `tool_call_id` 后 fake 流程不变
- transcript replay 保留 `tool_call_id`

TS 默认行为不改，但仍执行：

```bash
./tools/run-python-tests.sh
```

```bash
cd GOD-code/ts-host
npx tsc -p tsconfig.json --noEmit
npm test -- --run
```

Smoke：

```bash
cd GOD-code/ts-host
npm run build
cd ..
node ts-host/dist/cli/main.js rpc-smoke
node ts-host/dist/cli/main.js run "read README.md"
node ts-host/dist/cli/main.js run "bash printf ok"
```

Provider 相关测试只用 fake transport，不做真实网络 smoke。

---

## 11. 文档同步结果

Phase 5 已同步更新：

- `README.md`
- `ARCHITECTURE.md`
- `EXTENSION_POINTS.md`
- `protocol/README.md`

文档口径：

- Phase 5 是第一版真实 HTTP provider client
- 默认仍是 fake
- 使用 OpenAI-compatible Chat Completions 风格接口
- 不接 OpenAI SDK
- 不新增 runtime dependency
- API key 不写入配置文件
- 不做真实网络测试
- streaming 已在 Phase 6 继续实现；Phase 5 自身聚焦 provider client、formatter 和 response mapper

---

## 12. 默认决策

- Phase 5 第一版 provider 固定为 OpenAI-compatible Chat Completions
- 不实现 Responses API
- 不实现 Anthropic
- 不做真实网络测试
- 不新增 Python runtime dependency
- 不改 CLI
- 不改 JSON-RPC
- 当前 `TurnEngine` 仍只处理单个 tool call
- 多 tool calls 明确拒绝，而不是部分执行
