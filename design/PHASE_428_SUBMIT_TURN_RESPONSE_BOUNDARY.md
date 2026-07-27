# Phase428 Submit Turn Response Schema and Identity Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase426-Phase427 已封闭 create_session 双向边界，但 Host 仍把 submit_turn 的 generic JSON-RPC result 直接断言为 `SubmitTurnResponse`。上层会立即使用其中的 turn_id 过滤事件并发起取消，因此空白 identity、错误 status、非 JSON extension 或属于其他 session 的 response 会污染 turn lifecycle。

## 目标

- Host 将 submit_turn result 作为 unknown 接收。
- Response 必须是递归 JSON-safe object。
- session_id 与 turn_id 必须 non-blank。
- status 必须精确等于 `accepted`。
- response session_id 必须与 request session_id 严格一致。
- malformed/mismatched response 不返回给 headless、REPL、doctor 或 TUI caller。

## Response Contract

```json
{
  "session_id": "session-1",
  "turn_id": "turn-1",
  "status": "accepted"
}
```

Response 保持 open object，以允许 JSON-safe metadata 扩展。Converter 只验证 self-contained schema；process boundary 独立执行 request/response session correlation。turn_id 由 Engine 生成，因此本阶段验证其合法性而不与 request 字段比较。

## Host Flow

1. initialization gate 通过。
2. 发送 submit_turn request。
3. 以 unknown 接收 result。
4. `asSubmitTurnResponse` 验证 JSON safety、identities 和 exact status。
5. 将 response session_id 与 request session_id 严格比较。
6. 仅返回已验证的 typed response。

## 验收标准

- 正常 Python Engine accepted response 保持通过。
- null、空白 session/turn identity、错误 status 和非 JSON extension 被拒绝。
- cross-session response 被 correlation gate 拒绝。
- focused、全量和真实 integration 保持通过。

## 实现结果

- 新增 `asSubmitTurnResponse` runtime converter。
- `GodCodeEngineProcess.submitTurn` 改为 unknown receive 与 identity correlation。
- Tests 覆盖 malformed、cross-session 和正常恢复路径。

