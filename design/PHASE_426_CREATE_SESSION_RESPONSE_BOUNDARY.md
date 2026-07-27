# Phase426 Create Session Response Schema and Identity Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase423-Phase425 已封闭 initialize lifecycle 和双向 schema，但 Host 的下一个业务 RPC `create_session` 仍直接把 generic JSON-RPC result 当作 `CreateSessionResponse`。因此错误 status、空白 session identity、非 JSON 扩展值或属于另一请求的 response 都可能穿过 typed API。

## 目标

- Host 把 create_session result 先作为 unknown 接收。
- Runtime converter 验证完整 response transport shape。
- `session_id` 必须是 non-blank string。
- `status` 必须精确等于 `created`。
- response 扩展字段必须递归 JSON-safe。
- response session identity 必须与发起请求严格一致。
- malformed/mismatched response 不返回给上层调用方。

## Response Contract

```json
{
  "session_id": "session-1",
  "status": "created"
}
```

Schema 保持 open object，允许未来增加 JSON-safe metadata；核心 status 不允许宽松字符串或 fallback。Schema validation 与 request correlation 分层：converter 证明 response 自身合法，process boundary 再证明它属于当前 request。

## Host Flow

1. initialization gate 通过。
2. 发送 create_session request。
3. 将 result 作为 unknown 接收。
4. `asCreateSessionResponse` 验证 JSON safety、identity 和 status。
5. 将 response session_id 与 request session_id 比较。
6. 仅在两层检查均成功时返回 typed response。

## 验收标准

- 正常 Engine create_session response 保持通过。
- null、空白 session_id、错误 status 和非 JSON extension 被 converter 拒绝。
- 合法但属于其他 session 的 response 被 correlation gate 拒绝。
- focused、TS 全量、Python 全量和 Host/Engine integration 保持通过。

## 实现结果

- 新增 `asCreateSessionResponse` runtime converter。
- `GodCodeEngineProcess.createSession` 改为 unknown receive、schema validation 和 identity correlation。
- TypeScript tests 覆盖 schema invalid、cross-session mismatch 与恢复后的正常 response。

