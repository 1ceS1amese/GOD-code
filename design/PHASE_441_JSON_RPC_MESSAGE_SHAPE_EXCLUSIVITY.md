# Phase441 JSON-RPC Message Shape Exclusivity

## 状态

代码、测试与文档已完成。

## 审计结论

Phase439-440 已封闭 identity 和 params，但路由仍然只依赖 `method`/`id` 是否存在。携带 `method + result/error` 的混合消息会被当作 request/notification，携带 `id + params + result/error` 的消息会被当作 response，并可能执行 handler 或消费 pending request。

## 目标

- request/notification 不得携带 response 核心字段 `result` 或 `error`。
- response 不得携带 request/notification 核心字段 `method` 或 `params`。
- JSON-safe extension 字段继续允许，不收紧为 exact-key schema。
- malformed request 若具有合法 ID，返回 canonical `-32600`。
- malformed notification 不进入 event/handler 分发。
- malformed response 在 pending correlation 前被拒绝，不消费 pending entry。

## Message Role Contract

Request：

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
```

Notification：

```json
{"jsonrpc":"2.0","method":"god_code_event","params":{}}
```

Response：

```json
{"jsonrpc":"2.0","id":1,"result":{}}
```

核心 discriminator 字段必须形成单一角色；任意 extension 字段仍由 JSON wire 自身保证 JSON safety，并留给未来 transport metadata 使用。

## TS Flow

`handleLine` 在 identity/params 和业务 dispatch 之间执行 role exclusivity 检查。method message 出现 result/error 时，合法 request ID 获得 `-32600`，notification 或非法 ID 触发 protocol diagnostic。id-only response 出现 params 时发出 response-shape diagnostic，并保持 pending map 不变。

## Python Flow

`_dispatch_line` 对 method message 的 result/error 混用进行前置判断；合法 request ID 返回 `-32600`，notification 静默丢弃。response 出现 params 时不调用 `_handle_response`，因此不会 pop waiter 或投递 malformed payload。

## 验收标准

- 正常 request、notification、success/error response 保持通过。
- request + result/error 不调用 handler，并返回 `-32600`。
- notification + result/error 不触发 handler。
- response + params 不消费 pending entry。
- arbitrary non-core extension 字段仍保持兼容。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- TS 增加 request/notification 与 response 核心字段互斥检查及 canonical invalid-request responder。
- Python 在 `_dispatch_line` 增加同等 role guard。
- Tests 覆盖 request handler suppression、notification suppression、`-32600` response 和 pending preservation。
