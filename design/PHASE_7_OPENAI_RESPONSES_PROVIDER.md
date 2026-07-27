# Phase 7：OpenAI Responses API provider

这份文档描述 Phase 7 已落地的 provider 方向：**在现有 Chat Completions 路径之外，新增一条 OpenAI Responses API 路径**。

Phase 7 不替换已经落地的 Phase 5 / Phase 6，而是在当前 provider 边界上继续往下扩。

> 继续沿 `providers/` 层扩真实模型能力，不把 HTTP / SSE / provider item 细节塞进 `TurnEngine`。

---

## 1. 目标

Phase 7 的目标固定为：

- 保留现有 `fake` 和 Chat Completions 路径
- 新增 OpenAI Responses API 的同步 + streaming provider client
- 继续复用 `RealProviderModelAdapter`
- 继续复用 `assistant_delta` 和 Phase 6 CLI 增量渲染
- 先只支持单个 tool call
- 为 Responses API 引入 Python 内部 provider 专属上下文

当前实现链路：

```text
TurnEngine
  -> PromptBuilder
  -> ModelRequest
  -> RealProviderModelAdapter
  -> OpenAIResponsesProviderClient
  -> /v1/responses
  -> internal provider payload
  -> ProviderResponseNormalizer
  -> ModelAction
```

---

## 2. Provider 接入面

Phase 7 不替换现有 provider family，而是新增一组名字清楚分开的 Responses provider：

- `openai`
- `openai-compatible`
- `openai-responses`
- `openai-compatible-responses`

默认规则固定为：

- `openai` / `openai-compatible` 继续走 Chat Completions
- `openai-responses` / `openai-compatible-responses` 走 `/v1/responses`
- `openai-responses` 默认 base URL 仍是 `https://api.openai.com/v1`
- `openai-compatible-responses` 优先 `GOD_CODE_BASE_URL`，未设置时也用 `https://api.openai.com/v1`

这样可以避免把 Phase 5 的 Chat Completions 路径静默切成 Responses API。

---

## 3. Python provider 边界

已新增：

```python
class OpenAIResponsesProviderClient(HttpProviderClient):
    supports_stream = True

    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping:
        ...

    def stream(self, request: ModelRequest, config: ProviderConfig) -> Iterator[JsonMapping]:
        ...
```

职责固定为：

- 把 `ModelRequest` 和 provider 专属上下文转成 Responses API 请求
- 发同步或 SSE 请求
- 把 Responses API 原始结果转成现有内部 provider payload
- 不直接构造 `ModelAction`
- 不进入 `TurnEngine`
- 不处理工具执行

保持不变：

- `TurnEngine` 不知道 Responses item 格式
- `RealProviderModelAdapter` 继续是 provider 到 engine 的唯一入口
- `assistant_delta` 继续复用现有事件

---

## 4. provider 专属上下文

Phase 7 的关键新增是 **Python 内部 provider state**。

为 Responses API 的多步 tool loop，已新增内部上下文字段：

```python
provider_context: JsonObject | None
```

现在挂在：

- `SessionState`
- `ModelRequest`
- transcript / replay

当前 shape 固定为：

```json
{
  "provider_name": "openai-responses",
  "response_id": "resp_xxx",
  "items": [ ... ]
}
```

规则固定为：

- 这是 Python 内部状态
- 不进入 JSON-RPC wire contract
- 不暴露给 TS Host
- 只供 Responses API provider client 使用
- 非 Responses provider 路径默认忽略

设计原因：

- Responses API 可能返回 message / function_call / reasoning 等 output items
- 下一步 tool loop 需要把这些 items 原样回放
- 仅靠当前通用 `messages` 不够完整
- 但 provider 专属 item 又不应该泄漏到 TS 或协议层

对应 transcript 设计：

- 新增 transcript entry type：`provider_context`
- replay helper 恢复 `provider_context`
- 旧 transcript 没这个字段时仍可正常 replay

---

## 5. Request / Response / Streaming

## 5.1 Request formatter

新增 Responses formatter helper，负责把：

- `messages`
- `tools`
- `provider_context`

转成 `/v1/responses` 请求体。

规则固定为：

- user / assistant 继续从通用 message 映射
- `tool_call` / `tool_result` 继续用 `tool_call_id` 关联
- 如果存在 `provider_context.items`，优先把这些 opaque items 接回输入链
- 有 tools 时继续传 tool schema
- 当前仍固定单工具调用语义

## 5.2 Response mapper

Responses API 结果统一映射成现有内部 payload：

- assistant text -> `{"kind":"assistant","content":"..."}`
- 单个 function_call -> `{"kind":"tool_call","tool_call_id":"...","tool_name":"...","input":{...}}`

同时把这些 item 保存进 `provider_context.items`：

- assistant message items
- function_call items
- reasoning / 其他需要回放的 opaque items

明确拒绝：

- 多个 function calls
- 无法归一成单个 final action 的 response
- tool call 参数不是合法 JSON object
- 当前边界不支持的 output item 组合

## 5.3 Streaming

Phase 7 直接把 Responses 的同步 + streaming 一起设计清楚。

保持的边界：

- provider streaming 只向上暴露：
  - `AssistantDelta`
  - 完整 `AssistantMessageAction`
  - 完整 `ToolCallAction`
- Responses 的 SSE item / delta 聚合留在 `providers/` 层
- 继续复用 Phase 6 CLI renderer
- `TurnEngine` 不处理 Responses item 粒度事件

首版限制固定为：

- 只支持单个 tool call 聚合
- 不做多 tool call 调度
- 不做更宽的 multimodal / file / image item 设计
- 不做 reasoning 可视化，只做 opaque replay

---

## 6. Public APIs / Interfaces

Phase 7 已落地这些接口，不改 JSON-RPC：

```python
class OpenAIResponsesProviderClient(HttpProviderClient): ...
```

```python
@dataclass(slots=True)
class ModelRequest:
    messages: Messages
    tools: list[ToolCatalogEntry]
    options: ModelOptions
    provider_context: JsonObject | None = None
```

```python
@dataclass(slots=True)
class SessionState:
    ...
    provider_context: JsonObject | None = None
```

新增内部 transcript / replay 能力：

- `provider_context` transcript entry
- replay 恢复 `provider_context`

保持不变：

- `ModelAdapter.next_action(request)`
- `StreamingModelAdapter.stream_actions(request)`
- `RealProviderModelAdapter`
- `HostToolRegistry.executeRequest(...)`
- `assistant_delta`
- `tool_call_id`
- TS Host 工具执行边界
- JSON-RPC methods

---

## 7. 测试覆盖

Phase 7 实现测试覆盖：

### Python

- provider registry：
  - `openai-responses`
  - `openai-compatible-responses`
- request formatter：
  - 通用 messages 映射
  - `tool_call_id` / tool result 关联
  - `provider_context.items` 回放
- response mapper：
  - assistant response
  - 单 function_call response
  - reasoning / opaque items 保存到 `provider_context`
  - 多 function calls -> `ProviderResponseError`
- streaming：
  - Responses SSE delta -> `AssistantDelta`
  - final assistant / final tool_call
  - stream 结束后 `provider_context` 正确更新
- engine / transcript：
  - `provider_context` 写入 session / transcript / replay
  - 旧 transcript 不含 `provider_context` 仍兼容
- 回归：
  - fake model 不受影响
  - Chat Completions provider 不受影响
  - Phase 6 CLI streaming 路径不回归

### TS

- `initialize.supported_model_adapters` 能列出新的 responses provider 名
- `assistant_delta` 消费逻辑不变
- CLI renderer 不因 Responses provider 引入重复输出或乱序

### Smoke

回归时继续至少验证：

```bash
./tools/run-python-tests.sh
cd GOD-code/ts-host
npx tsc -p tsconfig.json --noEmit
npm test -- --run
node ts-host/dist/cli/main.js rpc-smoke
node ts-host/dist/cli/main.js run "read README.md"
node ts-host/dist/cli/main.js run "bash printf ok"
```

---

## 8. 默认决策

- Phase 7 已完成基础代码实现
- 主题固定为 OpenAI Responses API provider
- 不同时设计 Anthropic
- 现有 Chat Completions provider 继续保留，不做就地替换
- 只支持单个 tool call，多 tool calls 继续明确拒绝
- `provider_context` 是 Python 内部状态，不进入 JSON-RPC
- 不做 retry / fallback / token budget / compaction / rate-limit policy
- 不扩 REPL / TUI / MCP runtime / plugin runtime

官方参考：

- `https://platform.openai.com/docs/api-reference/responses`
- `https://platform.openai.com/docs/guides/responses-vs-chat-completions`
- `https://platform.openai.com/docs/api-reference/responses-streaming`
