# Phase431 Cancel Turn Request Schema Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase430 已验证 cancel_turn response，但 request 在 Host 中会先直接创建并 abort controller，在 Engine 中会直接进入 SessionManager。JavaScript caller、cast 或动态 payload 可用空白 identity 或非 JSON extension 创建无效 tombstone，或把 malformed identity 送入远端 cancellation mutation。

## 目标

- Host 在任何 local abort/controller mutation 前验证 request。
- Engine 在 cancel_event mutation和 cancel_tool_execution notification 前重复验证。
- session_id 与 turn_id 必须是 non-blank strings。
- 整个 request 与扩展字段必须递归 JSON-safe。
- malformed request 不发送 RPC、不创建 Host controller、不取消 Engine turn、不发 notification。

## Request Contract

```json
{
  "session_id": "session-1",
  "turn_id": "turn-1"
}
```

Request 保持 open object，允许 JSON-safe metadata 扩展。Identity 采用精确字符串，不执行 trim 或 canonicalization；whitespace-only identity 无效。

## Validation Order

Host：

1. initialization gate。
2. `asCancelTurnRequest` 验证完整 wire payload。
3. 以已验证 identity 执行 local abort。
4. 发送 RPC 并进入 Phase430 response boundary。

Engine：

1. initialization gate。
2. 验证完整 request JSON safety。
3. 验证双 identity non-blank。
4. 调用 SessionManager.cancel_turn。
5. found 时发送 cancel_tool_execution notification。

## 验收标准

- 正常 cancellation 保持通过。
- 空白 session/turn identity 被两端拒绝。
- non-JSON extension 被两端拒绝。
- Host malformed request 的 RPC invocation 和 controller count 均为零。
- Engine malformed request 不设置 cancel_event、不改变 active turn、不发 notification。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- 新增 `asCancelTurnRequest` runtime converter。
- Host cancelTurn 将 preflight 前移到 abortTurn 之前。
- Engine cancel ingress 增加完整 JSON-safe 与 non-blank identity validation。
- Tests 覆盖两端 mutation ordering。

