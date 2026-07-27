# Phase406 Tool Input JSON Safety

## 状态

代码、测试与文档已完成。

## 审计结论

Phase405 保障了 Host -> Engine result 方向，但 Engine -> Host 的 tool input 仍只检查顶层 object。自定义 ModelAdapter 可以构造 arbitrary object、NaN 或循环 input，在 transcript/event 写入或 request JSON serialization 时失败；TS handler 的直接调用也可携带 undefined、BigInt 或 cycle。

## 目标

- 请求与结果方向复用同一递归 JSON-safe object contract。
- Engine 在 transcript/event/scheduler side effects 前拒绝非法 input。
- Host single/batch wire parser 在 executor 调用前执行深层校验。
- 合法 provider/fake tool calls 与现有 input schema 验证保持不变。

## Engine Contract

TurnEngine 的 adapter-independent tool action validation 新增 input 检查。`ToolCall.input` 必须是 string-keyed JSON-safe object；违反时返回 `invalid_action`，不记录 tool call、不发 tool event、不调用 scheduler/requester。

## Host Contract

`execute_tool.input` 与每个 `execute_tools.tool_calls[].input` 使用 `isJsonObject`，而不是浅层 `isRecord`。直接 handler 调用中的 undefined、BigInt、function、NaN、语言对象实例和 cycle 均返回 invalid params。

## 验收标准

- 自定义 adapter 的 arbitrary object、NaN、cycle input 在 Engine pre-dispatch 被拒绝。
- 非法 input 不产生 tool side effect。
- Host batch parser 拒绝 nested undefined 和 cycle。
- 合法工具 input、batch capacity/identity 和 result contracts 保持通过。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- Python JSON validator 提升为可复用 `is_json_value` / `is_json_object`。
- TurnEngine 统一 action validator 接入 `is_json_object`。
- TS single/batch parsers 接入 Phase405 `isJsonObject`。
- Engine 和 Host 两侧专项 tests 已补齐。
