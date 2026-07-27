# Phase399 Tool Action Boundary Validation

## 状态

代码、测试与文档已完成。

## 审计结论

标准 provider parsers 已使用非空字符串校验并根据 tool catalog 验证工具名，但自定义 `ModelAdapter` 可以直接构造 `ToolCallAction` / `ToolCallBatchAction` 绕过 provider boundary。TS Host 的 RPC parser 同样只检查字符串类型，允许空 session、turn、tool call ID 或工具名进入执行边界。

## 目标

- 在 TurnEngine 建立所有 model adapter 共用的最终 tool action validation。
- 同时覆盖单项与 batch action。
- 在 Host wire boundary 强制 request identifiers 和 tool names 非空。
- 非法 action 不写 transcript、不发 tool event、不调 scheduler 或 executor。

## Engine Contract

TurnEngine 在任何 tool side effect 前验证：

- `tool_call_id` 是非空字符串。
- batch 内 ID 唯一。
- `tool_name` 非空。
- `tool_name` 存在于当前 session tool catalog。

违反任一条件时返回 `invalid_action`，只保留 turn start/error/finish 生命周期。

## Host Contract

`execute_tool` 与 `execute_tools` 要求 `session_id`、`turn_id`、`tool_call_id` 和 `tool_name` 均为非空字符串。Batch 继续同时执行非空、容量和 ID 唯一性校验；非法 payload 返回 JSON-RPC `-32602`。

## 验收标准

- 自定义 adapter 的空 ID、空工具名和 catalog 外工具均在 Engine 内被拒绝。
- 非法 action 不触发 requester。
- Host 拒绝空 batch tool ID 和空 session ID。
- Phase398 duplicate ID 与此前 batch contract 保持通过。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- 新增 TurnEngine `_validate_tool_calls` 统一防御层。
- 单项和 batch action 均在 record/emit/dispatch 前调用该防御层。
- TS Host single/batch parsers 增加非空字符串约束。
- 新增自定义 adapter 三类无效 identity/catalog contract test。
