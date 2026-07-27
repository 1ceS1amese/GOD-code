# Phase395 Batch Tool Capability Negotiation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase394 新增 `execute_tools` 后，Python scheduler 默认假设 Host 支持新方法。对于独立运行 Python Engine、旧版 Host 或第三方协议实现，这会把原本可执行的 parallel-safe batch 变成 JSON-RPC method-not-found 错误。

## 目标

- 由 Host 在 `initialize.capabilities` 显式声明 `execute_tools`。
- Python Engine 保存本次 Host capability。
- 支持时使用 Phase394 batch RPC。
- 未声明时保持 Phase82 多个并发 `execute_tool` 请求的兼容 fallback。
- 调用方无需手动添加 bundled TS Host capability。

## 协商 contract

Bundled TS Host 会将调用方 capabilities 合并为：

```json
{
  "capabilities": {
    "execute_tools": true
  }
}
```

Python Engine 仅在字段严格为 `true` 时启用 batch request；字段缺失、false 或非法类型均视为 legacy Host。

## 执行语义

- `batch_request_supported=true`：parallel chunk -> 一个 `execute_tools`。
- `batch_request_supported=false`：parallel chunk -> bounded thread pool 中多个 `execute_tool`。
- serial-only wave 在两种模式下都使用 `execute_tool`。
- dependency graph、max parallel、结果 model order、event/transcript metadata 和 cancellation 语义不变。

## 验收标准

- TS Host 自动声明 capability，且不覆盖其他 caller capabilities。
- Engine initialize 保存 true/false 协商结果。
- configured server 将结果传入每个 turn 的 scheduler。
- batch-enabled 测试只观察到 `execute_tools`。
- legacy fallback 测试观察到并发 `execute_tool`，且 turn 成功。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- `GodCodeEngineProcess.initialize(...)` 自动合并 `execute_tools: true`。
- `GodCodeEngineServer` 保存 `_host_execute_tools_supported`。
- `ToolScheduler` 新增默认 false 的 `batch_request_supported`。
- 恢复并保留 bounded thread-pool legacy fallback。
- 新增 Host capability merge、Engine negotiation 和 legacy concurrency 测试。
