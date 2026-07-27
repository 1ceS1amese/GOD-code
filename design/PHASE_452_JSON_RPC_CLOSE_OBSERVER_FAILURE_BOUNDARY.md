# Phase452 JSON-RPC Close Observer Failure Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase451 隔离了 protocol diagnostics，但 `close()` 仍直接调用 EventEmitter。pending cleanup 虽然发生在 emit 之前，close observer 的同步 throw 仍会让 `close()`/stream end/error callback 抛出并阻止后续 observers；async observer rejection 会形成 unhandled rejection。重复 close 的幂等状态已经存在，但首次 close 的观察层仍可破坏退出编排。

## 目标

- close observer 按注册顺序逐个独立执行。
- 同步 throw 和 async rejection 都被隔离。
- 一个失败不得阻止后续 close observer。
- pending timers/promises 必须在任何 observer 前完成清理/reject。
- close observer failure 产生稳定 protocol diagnostic。
- diagnostic listener failure 继续由 Phase451 隔离。
- `close()` 不因 observer code 抛错。
- 重复 close 不重复 reject pending、调用 observers 或产生诊断。
- 保持 EventEmitter `on/once("close")` 注册 API 和 error 参数。

## Diagnostic Contract

```text
JSON-RPC close observer failed.
```

## TS Flow

`close` 继续先检查 idempotent `closed` flag，随后设置 closed、清理全部 timer、reject pending 并清空 map。最后调用 `emitClose`；该 helper 对 `rawListeners("close")` 做 snapshot iteration，捕获同步 throw，并为 Promise-like result 安装 rejection handler。每个 failure 通过 `emitProtocolError` 报告。

## Ordering Contract

```text
closed=true
-> clear/reject every pending request
-> pending.clear()
-> isolated close observers
```

因此 observer 即使检查 peer 状态、发起新 request 或抛错，也无法回滚已经完成的 close transition。

## 验收标准

- sync failing observer 后续 observer 仍执行。
- async rejecting observer 不产生 unhandled rejection。
- 每个 failure 产生一个稳定 diagnostic。
- pending request 使用传入 close error reject。
- observer 执行时 pending map 已为空。
- close() 不抛出 observer error。
- 第二次 close 无额外 side effect。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- TS `close()` 从直接 EventEmitter emit 改为 `emitClose`。
- `emitClose` 复用 Promise-like detection 和 Phase451 diagnostic dispatcher。
- Tests 覆盖 sync/async observer failure、continuation、pending cleanup、diagnostic count 和 repeated close idempotence。
