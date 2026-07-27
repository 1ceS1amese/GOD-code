# Phase 4：真实模型 provider 接入骨架

这份文档对应的运行骨架已经实现。

Phase 4 的主题是：

> 在不破坏现有 fake model、工具调用链和 JSON-RPC 协议的前提下，给真实模型 provider 留出清晰接入口。

默认行为仍然是 `fake`。没有配置真实 provider 时，现有 smoke 继续只走 fake model。
当前不接真实厂商 SDK，也不发真实 HTTP 请求；默认真实 provider client 是一个明确报错的占位实现。

---

## 1. 本阶段目标

Phase 4 要解决的是“真实 provider 放在哪里”：

- provider 配置不进入 `TurnEngine`
- HTTP / SDK 细节不进入 `TurnEngine`
- provider 原始响应必须先 normalizer
- provider 返回 tool call 时必须校验 tool catalog
- streaming provider 继续复用 `assistant_delta`
- 默认 CLI 行为不变

当前边界保持：

```text
TurnEngine
  -> ModelRequest
  -> ModelAdapter
  -> ProviderModelAdapter
  -> HttpProviderClient
  -> ProviderResponseNormalizer
  -> ModelAction
```

---

## 2. 已实现与明确不做

已实现：

- `ProviderConfig`
- `ProviderConfigError`
- `HttpProviderClient`
- `ProviderClientError`
- `UnsupportedHttpProviderClient`
- `RealProviderModelAdapter`
- `create_default_provider_registry(...)` 环境变量注册逻辑
- fake HTTP client 测试覆盖同步和 streaming 路径

明确不做：

- 真实 Anthropic / OpenAI SDK 依赖
- 真实 HTTP provider 实现
- 真实网络测试
- MCP transport
- plugin runtime
- REPL / TUI
- JSON-RPC 协议修改
- CLI 参数扩展
- 多 provider fallback
- retry / rate limit
- token budget
- billing 统计
- 明文 API key 配置文件

---

## 3. Provider 配置层

新增 Python 配置模型：

```python
@dataclass(slots=True)
class ProviderConfig:
    name: str
    model: str
    api_key_env: str | None = None
    base_url: str | None = None
    timeout_s: float = 30.0
```

### 3.1 配置来源

当前只从环境变量读取：

```text
GOD_CODE_PROVIDER
GOD_CODE_MODEL
GOD_CODE_API_KEY_ENV
GOD_CODE_BASE_URL
GOD_CODE_PROVIDER_TIMEOUT_S
```

规则：

- 没有 `GOD_CODE_PROVIDER`：不注册真实 provider，只注册 `fake`
- `GOD_CODE_PROVIDER=fake`：等同默认 fake，不要求 model/key
- 有非 fake `GOD_CODE_PROVIDER`：尝试注册对应真实 provider adapter
- `GOD_CODE_MODEL` 缺失：返回 `ProviderConfigError`
- `GOD_CODE_API_KEY_ENV` 缺失但 provider 需要 key：返回 `ProviderConfigError`
- `GOD_CODE_API_KEY_ENV` 指向的环境变量不存在或为空：返回 `ProviderConfigError`
- `GOD_CODE_PROVIDER_TIMEOUT_S` 缺省为 `30.0`，必须大于 0

API key 不直接放进 `ProviderConfig`，只通过 `api_key_env` 间接读取。

### 3.2 错误类型

已实现：

```python
class ProviderConfigError(ValueError):
    pass
```

用途：

- 配置字段缺失
- timeout 不是数字
- API key env 缺失
- provider 名称不支持

---

## 4. HTTP provider client 抽象

已实现一个薄接口，隔离真实 HTTP / SDK 细节：

```python
class HttpProviderClient:
    supports_stream = False

    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping:
        raise NotImplementedError

    def stream(self, request: ModelRequest, config: ProviderConfig) -> Iterator[JsonMapping]:
        raise NotImplementedError
```

设计原则：

- `TurnEngine` 不知道 HTTP
- `ProviderRegistry` 不知道 HTTP
- `RealProviderModelAdapter` 调用 client
- 测试使用 fake client
- 第一版不引入真实 SDK

错误类型：

```python
class ProviderClientError(RuntimeError):
    pass
```

用于包装：

- HTTP client 异常
- timeout
- provider 返回不可解析 payload
- streaming 中断

默认实现 `UnsupportedHttpProviderClient` 不发网络请求；如果被真实 provider 调用，会返回明确的 `ProviderClientError`。

---

## 5. RealProviderModelAdapter

已新增真实 provider adapter 骨架：

```python
class RealProviderModelAdapter(ProviderModelAdapter, StreamingModelAdapter):
    def next_action(self, request: ModelRequest) -> ModelAction:
        ...

    def stream_actions(self, request: ModelRequest) -> Iterator[ModelStreamEvent]:
        ...
```

### 5.1 同步路径

```text
next_action(request)
  -> client.complete(request, config)
  -> normalizer.normalize(raw)
  -> validate_tool_call_against_catalog(action, request.tools)
  -> return action
```

要求：

- assistant payload 转成 `AssistantMessageAction`
- tool call payload 转成 `ToolCallAction`
- unknown tool 继续用 `ProviderResponseError`
- malformed payload 继续用 `ProviderResponseError`
- client 异常包装为 `ProviderClientError`

### 5.2 streaming 路径

```text
stream_actions(request)
  -> client.stream(request, config)
  -> provider delta -> AssistantDelta
  -> final payload -> ModelAction
```

要求：

- delta 事件转成 `AssistantDelta`
- 最后仍然必须产出完整 `AssistantMessageAction` 或 `ToolCallAction`
- final action 仍然要过 `validate_tool_call_against_catalog(...)`
- client 不支持 streaming 时，可以 fallback 到 `next_action(request)`

不在 adapter 里处理取消；取消仍由 `TurnEngine` 的 streaming loop 检查。

---

## 6. ProviderRegistry 集成

当前已有：

```python
ProviderRegistry
create_default_provider_registry()
```

Phase 4 已扩展默认创建逻辑：

```text
create_default_provider_registry()
  -> register("fake", FakeModelAdapter())
  -> read ProviderConfig from env
  -> if configured, register(real_provider_name, RealProviderModelAdapter(...))
```

行为：

- 永远注册 `fake`
- 未配置真实 provider 时，不报错
- 配置真实 provider 后才注册真实 adapter，默认 client 是 `UnsupportedHttpProviderClient`
- `create_session(model_adapter="fake")` 不变
- `create_session(model_adapter="<real-provider>")` 使用真实 adapter
- 未注册 provider 继续返回结构化 RPC error

暂时不做：

- `turn_options.provider` 动态切换 provider
- session 内多 provider fallback
- provider priority
- provider health check

---

## 7. Provider payload 约定

第一版 normalizer 继续使用当前简单 payload：

```json
{
  "kind": "assistant",
  "content": "hello"
}
```

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

streaming payload 建议：

```json
{
  "kind": "delta",
  "text": "partial text"
}
```

final payload 仍然使用 assistant / tool_call 两类。

后续接具体厂商时，厂商原始响应先转成这套内部 payload，再交给 `ProviderResponseNormalizer`。

---

## 8. 测试计划

### 8.1 Python

Provider config：

- 无 provider 环境变量时 registry 只有 fake
- `GOD_CODE_PROVIDER=fake` 不要求 model/key
- 设置 provider 环境变量后注册真实 provider adapter
- 缺少 model 返回 `ProviderConfigError`
- 缺少 API key env 返回 `ProviderConfigError`
- API key env 值缺失返回 `ProviderConfigError`
- timeout 非数字或小于等于 0 返回 `ProviderConfigError`

ProviderRegistry：

- 默认返回 fake
- 注册真实 adapter 后可通过 `get(...)` 获取
- 未注册 provider 抛 `ProviderRegistryError`

RealProviderModelAdapter：

- fake HTTP client 返回 assistant payload -> `AssistantMessageAction`
- fake HTTP client 返回 tool call payload -> `ToolCallAction`
- unknown tool call 被拒绝
- malformed payload 抛 `ProviderResponseError`
- client error 包装成 `ProviderClientError`
- streaming delta 转成 `AssistantDelta`
- streaming final assistant message 正确返回

TurnEngine 回归：

- fake model read / list / search / write 仍通过
- `turn_options.stream=true` 行为不变
- cancel 行为不变

### 8.2 TS

本阶段默认不改 TS 运行代码，只要求现有测试继续通过：

```bash
cd GOD-code/ts-host
npx tsc -p tsconfig.json --noEmit
npm test -- --run
```

### 8.3 Smoke

后续实现后继续跑：

```bash
./tools/run-python-tests.sh
```

```bash
cd GOD-code/ts-host
npm run build
cd ..
node ts-host/dist/cli/main.js rpc-smoke
node ts-host/dist/cli/main.js run "read README.md"
node ts-host/dist/cli/main.js run "bash printf ok"
```

---

## 9. 文档入口

继续接真实厂商时，同步更新：

- `README.md`
- `ARCHITECTURE.md`
- `EXTENSION_POINTS.md`
- `protocol/README.md`，如果 provider 影响协议示例

当前 Phase 4 不改 wire contract，所以 protocol 暂时只需要说明模型 provider 不影响 JSON-RPC 形状。

---

## 10. 默认决策

- 默认 provider 仍然是 `fake`
- 默认不要求 API key
- 默认不引入真实 SDK
- 默认不做真实网络测试
- 默认真实 provider client 不发网络，只明确报错
- provider 只能通过 adapter/client 层接入
- `TurnEngine` 不直接导入任何 provider SDK / HTTP client
- `turn_options.provider` 暂不动态切换 provider
- 后续真实 provider 建议先接一个厂商，并继续用 fake HTTP client 覆盖 adapter 测试
