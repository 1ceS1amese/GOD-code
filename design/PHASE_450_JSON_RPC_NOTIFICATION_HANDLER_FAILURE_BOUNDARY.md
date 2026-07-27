# Phase450 JSON-RPC Notification Handler Failure Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

TS notification ingress 同时调用公共 EventEmitter observers 和 method-specific handlers，但任一同步 throw 或 async rejection 都会终止当前链路；`handleLine` 又以 fire-and-forget 方式启动，失败可能形成 unhandled rejection。公共 EventEmitter 的第一个失败 listener 还会阻止后续 observers。Python connection 则完全忽略 inbound notification，缺少对称扩展点。

## 目标

- 每个 notification observer/handler 独立执行和捕获失败。
- 一个失败不得阻止同一 notification 的后续 consumers。
- async rejection 必须被 await/catch，不形成 unhandled rejection。
- notification 不产生 JSON-RPC response。
- TS observer 与 method handler 使用不同稳定 diagnostic。
- diagnostic consumer 自身失败不得改变 notification control flow。
- Python 补齐 method-specific notification registration/dispatch。
- malformed notification params 仍在 transport boundary 前被拒绝。

## Diagnostic Contract

```text
JSON-RPC notification observer failed: <method>
JSON-RPC notification handler failed: <method>
```

## TS Flow

`handleNotification` 使用 `rawListeners("notification")` 逐个调用并 await，使 `once` wrapper 语义仍由 EventEmitter 保持，同时捕获 sync/async failure。随后 method-specific handlers 也逐个 await/catch。失败通过 `emitProtocolError` 分发；该 helper 同样逐个隔离 protocol diagnostic listeners，避免诊断路径反向破坏 transport。

## Python Flow

`JsonRpcConnection` 新增 `register_notification_handler` 和 `_notification_handlers`。`_dispatch_line` 对无 ID method message 验证 required JSON-safe object params 后调用 `_handle_notification`。handlers 按注册顺序执行；异常产生 optional protocol diagnostic 并继续后续 handler，不写 response。

## 验收标准

- TS failing public observer 后续 observer 仍执行。
- TS sync/async method handler failure 后续 handler 仍执行。
- Python failing handler 后续 handler 仍执行。
- 每个失败产生一个稳定 diagnostic。
- diagnostic listener/callback failure 被隔离。
- notification output stream 保持无 response。
- malformed params 不触发任何 consumer。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- TS notification observers 和 handlers 改为 sequential failure-isolated dispatch。
- TS 新增 failure-isolated `emitProtocolError` 用于 notification diagnostics。
- Python 新增 inbound notification registration、validation、dispatch 和 diagnostics。
- Tests 覆盖 observer failure、async handler rejection、continuation order 和 diagnostic consumer failure。
