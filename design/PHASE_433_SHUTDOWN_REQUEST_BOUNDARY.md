# Phase433 Shutdown Request Schema Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Bundled Host 固定发送空 object，但 shutdown request 此前没有显式协议类型，Python Engine 也忽略所有 params 并立即调用 connection.stop。任意字段、错误 shape 或 direct handler non-JSON value 都会触发不可逆停止副作用，且未来调用方可能误以为 shutdown 支持 reason/options。

## 目标

- 将 shutdown request 明确定义为 exact empty JSON object。
- Host 在发 wire 前执行 runtime converter。
- Engine 在 connection.stop 前独立验证。
- array、null、非空 object 和 non-JSON value 均无效。
- malformed request 不停止 Engine connection。
- Phase432 acknowledgement 与 failure-tolerant stop cleanup 保持不变。

## Request Contract

```json
{}
```

Shutdown request 是 closed schema，不允许扩展字段。需要 graceful reason、deadline 或 drain policy 时必须通过未来显式协议版本设计，而不能静默附加被旧 Engine 忽略的 metadata。

## Validation Order

Host：构造 `{}`，调用 `asShutdownRequest`，再发 JSON-RPC。

Engine：确认 params 是递归 JSON-safe dict 且 key count 为零，随后才调用 connection.stop 并返回 canonical acknowledgement。

## 验收标准

- Empty object 两端通过。
- null、array、非空 object 和 non-JSON entry 被拒绝。
- Host wire params 始终为 `{}`。
- Engine malformed params 不调用 stop。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- 新增 `ShutdownRequest` 与 `asShutdownRequest`。
- Host shutdown 使用 validated empty request。
- Engine shutdown 在 stop side effect 前执行 exact-empty check。
- Tests 锁定 wire shape 和 no-stop-on-invalid invariant。

