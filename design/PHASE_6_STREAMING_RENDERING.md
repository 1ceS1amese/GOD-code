# Phase 6：SSE streaming 与 CLI 增量渲染

这份文档描述 Phase 6 已落地的代码边界，以及后续继续扩 streaming 时应沿用的方式。

Phase 6 的主题是：

> 把真实 provider 的流式输出，接到 Python Engine 的 `assistant_delta`，再接到 TS Host CLI 的增量渲染。

本阶段保持这几个边界：

- 默认模型仍然是 `fake`
- JSON-RPC wire contract 不改
- 工具执行边界不改
- 不做 REPL / TUI
- 不做多工具并发
- 不新增真实 SDK 依赖

---

## 1. 目标链路

Phase 6 已经打通这条链路：

```text
OpenAI-compatible SSE
  -> Python provider streaming parser
  -> provider 层 delta / tool-call 聚合
  -> RealProviderModelAdapter.stream_actions(...)
  -> TurnEngine 发 assistant_delta
  -> JSON-RPC god_code_event
  -> TS Host renderer
  -> CLI 增量输出
```

当前已经做到：

- 真实 provider 可以输出 token/delta 级文本
- Python Engine 继续只看到 `AssistantDelta` 或完整 model action
- TS Host CLI 能边收边打印
- 最终 `assistant_message` 不重复整段输出

---

## 2. Python 侧实现边界

### 2.1 OpenAI-compatible streaming client

`OpenAICompatibleProviderClient` 现在已经支持 streaming：

```python
class OpenAICompatibleProviderClient(HttpProviderClient):
    supports_stream = True

    def stream(self, request: ModelRequest, config: ProviderConfig) -> Iterator[JsonMapping]:
        ...
```

行为：

- 复用现有 Chat Completions request formatter
- 请求体增加 `"stream": true`
- 走 `/v1/chat/completions`
- 只处理 OpenAI-compatible SSE chunk
- 不引入 OpenAI SDK
- 不新增 Python runtime dependency

### 2.2 HTTP transport

`HttpTransport` 现在已经有 SSE 入口：

```python
class HttpTransport:
    def post_sse(
        self,
        url: str,
        headers: JsonMapping,
        body: JsonMapping,
        timeout_s: float,
    ) -> Iterator[str]:
        ...
```

实现要求：

- 默认实现继续使用 Python stdlib
- HTTP / timeout / invalid UTF-8 统一包装为 `ProviderClientError`
- 非 `text/event-stream` 响应返回结构化错误
- 单测使用 fake transport，不做真实网络测试

### 2.3 SSE parser 与 tool-call 聚合

SSE parser 留在 `providers/` 层，不进入 `TurnEngine`。

provider streaming 最终只向上暴露：

- `{"kind": "delta", "text": "..."}`
- `{"kind": "assistant", "content": "..."}`
- `{"kind": "tool_call", ...}`

tool call delta 必须先聚合成完整 tool call：

- 累积 `id`
- 累积 `function.name`
- 累积 `function.arguments`
- stream 结束后解析 arguments JSON

约束：

- 只支持单个 tool call
- 多个 tool calls 明确抛 `ProviderResponseError`
- arguments 必须是 JSON object
- stream 提前结束且没有 final action 时抛 `ProviderResponseError`

---

## 3. Python Engine 边界

`RealProviderModelAdapter.stream_actions(...)` 继续作为 provider streaming 到 engine 的唯一入口。

设计行为：

```text
client.stream(...)
  -> kind=delta -> AssistantDelta
  -> kind=assistant -> AssistantMessageAction
  -> kind=tool_call -> ToolCallAction
```

`TurnEngine` 不需要知道：

- SSE 行格式
- provider chunk 结构
- tool call delta 拼接规则

取消语义沿用 Phase 2：

- `TurnEngine` 在消费 stream event 时检查 cancel flag
- cancel 后不再发最终 assistant message
- 最终发 `turn_finished(status="cancelled")`

---

## 4. TS Host 侧设计

Phase 6 新增了一个轻量 CLI renderer，不做完整 UI。

当前接口形态可以概括为：

```ts
interface TerminalRenderer {
  onAssistantDelta(text: string): void;
  onAssistantMessage(content: string): void;
  onToolCallRequested(): void;
  finish(): void;
}
```

行为：

- 收到 `assistant_delta` 时立即输出文本
- 收到最终 `assistant_message` 时与已输出 delta 去重
- 收到 `tool_call_requested` 时结束当前输出行
- 收到 `turn_finished` 时完成本轮渲染

不做：

- REPL
- TUI
- spinner
- 交互式 UI
- 多 session UI 状态

---

## 5. 协议边界

Phase 6 没有新增 JSON-RPC 方法。

继续复用现有事件：

```text
god_code_event: assistant_delta
god_code_event: assistant_message
god_code_event: tool_call_requested
god_code_event: turn_finished
```

`assistant_delta` payload 保持：

```json
{
  "delta": {
    "text": "..."
  }
}
```

保持不变：

- `initialize`
- `create_session`
- `submit_turn`
- `execute_tool`
- `cancel_tool_execution`
- `ToolExecutionResult`
- `ModelRequest`
- `ModelAdapter`
- `HostToolRegistry.executeRequest(...)`

---

## 6. 测试覆盖

Phase 6 已补的测试重点包括：

Python：

- SSE parser：单个 text delta、多个 text delta、`[DONE]`、malformed event
- tool-call aggregator：name 分段、arguments 分段、单 tool call 成功、多 tool calls 报错
- `RealProviderModelAdapter.stream_actions(...)`：delta、final assistant、final tool call、stream 提前结束
- cancel 回归：streaming 过程中取消后不发最终 assistant message

TS：

- renderer：delta 立即输出、final message 去重、无 delta 时打印 final message
- tool call 事件：能正确结束当前输出行
- engine process：能接收 `assistant_delta`，`turn_finished` 仍正常结束回合

回归命令：

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
node ts-host/dist/cli/main.js rpc-smoke
node ts-host/dist/cli/main.js run "read README.md"
node ts-host/dist/cli/main.js run "bash printf ok"
```

---

## 7. 默认决策与后续边界

- 第一版只实现 OpenAI-compatible Chat Completions SSE
- 不设计 Anthropic streaming
- 不设计 Responses API
- 不做 retry / fallback / token budget
- 不做真实网络测试
- 不改 JSON-RPC
- 不改工具执行边界

后续如果继续扩：

- Anthropic streaming
- Responses API
- 更复杂的 terminal UI
- 更复杂的 tool-call delta 聚合

也应该继续沿用：

```text
provider client / parser / aggregator
  -> provider payload
  -> RealProviderModelAdapter
  -> TurnEngine
  -> god_code_event
  -> TS Host renderer
```
- 不改工具执行边界
- 默认 fake 路径继续不受影响

## Phase590 后续衔接

Phase590把本阶段`TurnRenderer.finish()`接入headless composite finalizer。Finish同步throw不再阻断prepared-host close或engine stop；run operation已有primary时renderer secondary只被消费，无primary时仍保持renderer优先的existing cleanup failure语义。Streaming event、delta rendering、public renderer interface和JSON-RPC contract均不变；当时保留的REPL renderer lifecycle已由Phase591闭合。

## Phase591 后续衔接

Phase591把`TurnRenderer.finish()`继续接入REPL turn ownership与generation cleanup。Turn-finished renderer failure现在作为对应submit outcome返回，submit RPC或engine-exit primary存在时renderer secondary只被消费；stop cleanup仍按renderer、host、engine priority收集all-settled outcome。Renderer public interface、streaming event、CLI输出和JSON-RPC contract均未改变。
