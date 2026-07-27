# Phase467 JSON-RPC Event Listener Close Disposal

## 状态

代码、测试与文档已完成。

## 审计结论

Phase463清空了method handler registries，但TS `JsonRpcPeer`继承的EventEmitter仍长期保留公共 `notification` observers、`close` observers和 `protocol_error` diagnostic consumers。closed peer不会再dispatch业务事件，却继续持有这些闭包。不能在close开始时直接removeAllListeners，因为async close observer rejection仍需要通过protocol_error listeners诊断。

## 目标

- close observers仅执行一次，并在同步dispatch后从peer解除。
- public notification observers在closed gate建立后立即解除。
- protocol diagnostic listeners保留到全部async close observers完成失败报告。
- async close observer failure仍逐项产生isolated diagnostic。
- async observers全部settle后释放protocol_error listeners。
- pending cleanup和registry disposal继续先于close observer调用。
- repeated close保持无observer重复执行。

## Disposal Ordering

```text
closed gate / transport detach / registries / pending cleanup
-> snapshot and invoke close observers
-> immediately remove notification + close listeners
-> await all async close observer settlements
-> emit isolated failure diagnostics as needed
-> remove protocol_error listeners
```

`close()`保持同步API，不等待observer Promise；内部completion Promise只负责延迟最后一组diagnostic listener disposal。

## Async Observer Contract

`emitClose`收集每个Promise-like observer结果。每个rejection通过局部rejection handler转换为resolved Promise并调用 `emitProtocolError`，因此 `Promise.all`自身不会reject，也不会产生unhandled rejection。同步throw立即诊断，后续close observer继续执行。

## Listener Ownership

只清理JsonRpcPeer定义的三个公共event names：`notification`、`close`、`protocol_error`。transport listeners继续由Phase455 detach管理；method registries由Phase463管理。清理EventEmitter listeners不会影响已经捕获并正在执行的observer Promise本身。

## 验收标准

- close调用返回前notification listener count为0。
- close调用返回前close listener count为0。
- sync close observer failure仍产生diagnostic。
- async close observer failure仍产生diagnostic。
- async observers settle后protocol_error listener count为0。
- observer调用顺序和pending cleanup保持。
- repeated close不重复observer。
- TS、Python全量和integration保持通过。

## 实现结果

- TS `emitClose`改为收集并await隔离后的async observer settlements。
- close同步移除notification和close listeners。
- close completion后移除protocol_error listeners。
- Tests扩展现有close isolation case验证三类listener disposal。
- Python不使用对应EventEmitter observer layer，无需修改。
