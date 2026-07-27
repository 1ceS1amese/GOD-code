# Phase440 JSON-RPC Params Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase439 已封闭 method 和 ID identity，但 params 仍存在 transport gap。TS egress 可接收任意值，ingress 会把 array、primitive 或含 `undefined` 的 object 直接交给 handler；Python ingress 对 missing params 隐式补 `{}`，且 egress 依赖类型标注而没有 runtime guard。

## 目标

- GOD-code request/notification params 必须显式存在。
- params 必须是 recursive JSON-safe object。
- egress 在分配 request ID、建立 pending 或写入 wire 前 fail fast。
- ingress request 在业务 handler 前验证 params，失败返回 canonical `-32602`。
- ingress notification 的非法 params 不触发 event 或 registered handler。
- 不允许 missing params 被隐式归一化为 `{}`。

## Params Contract

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {}
}
```

JSON-RPC 标准允许省略 params，也允许 structured array；GOD-code 当前全部 RPC 都使用具名 object 字段，因此 transport profile 收紧为显式 JSON-safe object。这样 method-specific converter 始终从 object 开始，不需要处理 positional params 或 missing-value coercion。

## TS Flow

`request` 和 `notify` 在构造 payload 前调用 `requireJsonRpcParams`。ingress request 的 method/ID 合法后验证 required object params；失败时按原 request ID 返回 `-32602`，不调用 handler。非法 notification params emit `protocol_error` 并停止 notification event/handler 分发。

## Python Flow

`request` 和 `notify` 通过 `require_json_rpc_params` 做 recursive JSON validation。`_handle_request` 不再用 `message.get("params", {})` 填充缺失值；missing 或 malformed params 直接返回 `-32602`，合法 object 才传给业务 handler。

## 验收标准

- 合法 empty/nested JSON object params 两端通过。
- missing、null、array、primitive、non-JSON nested value 被拒绝。
- egress invalid params 不分配 pending request。
- ingress invalid request 返回稳定 `-32602` 且 handler 未调用。
- ingress invalid notification 不触发 handler。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- TS request/notification interface 将 params 改为 required object contract，并增加 egress/ingress runtime validation。
- Python 增加 `require_json_rpc_params`，移除 missing params 到 `{}` 的隐式 default。
- Tests 覆盖 egress fail-fast、pending preservation、canonical invalid-params response 和 dispatch suppression。
