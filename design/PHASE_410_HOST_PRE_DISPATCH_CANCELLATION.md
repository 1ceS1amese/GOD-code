# Phase410 Host Pre-Dispatch Cancellation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase409 保存了 pre-aborted signal，但 Host 仍无条件调用 ToolExecutor。取消是否生效取决于内置或第三方 executor 是否主动检查 AbortSignal；忽略 signal 的 executor 仍会执行已取消工具，因此 tombstone 只传递意图而未在 Host dispatch boundary 强制。

## 目标

- Host 在调用任何 ToolExecutor 前检查 turn signal。
- Pre-cancelled single request 返回结构化 tool_cancelled。
- Pre-cancelled batch 为每个请求位置返回 tool_cancelled。
- 不进入 executor、policy、audit、MCP/plugin 或真实系统调用。
- 执行开始后的 cancellation 继续通过共享 signal 协作传播。

## Dispatch Contract

Single/batch handler 完成 payload validation 与 controller lookup 后立即检查 `signal.aborted`。若已取消，返回：

```json
{
  "ok": false,
  "error": {
    "code": "tool_cancelled",
    "message": "Turn was cancelled before Host tool dispatch."
  }
}
```

Batch response 长度和顺序仍与 request 一致，每个 slot 获得独立 result object。

## Scope

- Pre-dispatch cancellation：Host 强制，不依赖 executor。
- In-flight cancellation：继续依赖 AbortSignal，由 Bash/MCP/plugin/自定义 executor 协作处理。
- 无 ToolExecutor 注册：仍属于 Host configuration error，优先返回原有 RPC error。

## 验收标准

- cancel 先到后，single handler 不调用 executor并返回 tool_cancelled。
- 同一状态下 batch handler 零 executor 调用，全部 slots cancelled。
- Phase408 session isolation 和 Phase409 tombstone cleanup 保持通过。
- 正常未取消执行行为不变。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- Single/batch handlers 增加共同 pre-dispatch signal check。
- 新增 `cancelledBeforeDispatch` 结构化 result factory。
- 扩展 Phase409 race test，直接证明 executor invocation count 为零。
