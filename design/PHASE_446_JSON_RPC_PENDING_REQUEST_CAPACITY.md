# Phase446 JSON-RPC Pending Request Capacity

## 状态

代码、测试与文档已完成。

## 审计结论

Phase444-445 限制了单帧资源，但 requester 仍可在 peer 无响应时创建任意数量的 pending request。TS 每项持有 timer、resolve/reject closure 和 map entry；Python 每项持有 queue waiter，并可能由多个 tool worker thread 并发 admission。单请求 timeout 不能阻止 timeout 窗口内的无界累计。

## 目标

- 每个 JSON-RPC peer/connection 最多允许 256 个 pending requests。
- capacity check 发生在 request ID、timer/waiter 和 wire write 前。
- overflow request zero-byte fail，不消费 request ID。
- TS overflow 返回稳定 local Error。
- Python overflow 返回 `JsonRpcRequestError(-32000)`。
- Python capacity check、ID allocation 和 waiter insertion 必须位于同一 lock 临界区。
- response、timeout、send failure 和 close 的既有 cleanup 继续释放容量。

## Capacity Contract

```text
JSON_RPC_MAX_PENDING_REQUESTS = 256
overflow = JSON-RPC pending request limit exceeded.
```

该上限按单个 transport peer 计算，不是全进程或 session 全局配额。

## TS Flow

`request` 在 method/params preflight 后读取 `pending.size`。达到上限时立即 throw，不递增 `nextId`、不创建 timer、不构造 pending entry、也不调用 writer。事件循环内 admission 与 map insertion 不会被其他同步 request 中断；close/response/timeout/send failure 继续删除 entry。

## Python Flow

`request` 先完成 method/params preflight，再创建 local queue object；随后在 `_pending_lock` 内原子执行 capacity check、`next(_next_id)` 和 pending insertion。overflow 在分配 ID 前抛出 code -32000；send failure 和 timeout 继续在同一 lock 下 pop 已接纳 waiter。

## 验收标准

- 前 256 个 pending request 可被接纳。
- 第 257 个 request 立即失败。
- overflow 不消费 ID、不写 wire、不增加 pending size。
- close 后 TS timers/promises 全部清理。
- Python overflow 在锁内决定，不存在并发超额 admission 窗口。
- 释放 entry 后后续 request 可重新获得容量。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- 两端新增 `JSON_RPC_MAX_PENDING_REQUESTS = 256`。
- TS request 增加 pre-ID capacity guard。
- Python request 将 capacity/ID/insertion 合并到 pending lock 临界区。
- Tests 覆盖 exact capacity、overflow、ID preservation、zero-byte failure 和 close cleanup。
