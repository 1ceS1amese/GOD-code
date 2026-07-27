# Phase437 JSON-RPC Error Response Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

业务 payload 已有 runtime boundaries，但共享 JSON-RPC transport 仍直接信任 response.error。TS 删除 pending 后直接读取 `error.code/message/data`；Python 对 code 执行 `int(...)`、对 message 执行 `str(...)`。Malformed remote error 因而可能造成错误类型污染、非协议异常或把 arbitrary value 静默强制转换为可接受错误。

## 目标

- 两端统一验证 JSON-RPC error object。
- code 必须是 JSON safe integer，bool 不算 integer。
- message 必须是 non-blank string。
- optional data 与所有扩展字段必须递归 JSON-safe。
- response 不得同时包含 result 和 error。
- TS malformed error 必须拒绝对应 pending request、删除 pending entry 并发出 protocol_error。
- Python malformed error 必须稳定映射为 `JsonRpcRequestError(-32603)`。

## Error Contract

```json
{
  "code": -32602,
  "message": "Invalid params",
  "data": {}
}
```

Error object 保持 open schema，但所有扩展字段须 transport-safe。`data` 可省略，也可为任意 JSON value。

## TS Flow

Pending response 命中后先清理 timer/map。若存在 error：拒绝 result/error 双字段；调用 `isJsonRpcErrorObject` 验证整个 object；合法时构造 JsonRpcError，非法时用固定 protocol error reject 并 emit。Success response 缺失 result 同样被拒绝。

## Python Flow

`parse_json_rpc_error` 验证 whole-object JSON safety、safe-integer code、non-blank message 和 data。合法时保留 remote code/message/data；非法时返回 canonical `-32603 Invalid JSON-RPC error response payload.`。Request response 同时含 result/error 时同样视为 malformed。

## 验收标准

- 合法 remote error 在两端保留 code/message/data。
- string/bool/unsafe code、blank message、non-JSON data/extension 被拒绝。
- TS pending map 无泄漏并发出 protocol_error。
- Python 不再抛出 int conversion 等 incidental exception。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- TS 新增 JSON-RPC error object 与 recursive JSON value validators。
- TS response handler 增加 result/error exclusivity 和 missing-result guard。
- Python 新增 `parse_json_rpc_error`。
- Python request path 移除 int/str coercion。
- Tests 覆盖合法保真和 malformed canonical handling。

