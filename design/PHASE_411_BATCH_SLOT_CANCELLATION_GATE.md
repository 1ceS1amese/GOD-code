# Phase411 Batch Slot Cancellation Gate

## 状态

代码、测试与文档已完成。

## 审计结论

Phase410 只在整个 batch 开始前检查 signal。`Promise.all(request.tool_calls.map(async ...))` 的 callbacks 逐项进入 executor；若前一个 executor 在同步启动阶段触发 cancel，后续 callbacks 原本仍会调用 executor。已发生的取消因此不能阻止尚未 dispatch 的 batch slots。

## 目标

- 每个 batch slot 在实际 ToolExecutor 调用前重新检查共享 turn signal。
- 已启动 slots 保留其真实结果或协作取消结果。
- 尚未启动 slots 直接返回 tool_cancelled。
- 保持 response 长度、位置和 order contract。
- 不把 batch 改为串行，正常无取消路径仍并发启动。

## Dispatch Contract

Batch 保留两层 gate：

1. Batch-level gate：进入 map 前处理已存在的 pre-cancel。
2. Slot-level gate：每个 async callback 调用 executor 前检查 signal。

如果 slot gate 观察到 abort，使用 Phase410 `cancelledBeforeDispatch`，不进入 executor。已经调用 executor 的 slot 不被结果覆盖，继续等待其 promise 并保留真实 result。

## Concurrency Boundary

JavaScript map callbacks 在各自第一次 await 前按顺序启动。因此某个 executor 同步触发 abort 时，后续 callback 能观察到；如果多个 executor 已经同步返回 promise 并启动，则它们属于 in-flight cancellation 范围，继续通过 AbortSignal 协作终止。

## 验收标准

- 三项 batch 中第一项启动时触发 cancel。
- executor invocation list 只有第一项。
- 第一项结果保持真实成功结果。
- 第二、三项按原位置返回 tool_cancelled。
- 无取消 batch 仍保持并发和有序结果。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- Batch map callback 增加 dispatch-time signal gate。
- 新增 mid-dispatch cancellation race contract test。
