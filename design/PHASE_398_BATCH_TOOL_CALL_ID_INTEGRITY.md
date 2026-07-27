# Phase398 Batch Tool Call ID Integrity

## 状态

代码、测试与文档已完成。

## 审计结论

Provider normalizers 已拒绝同一响应中的重复 `tool_call_id`，但自定义 `ModelAdapter` 可以直接构造 `ToolCallBatchAction` 绕过 normalizer；TS Host 的 `execute_tools` parser 也未强制 ID 唯一。重复 ID 会使 event、transcript、provider history、取消与结果关联产生歧义。

## 目标

- 在 Python TurnEngine 执行或记录 batch 前验证 ID 唯一性。
- 在 TS Host wire boundary 再次验证 ID 唯一性。
- 非法 batch 不产生 tool request event、不写入 tool call transcript，也不触发 Host executor。
- 保持合法 batch 的调度、容量、异常隔离和结果顺序 contract 不变。

## Contract

同一个 `ToolCallBatchAction` / `execute_tools` request 内，每个 `tool_call_id` 必须唯一。

- Engine 检测到重复值时返回 `invalid_action`，并只发射 turn error/finalization events。
- Host 检测到重复值时返回 JSON-RPC `-32602` invalid params。
- provider normalizer 的既有重复 ID 校验继续作为更早的防线。

## 验收标准

- 自定义 adapter 返回两个相同 ID 时，scheduler requester 从未被调用。
- 重复 ID batch 不产生 `tool_call_requested` 或 `tool_result_received`。
- 直接调用 Host batch handler 时，重复 ID payload 被拒绝。
- 合法 batch、Phase396 capacity 和 Phase397 mixed-result 行为保持通过。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- TurnEngine 在 batch plan、record 和 emit 前执行唯一性检查。
- Host parser 在结构/容量检查之外增加 batch ID set cardinality 检查。
- 新增 Engine no-dispatch contract test，并扩展 Host malformed batch test。
