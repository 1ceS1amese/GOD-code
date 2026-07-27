# Phase455 JSON-RPC Transport Listener Lifecycle

## 状态

代码、测试与文档已完成。

## 审计结论

Phase453-454 已约束 writer acknowledgement 和 queue capacity，但 `JsonRpcPeer.close()` 只改变内部状态，没有解除 constructor 注册到 readable/writable 的长期 listeners。关闭后的 stream 仍持有 peer closure，新 data 也仍会进入 framing 与 handler dispatch；同时 writable 在 idle 状态关闭时没有永久 close listener，只有 active `writeFrame` 能观察 output close。

## 目标

- peer 明确拥有并可解除所有长期 transport listeners。
- close transition 在通知 observers 前停止接收新的 input dispatch。
- close 清除未完成 reader buffer 与 oversized-line discard 状态。
- idle output stream close 也必须触发 terminal peer close。
- transport 在 peer close 后迟到的 `error` 不得成为未捕获 EventEmitter error。
- late-error guard 不得通过 closure继续持有 peer。

## Listener Ownership

constructor 使用稳定的具名 callback fields 注册：

```text
readable: data / end / close / error
writable: close / error
```

`close()` 在设置 closed 后立即调用统一 detach routine，再清理 reader state、pending requests，最后通知 close observers。因 callback identity稳定，detach只移除本 peer拥有的 listeners，不影响 transport上的其他 consumers。

## Late Error Guard

Node EventEmitter 在没有 `error` listener时会抛出。transport close后仍可能迟到 error，因此 detach完成后为 readable/writable安装模块级空函数 guard。该函数不捕获 `this`，不会重新建立 stream到 peer的引用链。

## Output Close Semantics

writable 的长期 `close` listener覆盖 idle period；active write仍由 `writeFrame` 的局部 close listener关联到当前 frame。两条路径都进入幂等 `close()`，因此不会重复清理或重复通知 observers。

## 验收标准

- close 后 data/end/close listeners恢复到构造前数量。
- close 后注入合法 notification不会调用 handler。
- readable/writable late error不会抛出。
- idle writable close关闭 peer并拒绝后续 send。
- 既有 pending cleanup、writer failure和 observer isolation保持通过。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- TS 将 transport callbacks提升为可解除的稳定 fields。
- 新增 writable idle close terminal detection。
- close transition解除 listeners并清空 reader partial state。
- 安装不捕获 peer的 closed-transport error guard。
- Tests覆盖 listener ownership、post-close quiescence、late error与 idle output close。
