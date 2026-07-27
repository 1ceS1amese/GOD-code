# Phase438 JSON-RPC Success Response Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase437 已验证 error response，但 success path 仍不对称。TS 只检查 result 字段存在，array/primitive 可进入业务 converter；Python 把缺失 result 当空 object，并对任意值调用 `dict(...)`，使 list-of-pairs 等非协议 shape 被强制接受，其他 malformed shape则产生 incidental TypeError/ValueError。

## 目标

- Success response 必须包含 result。
- 当前 GOD-code RPC result 统一要求 recursive JSON-safe object。
- null、array、primitive、missing 和 non-JSON nested value 均无效。
- result/error 不得并存。
- TS malformed success reject pending、删除 pending entry并 emit protocol_error。
- Python malformed success稳定映射为 `JsonRpcRequestError(-32603)`。
- 业务级 converter 继续验证各方法的具体 schema。

## Success Contract

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {}
}
```

JSON-RPC 标准允许任意 JSON result，但 GOD-code 当前所有双向 request handlers 的 application contract 均返回 object；因此 transport profile 显式收紧为 object，以避免每个 requester 重复处理 primitive/array ambiguity。

## TS Flow

Response ID 命中 pending 后清理 timer/map。非 error path 必须存在 result，并通过 `isJsonObject` whole-value validation；失败时固定 reject `Invalid JSON-RPC success response payload.` 并 emit protocol_error，成功后才 resolve unknown 给业务 converter。

## Python Flow

`parse_json_rpc_result` 拒绝 missing result、result/error 双字段和任何非 JSON-safe object。合法 result 返回 shallow dict copy；非法 shape统一抛出 code -32603，而不是 default `{}` 或执行 `dict(...)` coercion。

## 验收标准

- 正常 object result 两端通过。
- missing/null/array/primitive/non-JSON object 被拒绝。
- result/error ambiguity 被拒绝。
- TS pending map 无泄漏并发出 protocol_error。
- Python 错误类型和 code 稳定。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- TS success handler 增加 `isJsonObject` validation。
- Python 新增 `parse_json_rpc_result`。
- Python request path 移除 empty default 和 dict coercion。
- Tests 覆盖 valid object、invalid shapes、protocol diagnostics 和 canonical error code。

