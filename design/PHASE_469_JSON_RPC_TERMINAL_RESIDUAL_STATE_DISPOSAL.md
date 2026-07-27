# Phase469 JSON-RPC Terminal Residual State Disposal

## 状态

代码、测试与文档已完成。

## 审计结论

Phase463-468清理了handlers、observers和pending correlations，但closed/stopped connection仍保留最多512项settled response history及next request ID allocator。它们只服务于live response classification和新request allocation，terminal state不再需要。Python还保留optional protocol diagnostic callback，closed connection因此继续引用外部diagnostics owner。

## 目标

- terminal transition清空settled response history。
- terminal transition将request ID allocator设为不可分配状态。
- Python stop释放protocol diagnostic callback closure。
- disposal发生在terminal transition内，不依赖GC finalizer。
- pending waiters仍获得其原始request IDs的stopped responses。
- async TS close observer diagnostics保持可用，因为其listeners属于独立EventEmitter窗口。
- repeated close/stop保持幂等。

## State Ownership

live-only residual state包括：

```text
settled response history
next outbound request ID
Python protocol diagnostic callback
```

settled history用于duplicate/late/unexpected response分类；reader terminal后不再接收合法response。ID allocator只用于新request，而两端terminal gates已禁止request admission。将next ID设为null/None同时提供明确不可恢复标志。

## Ordering

TS在handler registry disposal后、pending rejection前清理history并将nextId置null。pending rejection使用map中的现有ID，不依赖allocator/history。

Python在pending lock内snapshot pending entries后清空pending/history并将 `_next_id = None`，再按snapshot IDs唤醒waiters。lock释放后清除 `_protocol_diagnostic`；stop之后reader不再需要新的protocol diagnostics。

## Diagnostic Boundary

Python diagnostic callback是单一可选field，stop直接置None。TS async close observer diagnostics依赖EventEmitter `protocol_error` listeners，不依赖settled history或allocator，并继续按Phase467延迟到observer settlement后清理。

## 验收标准

- close/stop前settled history含entry。
- terminal transition后history为空。
- TS nextId为null。
- Python next_id为None。
- Python protocol diagnostic callback为None。
- handler registry和旧cleanup测试继续通过。
- post-terminal request仍在allocator前失败。
- TS、Python全量和integration保持通过。

## 实现结果

- TS close清空settledRequests并终止nextId allocator。
- Python stop在pending lock内清空settled history并终止next ID。
- Python stop释放protocol diagnostic callback。
- 两端现有terminal disposal tests扩展覆盖残余状态。
