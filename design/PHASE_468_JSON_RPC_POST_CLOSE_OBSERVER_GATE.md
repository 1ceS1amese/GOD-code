# Phase468 JSON-RPC Post-Close Observer Gate

## 状态

代码、测试与文档已完成。

## 审计结论

Phase467清理了已知的notification/close/protocol_error listeners，但EventEmitter允许任意event name，并提供 `on`、`addListener`、`once`、`prependListener`、`prependOnceListener`五个注册入口。未知event listeners不会被Phase467清理；即使已清理，调用方仍可在closed peer上重新注册永远不会触发的closure，重新制造dead-peer引用保留。

## 目标

- close时清理所有EventEmitter event names，而不仅是已知协议事件。
- protocol_error仅在async close observer诊断窗口内延迟清理。
- closed peer拒绝全部五种listener registration API。
- pre-close EventEmitter兼容行为保持。
- once/prependOnce wrappers在close cleanup中一并移除。
- listener removal/query APIs保持可用。
- post-close gate使用与其他peer API一致的closed error。

## Registration Gate

`JsonRpcPeer`覆盖五个EventEmitter registration methods，每个先执行统一gate：

```text
closed -> throw "JSON-RPC peer is closed."
open   -> delegate to EventEmitter implementation
```

gate覆盖任意string或symbol event，不只限制JSON-RPC预定义event names。这样closed peer不可能通过公共EventEmitter API重新获得consumer closure。

## General Event Disposal

close observer snapshot/invocation后遍历 `eventNames()`，同步移除除 `protocol_error`外的全部events。protocol_error继续遵循Phase467：async close observers全部settle并完成failure diagnostics后移除。未知custom events、once wrappers和未来新增events自动纳入cleanup，无需维护硬编码列表。

## Compatibility

peer open期间所有registration APIs仍委托Node EventEmitter，ordering、once和prepend语义不变。`off`、`removeListener`、`removeAllListeners`、listener inspection不受gate影响，可在任何状态安全执行。

## 验收标准

- open peer通过五种API注册同一custom event共5个listeners。
- close后custom listener count归零。
- close后五种registration API均抛closed error。
- close后无diagnostic窗口时eventNames为空。
- Phase467 sync/async close failure diagnostics保持通过。
- TypeScript build严格类型通过。
- TS、Python全量和integration保持通过。

## 实现结果

- TS覆盖五种EventEmitter listener registration surfaces。
- 新增统一observer registration closed gate。
- close disposal从硬编码events扩展为eventNames遍历。
- protocol_error deferred cleanup语义保持。
- Tests覆盖custom event cleanup和全部post-close entry points。
