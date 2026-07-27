# Phase394 TS Host Batch Tool API

## 状态

代码、协议示例、测试与文档已完成。

## 审计结论

Phase82/84/85 已形成 provider batch action、dependency graph 和 bounded parallel waves，但 Python scheduler 仍通过线程池发出多个独立 `execute_tool` 请求，TS Host 没有显式 batch contract。

## 目标

- 新增 Engine -> Host `execute_tools` JSON-RPC request。
- parallel-safe scheduler chunk 使用单个 batch request。
- Host 并发调用既有 `ToolExecutor`，继续复用 permission、audit、sandbox 和 cancellation。
- serial-only 和单工具执行继续走 `execute_tool`。
- 结果严格按请求顺序返回，不改变 transcript/event schema。

## 协议与执行边界

请求包含共享 `session_id`、`turn_id` 和非空 `tool_calls`；响应为等长 `results`。空 batch、非法字段或非对象 input 返回 JSON-RPC `-32602`。

Python dependency graph 仍决定 wave/chunk。Host 使用 `Promise.all` 执行同一 turn 的 calls，每个 call 仍进入同一个 Host `ToolExecutor`，同一 turn 共用 AbortSignal。结果数量不匹配会终止当前 turn。

## 验收标准

- TS protocol 导出 batch request/response 类型。
- Host 注册 handler，拒绝空或非法 batch。
- Host 并发启动 calls 并按请求顺序返回。
- Host 声明 capability 时，Python parallel-safe chunk 只发一个 `execute_tools`；Phase395 为未声明 capability 的旧 Host 补充并发 `execute_tool` fallback。
- serial-only wave 保持 `execute_tool`。
- first failure、cancelled result、scheduler metadata 和 model order 保持不变。
- 协议 examples、完整 TS/Python/integration 校验通过。

## 实现结果

- 新增 `ExecuteToolsRequest` / `ExecuteToolsResponse`。
- `GodCodeEngineProcess` 新增 batch handler 和 payload parser。
- `ToolScheduler._execute_parallel_chunk(...)` 改为显式 Host batch RPC。
- 新增 Host 并发/排序/非法 payload 测试，并更新 Python scheduler 测试。
- 新增 `protocol/examples/execute_tools.request.json` 和 `execute_tools.response.json`。
