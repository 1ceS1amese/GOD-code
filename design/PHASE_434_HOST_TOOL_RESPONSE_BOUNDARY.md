# Phase434 Host Tool Response Schema Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Host 已在自身 executor 出口验证 ToolExecutionResult，但 Python Engine 仍需要独立的跨进程 ingress boundary。现有 parser 只检查 dict/字段组合，nested non-JSON output/details、空白 error identity 和顶层 non-JSON extension 可穿过 direct requester 或非 bundled Host。Batch scheduler 还会逐 slot 解析并立即写 scheduled_results，后部 malformed slot 可能形成部分提交。

## 目标

- Serial execute_tool response 通过共享 strict parser。
- ToolExecutionResult 整体必须递归 JSON-safe。
- error code/message 保持 non-blank construction invariant。
- Batch response envelope 必须是 JSON-safe object。
- results 必须是与 request slot 数量精确一致的 array。
- Batch 所有 slots 先验证成功，再原子写入 scheduled_results。
- malformed Host response 不进入 transcript/event/model continuation state。

## Response Contract

Serial response 是 ToolExecutionResult discriminated union：

- success: `ok: true`，optional JSON-safe object output，不允许 error。
- failure: `ok: false`，required non-blank ToolExecutionError，optional JSON-safe output/details。

Batch response：

```json
{
  "results": [
    {"ok": true, "output": {}},
    {"ok": false, "error": {"code": "failed", "message": "failed"}}
  ]
}
```

Envelope 与 slot 扩展字段均须 JSON-safe；slot 顺序与 request 顺序一一对应。

## Validation Order

Serial 直接以 `parse_tool_execution_result` 验证 response。Batch 先验证 envelope JSON safety 和 result count，再用临时 list 解析全部 slots；只有整个 list 成功后才构造 ScheduledToolResult 并写入目标数组。

## 验收标准

- Bundled Host normal serial/batch results 保持通过。
- nested non-JSON output/details 和 blank error identity 被拒绝。
- batch envelope non-JSON extension 被拒绝。
- 任一 malformed slot 导致整个 batch 在 scheduled state 写入前失败。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- `parse_tool_execution_result` 增加 whole-payload recursive JSON safety。
- Existing ToolExecutionError/Result constructors继续执行 non-blank 与 state invariant。
- ToolScheduler batch 增加 envelope validation。
- Batch slots 改为 parse-all-before-commit。
- Tests 覆盖 serial payload 与 batch envelope/slot failure。

