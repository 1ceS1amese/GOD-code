# Phase439 JSON-RPC Transport Identity Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase437-438 已封闭 response payload，但 transport identity 仍可接受空白 method、布尔 ID、零值、负数、小数和超出 JSON safe integer 范围的 ID。TS ingress 还可能把非法 response ID 参与 pending correlation；Python 的 `isinstance(value, int)` 会把布尔值视为整数。

## 目标

- GOD-code JSON-RPC method 必须是 non-blank string。
- request/response ID 必须是正 JSON-safe integer，布尔值无效。
- handler registration、outbound request 和 notification 在发送前验证 method。
- ingress request 在调用 handler 前验证 method 和 ID。
- ingress response 在 pending correlation 前验证 ID。
- 非法 identity 不得消费 pending entry 或触发业务 handler。

## Transport Identity Contract

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {}
}
```

GOD-code 当前只使用本地单调递增数字 ID，因此 transport profile 明确拒绝 JSON-RPC 标准允许的 string ID，并进一步要求数字 ID 为正 safe integer。该约束避免 JavaScript 精度丢失、Python bool/int 混淆和无意义的零/负 identity。

## TS Flow

`JsonRpcPeer` 在 handler registration、`request` 和 `notify` 的 egress 入口调用统一 method validator。ingress routing 在 request/notification 分支先验证 method，在 request/response 分支再验证 ID；失败时 emit `protocol_error` 并停止分发。非法 response ID 不查询或删除 pending map。

## Python Flow

`JsonRpcConnection` 使用共享 `is_json_rpc_method`、`require_json_rpc_method` 和 `is_json_rpc_id`。egress 和 handler registration fail fast；`_dispatch_line` 在进入 request handler 或 response waiter 前静默丢弃非法 transport identity，保持现有 stdio transport 的 malformed ingress 行为。

## 验收标准

- 合法 non-blank method 和正 safe integer ID 通过。
- blank method、bool/zero/negative/fractional/unsafe ID 被拒绝。
- 非法 ingress request 不调用 handler。
- TS 非法 ingress 发出稳定 protocol diagnostic。
- TS 非法 response ID 不消费 pending request。
- Python 非法 ingress 不写 response、不修改 pending。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- TS 增加 method/ID transport validators，并接入 registration、egress 和 ingress routing。
- Python 增加对应 validators，并接入 connection construction、dispatch 和 correlation。
- Tests 覆盖合法边界、blank method、bool/zero/fractional/unsafe ID、handler suppression 和 pending preservation。
