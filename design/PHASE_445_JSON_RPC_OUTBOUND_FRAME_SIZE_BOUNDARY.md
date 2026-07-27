# Phase445 JSON-RPC Outbound Frame Size Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase444 将 reader 限制为 1 MiB，但 writer 仍可生成更大的合法 JSON envelope。此类 request/notification 会被远端确定性丢弃；oversized handler response 还会让 requester 等待超时。Python request 在 `_send_message` 抛错时因 pending 已注册且发送发生在 wait try 之外，还会遗留 waiter。

## 目标

- outbound JSON payload 使用与 reader 相同的 1 MiB UTF-8 byte limit。
- size check 在 stream write 前完成，invalid frame 保持 zero-byte failure。
- oversized request 清理 pending timer/waiter。
- oversized notification 直接 fail fast。
- oversized handler success/error 转换为紧凑合法 `-32603` response。
- method-not-found 等动态 error message 同样具备 size fallback。
- 正常消息和 exact transport contract 保持不变。

## Canonical Size Error

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "JSON-RPC output line exceeds maximum size."
  }
}
```

## TS Flow

`send` 在 stringify 后、追加 LF 和写 stream 前计算 UTF-8 byte length。oversized outbound request 由既有 request send try 清理 timer/map；notification promise reject。handler success send 的 size error由 request try/catch 转为 canonical response；handler error 和 method-not-found 通过 `sendErrorResponseWithSizeFallback` 捕获 oversized dynamic error，再发送紧凑 error。TS 同时 emit protocol diagnostic。

## Python Flow

`_send_message` 在 `json.dumps(..., ensure_ascii=False)` 后检查 encoded UTF-8 bytes。`request` 将初始 send 纳入 rollback try，任何 writer failure 都会 pop pending。handler error 和 method-not-found 通过 `_send_error_response_with_size_fallback` 发送；oversized success 被 request handler try 捕获并同样转换为紧凑 -32603。

## 验收标准

- oversized request/notification 不写任何 bytes。
- TS pending timer/map 和 Python pending waiter 均无泄漏。
- oversized handler result 返回紧凑 -32603，不让 requester 超时。
- oversized handler error message/data 返回同一紧凑 response。
- writer limit 与 reader limit 共用 `JSON_RPC_MAX_LINE_BYTES`。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- 两端 writer 增加 UTF-8 byte-length check。
- TS 增加 size-error predicate、compact responder 和 dynamic error send fallback。
- Python request 增加 send-failure pending rollback，并新增 error response size fallback。
- Tests 覆盖 oversized request、notification、success/error response、zero-byte failure 和 pending cleanup。
