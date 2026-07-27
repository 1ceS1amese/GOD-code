# Phase416 Event Envelope Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Host 的 `god_code_event` handler 只检查 event_type/session_id 是 string，然后将 unknown payload 强制 cast。未知事件、空白身份、缺 turn_id、session_started 错带 turn_id 或非 JSON-safe payload 可进入 TUI/transcript listeners；malformed turn_finished 还可能错误修改 finalized/controller lifecycle。

## 目标

- 将 TypeScript event union 转化为 runtime asserting boundary。
- 验证封闭 event type、non-blank identity 和递归 JSON-safe payload。
- 固化 session_started 与 turn-scoped event 的 turn_id presence。
- Lifecycle mutation 必须发生在完整 validation 之后。
- Malformed event 不 emit、不 finalization、不 cleanup。

## Envelope Contract

- event_type 必须属于八种 `GodCodeEventType`。
- session_id 必须 non-blank。
- payload 必须是 JSON-safe object。
- session_started：turn_id 必须缺失。
- 其他七种事件：turn_id 必须 non-blank。

额外 payload 业务字段仍由具体 TUI/transcript consumer解释；本阶段保证 envelope identity 和 transport safety。

## Host Flow

`handleGodCodeEvent` 首先调用 `asGodCodeEventEnvelope`。失败转换为 JSON-RPC invalid params；成功后才允许：

1. turn_finished 调用 finishTurn。
2. emit typed god_code_event。

## 验收标准

- 合法 session_started 和 turn_finished 通过 converter。
- 未知 type、缺/空白 turn_id、session_started 带 turn_id、空白 session、non-JSON payload 被拒绝。
- Malformed turn_finished 不写 finalized registry。
- Malformed event 不触发 event listener。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- 新增封闭 runtime event type set 与 `asGodCodeEventEnvelope`。
- Host handler 移除 unknown cast，改为 validated typed event。
- Protocol 与 process tests 覆盖 envelope/lifecycle failure paths。
