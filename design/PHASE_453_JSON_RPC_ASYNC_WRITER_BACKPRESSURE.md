# Phase453 JSON-RPC Async Writer Backpressure

## 状态

代码、测试与文档已完成。

## 审计结论

Phase443-445 验证 outbound envelope/size，但 TS `send` 仍把 `writable.write(encoded)` 的同步调用当作完成。它忽略 false backpressure、write callback error 和异步 stream close；连续 sends 可超前进入 internal buffer，notification 在 transport 接受前 resolve，callback failure 也无法可靠关联并关闭 peer。response helper 还是同步 API，异步 writer failure可能成为未处理 Promise。

## 目标

- 所有 outbound frames 通过单一串行 write chain。
- 一次只允许一个 frame 进入 `Writable.write`。
- send Promise 仅在 write callback成功且 false backpressure对应 drain 后 resolve。
- frame order 与 send admission order一致。
- sync write throw、callback error、stream error或 mid-write close 都是 terminal transport failure。
- terminal write failure 关闭 peer并 reject全部 pending。
- notify await真实 write acknowledgement。
- inbound request response helpers await write failure，失败由 handleLine terminal close处理。
- queued frame 在 peer 已关闭时不得继续写入。

## Writer Contract

```text
validate/encode
-> append to writeTail
-> confirm peer still open
-> Writable.write(frame, callback)
-> callback success
-> if write returned false: await drain
-> resolve send
```

## Request Semantics

request 仍在发送前建立 pending correlation和 timeout，以免极快 response 在 callback 前到达。同步 preflight/encoding error 立即 rollback pending；异步 write failure触发 close，由 close lifecycle reject pending并清理 timer/map。write chain 后续项目在执行前重新检查 closed，避免 terminal failure 后继续写 queued frames。

## Response Semantics

`handleLine` 对 Promise rejection 增加 terminal close catch。invalid-request、invalid-params、handler success/error和 size fallback helpers 全部改为 async/await，因此 callback failure不能从 fire-and-forget response path泄漏。

## Backpressure Details

`writeFrame` 同时跟踪 callback和 drain两个 completion signal。`drainComplete` 初始为 false，write 返回 true 后置 true；返回 false则注册 one-shot drain。该顺序兼容同步 callback，不会在 write 返回值尚未知时提前 resolve或遗留 drain listener。

## 验收标准

- delayed callback 前 notify Promise不 resolve。
- 两个通知只按顺序进入 `_write`。
- write false 时等待 drain。
- callback error关闭 peer并 reject pending request。
- terminal failure 后 pending map为空，后续 notify被 closed gate拒绝。
- queued frame在 close 后不写。
- direct writer tests await Promise acknowledgement。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- TS `send` 返回 Promise并通过 `writeTail` 串行化。
- 新增 `writeFrame` callback/drain/error/close state machine。
- request/notify/response helpers接入异步失败传播。
- `handleChunk` 对 handleLine rejection执行 terminal close。
- Tests覆盖 delayed callback、false backpressure、frame ordering、callback failure和pending cleanup。
