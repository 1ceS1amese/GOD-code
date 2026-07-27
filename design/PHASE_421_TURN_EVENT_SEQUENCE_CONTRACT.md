# Phase421 Turn Event Sequence Contract

## 状态

代码、测试与文档已完成。

## 审计结论

Phase420 能吸收 terminal event 之后的消息，但 active turn 内的重复或回退通知仍无法识别。协议示例没有正式顺序字段，TUI 测试中的 `sequence` 只是未校验的额外属性；因此 transport retry 或乱序 delivery 可能重复追加 assistant delta、tool event 或 error。

## 目标

- 为每个 turn 建立明确、可验证的单调事件序列。
- Engine 负责生成 sequence，Host 不依赖到达顺序推测事件身份。
- Host 抑制 active turn 内重复和回退序列。
- 允许 sequence gap，避免 Host 因丢失无关通知永久阻塞后续 terminal event。
- sequence state 在 turn finalization、not_found lifecycle 和 process stop 时回收。
- 保持 `(session_id, turn_id)` 隔离。

## Wire Contract

- `session_started.sequence` 固定为 `0`。
- 所有 turn-scoped event 的 `sequence` 必须是正的 JSON safe integer。
- sequence 以 turn 为作用域，从 `1` 开始严格递增。
- 相同 turn 的 `sequence <= last_seen` 被视为 duplicate/regression。
- Host 接受大于 last_seen 的序列，即使存在 gap。

## Engine Generation

`TurnEngine.run_turn` 开始时将内部计数重置为 0；每次 `_emit` 先递增再构造 `GodCodeEventEnvelope`。Engine server 直接发出的 session_started 使用 sequence 0。Python constructor 同时校验 integer、safe range 和 session/turn scope。

## Host Ordering Gate

Event 依次经过：

1. Envelope/payload/sequence validation。
2. Finalized fan-out guard。
3. Active `last_seen_sequence` comparison。
4. Non-terminal event 更新 last_seen 后 emit。
5. Terminal event执行 finish、删除 sequence state 后 emit。

因此 malformed event 不会被 ordering gate 掩盖，finalized late event 也不会重建 sequence state。

## 验收标准

- TurnEngine 发出的序列为 `1..N`，每次 run_turn 独立。
- session_started wire event sequence 为 0。
- non-integer、unsafe integer、session nonzero 和 turn nonpositive sequence 被双语言拒绝。
- active turn duplicate/regression 不 emit；更高 sequence 正常 emit。
- finalization 删除 active sequence state。
- TypeScript/Python 全量测试和 integration 全部通过。

## 实现结果

- GodCodeEventEnvelope 两端模型增加 required sequence。
- Python TurnEngine 增加 per-run monotonic generator。
- Host 增加 session+turn scoped last-seen map。
- Shared event corpus 升级到 contract version 2。
- Protocol examples、constructor tests、process lifecycle tests 与 Engine tests 已同步。
