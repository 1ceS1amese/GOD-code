# Phase412 Cancellation Result Precedence

## 状态

代码、测试与文档已完成。

## 审计结论

Phase410-411 防止已知取消后的新 dispatch，但忽略 AbortSignal 的 executor 可能在取消后仍返回 success/error。Host 原本在 await 完成后直接提交该 result，Engine 会观察到已取消 turn 的成功工具结果，造成 cancellation decision 与 tool result 矛盾。

## 目标

- 在 executor result commit 前重新检查共享 turn signal。
- Cancellation 一旦发生，对尚未返回 Engine 的 slot 具有最终优先级。
- Single 与 batch 使用一致语义。
- Executor resolve/reject 都不能覆盖已知 cancellation。
- 未取消执行继续保留原始 result/exception isolation 行为。

## Result-Time Gate

Single/batch executor await 后，在 validation 或 exception mapping 前检查 signal：

- aborted：返回 `tool_cancelled`，消息说明执行期间取消。
- not aborted：正常验证 result；batch exception 继续映射 `tool_executor_failed`。

Batch catch 路径也先检查 signal，因此 executor 因 abort 抛异常时不会误报 infrastructure failure。

## Precedence

优先级为：

1. 已知 turn cancellation
2. Valid executor result
3. Executor throw / malformed result mapping

该规则只改变 Engine 可见结果，不宣称可回滚已发生的外部副作用；工具实现仍应尽快响应 AbortSignal。

## 验收标准

- In-flight single executor 在 cancel 后返回 success，Host 提交 tool_cancelled。
- 两个已启动 batch executors 在 cancel 后返回 success，两个 slots 均 tool_cancelled。
- Mid-dispatch 第一项触发取消时，第一项晚结果也被 cancellation 覆盖，后续未启动 slots 仍 cancelled。
- 未取消 success/error 行为不变。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- Single handler 增加 post-await cancellation gate。
- Batch success/catch paths 增加 post-await/pre-map gate。
- 新增 deferred single+batch late-result race test。
