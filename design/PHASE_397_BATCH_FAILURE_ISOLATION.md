# Phase397 Batch Failure Isolation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase394-Phase396 已完成 batch RPC、能力协商和容量限制，但 TS Host 仍直接使用 `Promise.all` 聚合 executor promise。任一 executor 抛异常时，整个 `execute_tools` request 会被 JSON-RPC 拒绝，同批已经成功的结果也无法返回给 Engine。

## 目标

- 将 Host executor 异常隔离到对应 batch result slot。
- 保持所有 batch 项并发启动和原始请求顺序。
- 对异常和非法 executor result 返回稳定的结构化错误。
- 不改变单项 `execute_tool` 的既有 RPC 错误语义。

## Contract

`execute_tools` 为每个 tool call 独立等待 executor。正常返回值经过 `asToolExecutionResult` 校验；executor 抛异常或返回非法 payload 时，仅对应位置返回：

```json
{
  "ok": false,
  "error": {
    "code": "tool_executor_failed",
    "message": "executor error message"
  }
}
```

其他位置的成功或业务失败结果不受影响。返回数组长度和位置仍与请求数组一一对应。

## 验收标准

- 一个三项 batch 中间项抛异常时，首尾成功结果仍被保留。
- 失败项使用 `tool_executor_failed`，并保持在原始位置。
- batch 仍并发执行，结果仍按请求顺序返回。
- 单项 handler、batch size negotiation 和取消 signal contract 不变。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- Host 在每个 batch promise 内建立独立的 validation/error boundary。
- 移除 `execute_tool` parser 中仅用于维持 import 的无效结果构造。
- 新增 mixed success/throw/success 的 Host contract test。
