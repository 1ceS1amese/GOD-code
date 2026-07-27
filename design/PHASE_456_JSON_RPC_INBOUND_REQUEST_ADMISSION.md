# Phase456 JSON-RPC Inbound Request Admission

## 状态

代码、测试与文档已完成。

## 审计结论

TS reader会并发启动每条 `handleLine`，因此异步 request handler可以无限累积。此前只有本端 outbound pending上限，没有服务端 active inbound request上限；同一 request ID在原 handler未完成时还可被再次执行，产生重复副作用和歧义响应。Python Engine的 inbound loop与 handlers为同步串行执行，不存在同类并发 admission面。

## 目标

- 跟踪当前尚未完成响应生命周期的 inbound request IDs。
- 同一 active ID只能执行一个 handler。
- active inbound requests总量限制为 256。
- duplicate/capacity rejection必须返回合法 JSON-RPC error，不执行 handler。
- rejection只影响当前 request，不关闭健康 peer。
- handler及response settlement的所有路径都释放 ID admission。

## Admission Contract

```text
JSON_RPC_MAX_ACTIVE_INBOUND_REQUESTS = 256

duplicate active id -> -32600
capacity overflow   -> -32000
```

admission发生在 method lookup和handler调用之前。通过 admission后，ID加入 `activeInboundRequestIds`；method-not-found、handler success、handler error、contract fallback或response failure均经 `finally` 删除该 ID。

## Duplicate Semantics

当 ID已 active，peer发出 `Duplicate active JSON-RPC request id: <id>` protocol diagnostic，并回复 `-32600 Duplicate active JSON-RPC request id.`。原 request继续正常执行，重复 request不进入业务 handler，因此不会复制业务副作用。

## Capacity Semantics

达到 256 个 active IDs后，新 request回复 `-32000 JSON-RPC active inbound request limit exceeded.` 并产生 diagnostic。容量拒绝不占用 active set；已有 request任一 settlement后，新 request即可重新 admission。

## 验收标准

- 两个相同 active ID只调用一次 handler。
- duplicate request获得 -32600，原 request仍获得正常结果。
- 256 个阻塞 handler可 admission，第257个获得 -32000。
- overflow不关闭 peer。
- handlers settle后 active set归零并可接纳后续 request。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- TS 导出 `JSON_RPC_MAX_ACTIVE_INBOUND_REQUESTS`。
- `JsonRpcPeer`增加 active inbound ID set。
- `handleRequest`负责 duplicate/capacity admission和 finally release。
- 原 handler逻辑迁入 `dispatchRequest`，保持既有错误映射与response fallback。
- Tests覆盖 duplicate suppression、capacity rejection、release和reuse。
