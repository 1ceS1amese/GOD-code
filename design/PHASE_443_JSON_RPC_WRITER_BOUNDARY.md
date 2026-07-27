# Phase443 JSON-RPC Writer Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase439-442 已在各 construction path 验证 identity、params、message role 和 handler response，但最终 writer 仍默认信任调用方。未来新增调用点、测试注入或 refactor 可以绕过上游 guard，使 wrong version、混合字段、非法 ID、cyclic value 或 JS class/toJSON object 到达 `JSON.stringify`/`json.dumps`。

## 目标

- writer 成为所有 outbound JSON-RPC message 的最终统一 gate。
- 完整 envelope 必须是 recursive JSON-safe object 且 `jsonrpc` 精确为 `2.0`。
- request/notification/response 必须满足 Phase439-442 的 identity、params、角色和 payload contract。
- cyclic、non-finite、function/custom object 和 malformed discriminator 在序列化前失败。
- invalid payload 不写入任何 partial bytes。
- 合法 JSON-safe extension 字段继续允许。
- 上游 construction validation 保留，writer 作为 defense in depth，不取代业务边界。

## Writer Contract

writer 只接受三类消息：

```text
request      = 2.0 + positive id + method + object params
notification = 2.0 + method + object params
response     = 2.0 + positive id + exactly one valid result/error
```

## TS Flow

`send` 在 `JSON.stringify` 前调用 `isJsonRpcOutboundMessage`。validator 先要求 plain JSON object，再验证完整角色 shape；属性访问和 hostile proxy/getter 通过 defensive try/catch 转换为 false。`isJsonValue` 也只递归 array/plain object，拒绝 Date、class instance、function、undefined、cycle 和 getter failure。invalid writer call 抛出 `Invalid outbound JSON-RPC message.`，不会写 stream。

## Python Flow

`_send_message` 在 `json.dumps` 前调用 `is_json_rpc_outbound_message`，失败稳定抛出 `JsonRpcRequestError(-32603)`。validator 复用 method/ID/params/result/error helpers，并保持 extension 字段 JSON-safe。error object 使用独立 predicate，避免通过 parser fallback 文本推断合法性。

## 验收标准

- 所有正式 request、notification、success/error response 正常写出。
- wrong version、invalid ID、missing/invalid params、mixed result/error 被拒绝。
- cyclic result 和 TS custom object 被拒绝。
- invalid payload 输出流保持为空。
- 合法 extension 字段完整保留。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- TS `send` 增加 centralized outbound validator，并收紧 JSON object 为 plain-object semantics。
- Python `_send_message` 增加 centralized outbound validator 和稳定 -32603 failure。
- Python error payload predicate 独立化并由 parser、handler builder、writer 共用。
- Tests 直接验证 writer bypass 场景、zero-byte failure 和 extension compatibility。
