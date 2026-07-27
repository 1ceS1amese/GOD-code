# Phase400 Tool Result Schema Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase397 要求 batch 隔离 executor 抛异常和非法 result，但 TS `asToolExecutionResult` 只验证顶层 `ok` boolean。数组 `output`、空 error code/message 或非对象 details 仍会穿过 Host，随后在 Python parser 中使整个执行路径失败。单项 `execute_tool` handler 甚至没有调用该 validator。

## 目标

- 让 TS runtime validator 与 Python `parse_tool_execution_result` 的结构约束对齐。
- single 与 batch handler 共用相同 result schema boundary。
- batch 中的 malformed result 继续按 Phase397 隔离为对应位置失败。
- 不改变合法成功、业务失败或单项 executor throw 的既有语义。

## Result Contract

合法 `ToolExecutionResult` 必须满足：

- 顶层是 object，`ok` 是 boolean。
- `output` 缺失或为 object，不能是 array/null/primitive。
- `error` 缺失或为 object。
- error `code` 和 `message` 是非空字符串。
- error `details` 缺失或为 object。

额外字段继续允许；不新增 `ok` 与 output/error presence 的强耦合，以保持当前协议兼容性。

## Handler 行为

- `execute_tool`：malformed result 导致原有 RPC error boundary。
- `execute_tools`：malformed result 被该 slot 的 Phase397 catch 转换为 `tool_executor_failed`，其他 slot 不受影响。

## 验收标准

- validator 接受合法 success/failure payload。
- 拒绝非 boolean ok、数组 output、空 error code/message 和数组 details。
- serial handler 不返回 malformed payload。
- batch handler 将 malformed payload 隔离为结构化失败。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- 扩展 `asToolExecutionResult` 并新增 error payload validator。
- single Host handler 接入相同 validator。
- 新增独立 protocol validator 测试文件和 single/batch handler contract test。
