# Phase451 JSON-RPC Protocol Diagnostic Isolation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase450 为 notification failure 使用了隔离 dispatcher，但其余 21 个 `protocol_error` 发出点仍直接调用 EventEmitter。用户 diagnostic listener 的同步 throw 会反向中断 oversized discard、JSON parse recovery、envelope routing、handler fallback、pending rejection或 response lifecycle classification；async listener rejection 则可能形成 unhandled rejection。

## 目标

- 所有 TS `protocol_error` 必须通过同一 dispatcher。
- diagnostic listener 同步 throw 不得影响 transport control flow。
- diagnostic listener async rejection 不得形成 unhandled rejection。
- 多个 diagnostic listeners 独立执行，一个失败不阻止后续 listener。
- reader diagnostic 后仍可解析下一帧。
- response diagnostic 后 pending reject/resolve/cleanup 语义保持完整。
- request handler fallback 和 writer size fallback 不受 diagnostic consumer 影响。
- 不改变 diagnostic event name、Error payload 或注册 API。

## Dispatcher Contract

`emitProtocolError(error)` 对 `rawListeners("protocol_error")` 做 snapshot iteration：

1. 调用每个 listener。
2. 捕获同步 throw。
3. 对 Promise-like result 附加 rejection sink。
4. 继续下一个 listener。
5. 永不把 consumer failure 重新抛给 transport caller。

## Coverage

统一 dispatcher 覆盖：

- oversized input framing
- JSON parse / envelope / method / params / role validation
- request ID / response ID validation
- request handler result/error construction
- notification observer/handler diagnostics
- duplicate / late / unexpected response classification
- malformed success/error pending rejection
- writer size fallback diagnostics

## 验收标准

- 源码不存在直接 `this.emit("protocol_error", ...)`。
- throwing/rejecting listener 后其他 diagnostic listener 仍收到 Error。
- malformed JSON diagnostic 后下一条 notification 正常分发。
- malformed response diagnostic 后 pending 被拒绝并从 map 清理。
- 不出现 unhandled rejection。
- 既有所有 diagnostic 文本保持不变。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- 21 个直接 EventEmitter call 全部迁移到 `emitProtocolError`。
- dispatcher 增加 Promise-like rejection isolation。
- Tests 覆盖 async diagnostic failure、reader recovery、response rejection 和 pending cleanup。
