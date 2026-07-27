# Phase454 JSON-RPC Outbound Queue Capacity

## 状态

代码、测试与文档已完成。

## 审计结论

Phase453 让 TS outbound writer 串行等待 callback 和 drain，但 `writeTail` 仍可无限接纳 frame。若底层 `Writable` 长时间阻塞，Promise chain 会持续持有完整 JSON frame，形成无界内存增长；已有单帧大小和 pending request 数量限制不能约束大量 notification 或 response。

## 目标

- 同时限制 active 与 queued outbound frame 的数量和 UTF-8 字节数。
- 容量检查在 frame 进入 `writeTail` 前同步完成。
- 任一上限溢出时 fail fast，不改变 peer transport 状态。
- request 因容量不足发送失败时回滚 pending correlation 和 timeout。
- frame 无论成功、写失败或 closed gate 拒绝，都只释放一次容量。
- 底层 terminal write failure 仍沿用 Phase453 的 close 与 pending cleanup 语义。

## 容量契约

```text
JSON_RPC_MAX_QUEUED_FRAMES = 256
JSON_RPC_MAX_QUEUED_BYTES  = 4 MiB
```

计数包含当前正在写入的 frame 和等待 `writeTail` 的 frame。字节数按最终带换行符的 UTF-8 encoded frame 计算。若新增 frame 会让任一上限越界，发送以 `JSON-RPC outbound queue capacity exceeded.` 失败，frame 不进入队列。

## 生命周期

成功 admission 后先增加 frame/byte counters，再创建 write Promise。该 Promise settlement 的 success/failure 两条路径共用一次 release callback，因此 callback error、peer close、queued closed gate 和正常 write acknowledgement 都会归还精确容量。

容量溢出属于调用方 admission failure，不是 transport corruption，所以 notification/request overflow 不会关闭 peer。inbound request response 若无法 admission，则错误继续传播到 reader terminal boundary，因为此时 peer 已无法履行协议响应。

## 验收标准

- 第 257 个未完成 frame 被拒绝，peer 保持 open。
- queue 满时 request 失败并清空刚建立的 pending entry。
- 一个 frame settle 后可立即接纳 replacement。
- 4 MiB 字节上限独立于 frame 数量生效。
- close/write rejection 后 frame 与 byte counters 回到零。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- TS 导出 frame 与 byte 两个 queue capacity 常量。
- `send` 在进入 serialized writer 前执行双上限 admission。
- settlement callback 对成功和失败路径统一释放容量。
- Tests 覆盖 frame overflow、request rollback、capacity reuse、byte overflow 和 close cleanup。
