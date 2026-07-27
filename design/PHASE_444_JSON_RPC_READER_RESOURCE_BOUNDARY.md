# Phase444 JSON-RPC Reader Resource Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase443 封闭了 outbound writer，但 inbound framing 仍无资源上限。TS 会持续把无换行 chunk 追加到字符串 buffer；Python `TextIO.readline()` 会为任意长输入一次性分配整行。恶意或损坏的 peer 因此可在 JSON parse 和 envelope validation 前造成无界内存增长。

## 目标

- 单条 JSON-RPC line 的 payload 上限统一为 1 MiB UTF-8 bytes。
- CRLF/LF delimiter 不计入 payload 上限。
- 超限检测发生在 JSON parse 前。
- 无换行超限输入进入 discard mode，不继续累计 buffer。
- 丢弃完整超限行后恢复处理下一条合法 frame。
- TS 发出稳定 protocol diagnostic；Python 保持现有 malformed ingress 静默策略。
- Python 每次 `readline` 都携带明确 size bound。

## Framing Contract

```text
JSON_RPC_MAX_LINE_BYTES = 1,048,576
frame = UTF-8 JSON payload + LF
```

一条超限 frame 只影响自身，不关闭 transport，也不污染下一行的 message boundary。

## TS Flow

`handleChunk` 增加 `discardingOversizedLine` 状态。正常模式按 newline 增量拆帧，并使用 `Buffer.byteLength(..., "utf8")` 检查完整或未完成 line；未完成 line 超限后立即清空 buffer、emit `JSON-RPC input line exceeds maximum size.`，随后只扫描 newline，不再保留 payload。找到 delimiter 后恢复正常解析同一 chunk 的剩余内容。

## Python Flow

`serve_forever` 通过 `_read_bounded_line` 获取 frame。底层调用固定为 `readline(JSON_RPC_MAX_LINE_BYTES + 2)`；若内容 UTF-8 bytes 超限或 size cap 命中但没有 newline，则用同样有界的读取循环 drain 到 delimiter。超限返回空 frame，主循环继续下一行。

## 验收标准

- 正常小消息行为不变。
- 超过 1 MiB 且无换行的 TS 输入不会继续增长 buffer。
- Python 不执行无 size 参数的 `readline()`。
- 超限输入不进入 JSON parser/handler。
- 超限行之后的合法 request/notification 正常分发。
- TS diagnostic 文本稳定。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- 两端新增共享语义常量 `JSON_RPC_MAX_LINE_BYTES`。
- TS reader 增加 byte-aware buffer limit、discard state 和 same-stream recovery。
- Python reader 增加 bounded readline、UTF-8 byte check、bounded remainder drain 和 recovery。
- Tests 覆盖 oversized unterminated line、bounded read size、handler suppression 和下一帧恢复。
