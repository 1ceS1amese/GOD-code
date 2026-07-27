# Phase430 Cancel Turn Response Schema and Identity Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Host 在发出 cancel_turn 前会立即 abort 本地 controller，这是 cancellation intent 的必要行为；但此前 generic response 会直接驱动后续 lifecycle。尤其 `not_found` 会调用 finishTurn 并删除 pre-cancel tombstone。若 Engine response status 或 identity malformed/mismatched，Host 可能提前清理错误 turn 的保护状态。

## 目标

- Host 以 unknown 接收 cancel_turn result。
- Response 必须递归 JSON-safe。
- session_id 与 turn_id 必须 non-blank。
- status 仅允许 `cancel_requested` 或 `not_found`。
- response 的 session_id/turn_id 必须与 request 双重严格匹配。
- 只有验证后的 `not_found` 才能驱动 finishTurn cleanup。
- malformed/mismatched response 保留已建立的 cancellation tombstone。

## Response Contract

```json
{
  "session_id": "session-1",
  "turn_id": "turn-1",
  "status": "cancel_requested"
}
```

另一个合法 status 为 `not_found`。Response object 保持开放，但扩展字段必须 JSON-safe。

## Lifecycle Order

1. initialization gate。
2. 按 request identity abort/create local controller，立即表达取消意图。
3. 发送 cancel_turn request。
4. 将 result 作为 unknown 交给 `asCancelTurnResponse`。
5. 校验 response session/turn 与 request 双 identity correlation。
6. 仅当已验证 status 为 not_found 时调用 finishTurn。

本阶段刻意不回滚第 2 步：RPC failure 或 malformed response 并不撤销调用方已经表达的本地取消意图；但也不能借未验证结果清除 tombstone。

## 验收标准

- cancel_requested/not_found 正常 response 保持通过。
- 空白 identity、非法 status、非 JSON extension 被拒绝。
- cross-session 或 cross-turn response 被拒绝。
- malformed/mismatch 后 controller tombstone 保留。
- validated not_found 后 cleanup 正常发生。
- TS、Python 和 integration 保持通过。

## 实现结果

- 新增 `asCancelTurnResponse` runtime converter。
- cancelTurn 改为 unknown receive 和双 identity correlation。
- response-driven finishTurn 移到所有 validation 之后。
- Tests 证明 malformed/mismatch 不清理、合法 not_found 才清理。

