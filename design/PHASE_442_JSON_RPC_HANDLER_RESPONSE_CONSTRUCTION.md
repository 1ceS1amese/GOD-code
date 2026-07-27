# Phase442 JSON-RPC Handler Response Construction

## 状态

代码、测试与文档已完成。

## 审计结论

Phase437-441 已验证 ingress response、identity、params 和 message role，但 request handler 的本地返回值仍被直接写入 wire。TS handler 返回 `undefined`/array/non-JSON object 会产生 missing 或非法 result；Python 会让 `json.dumps` 在 non-serializable result/error data 上失败。异常的 unsafe code、空 message 或 non-JSON data 也可绕过既有 ingress contract。

## 目标

- success response 只允许 recursive JSON-safe object result。
- handler error 在发送前满足 safe-integer code、non-blank message 和 JSON-safe optional data。
- invalid local success/error 不得产生 malformed wire 或中断 transport loop。
- invalid handler output 统一降级为稳定 `-32603` internal error response。
- TS 为本地 handler contract violation 发出 protocol diagnostic。
- 正常业务 error code/message/data 保持不变。

## Canonical Fallback

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Invalid JSON-RPC request handler response."
  }
}
```

## TS Flow

`handleRequest` 在 success send 前调用 `isJsonObject`。异常经 defensive `normalizeJsonRpcError` 转换后再次调用 `isJsonRpcErrorObject`；属性访问、字符串转换或 payload contract 任一失败都发送 canonical fallback。invalid success/error 同时 emit `protocol_error`，但 wire 始终保持合法 response。

## Python Flow

handler result 在 `_send_message` 前通过 `is_json_object`。`build_json_rpc_handler_error` 安全提取 exception message，并复用 error parser 验证 code/message/data；invalid candidate 返回 canonical fallback。`JsonRpcRequestError`、validation/session error 和 generic exception 均通过同一 construction boundary。

## 验收标准

- 合法 object result 正常返回。
- undefined/null/array/primitive/non-JSON result 返回 `-32603`。
- bool/unsafe code、blank message、non-JSON data 返回 `-32603`。
- malformed local exception 不导致 stringify/json.dumps 失败。
- requester 收到合法 `JsonRpcError`，pending lifecycle 正常结束。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- TS 增加 success result guard、error payload guard、defensive normalization 和 canonical fallback responder。
- Python 增加 result guard、统一 handler error builder 和 canonical fallback responder。
- Tests 覆盖 invalid array result、unsafe error payload、protocol diagnostic 和稳定 wire response。
