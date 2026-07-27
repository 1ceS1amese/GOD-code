# Phase408 Session-Scoped Tool Cancellation

## 状态

代码、测试与文档已完成。

## 审计结论

Host 支持多个活动 session，但 tool AbortController map 只以 `turn_id` 为键。若两个 session 使用相同 turn ID，它们会共享 signal；一个 session 的 cancel 或 turn_finished cleanup 会误取消/删除另一个 session 的 controller。协议的 execute/cancel/event payload 已始终包含 session_id，因此这是 Host 索引粒度缺陷。

## 目标

- AbortController identity 与协议 turn identity 一致，使用 session + turn。
- cancelTurn API、Engine notification、tool handlers 和 turn_finished cleanup 共用同一键。
- 相同 turn ID 在不同 session 中完全隔离。
- 缺少 session_id 的 cancel notification 在 Host boundary 被拒绝。

## Key Contract

Host 使用无歧义的 JSON tuple key：

```text
JSON.stringify([session_id, turn_id])
```

不使用字符串拼接 delimiter，避免合法 ID 内包含 delimiter 时产生碰撞。

## Lifecycle

- execute_tool/execute_tools：按复合键取得或创建 controller。
- public cancelTurn：立即 abort 对应 session+turn，再发送 Engine request。
- cancel_tool_execution notification：验证 session/turn 均 non-blank 后 abort 对应键。
- turn_finished event：只删除该 session+turn controller。
- process stop：仍 abort 并清空全部 controller。

## 验收标准

- 两个 session 使用同一 turn ID 时获得不同 controller。
- 取消 session A 不影响 session B。
- A 的 turn_finished cleanup 不删除 B。
- 缺 session_id 的 cancel notification 被拒绝。
- 现有单/批工具取消和多 session tests 保持通过。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- 所有 controller lookup/abort/delete 调用改为复合键。
- cancellation notification parser 补齐 session_id validation。
- 新增同 turn ID 跨 session isolation contract test。
