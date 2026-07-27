# Phase409 Pre-Dispatch Cancellation Tombstone

## 状态

代码、测试与文档已完成。

## 审计结论

Phase408 修复了 session identity，但 `abortTurn` 仍只 abort 已存在 controller。Cancel request/notification 若先于 execute_tool 到达，Host 找不到 controller 并丢弃取消；后续 tool request 会创建新的未 aborted signal，导致已取消 turn 仍执行工具。

## 目标

- 让 cancellation 对 request arrival order 不敏感。
- 早到 cancel 为 session+turn 创建 pre-aborted controller tombstone。
- 后到 single/batch tool request 必须复用该 signal。
- 不存在的 public cancel 不留下永久 tombstone。
- 正常 turn_finished/stop lifecycle 继续清理。

## State Contract

`abortTurn(session, turn)` 始终通过 `getTurnAbortController` 获取或创建 controller，然后 abort。Map 中的 aborted controller 表示该 turn 已取消，即使尚未收到任何 tool request。

## Cleanup

- `cancel_requested`：保留 tombstone，供晚到 tool request 使用，最终由 turn_finished 删除。
- `not_found`：public cancel 收到 Engine response 后立即删除刚创建的 tombstone。
- RPC failure：保留 tombstone，采用 fail-safe cancellation，避免通信不确定时继续执行工具。
- process stop：abort/clear 全部状态。

## 验收标准

- cancel notification 先到、controller 后取时 signal 已 aborted。
- Public cancel 返回 not_found 后 map 为空。
- Phase408 session isolation 继续成立。
- Single/batch tool handler 复用同一 pre-aborted controller。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- `abortTurn` 从 lookup-only 改为 get-or-create-and-abort。
- `cancelTurn` 对 not_found 增加复合键回滚清理。
- 新增 pre-dispatch race 与 not_found tombstone tests。
