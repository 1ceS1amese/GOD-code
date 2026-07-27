# Phase415 Finalized Turn Guard

## 状态

代码、测试与文档已完成。

## 审计结论

Phase413-414 在 turn_finished/not_found 时最终删除 active controller state。若消息重排导致 cancel_tool_execution 或 execute_tool 晚于 finalization 到达，Host 会重新创建 controller：晚 cancel 留下无后续 cleanup 的永久 tombstone；晚 tool request 甚至可能重新 dispatch 已结束 turn。

## 目标

- Host 在 active state 回收后仍短期记住 finalized `(session_id, turn_id)`。
- Late cancel notification 不重新创建 controller。
- Late single/batch tool request 必须被 pre-dispatch cancellation gate 拒绝。
- Registry 必须有明确容量上限，不能随进程 lifetime 无限增长。
- 正常 active/lease cleanup contract 保持不变。

## Finalized Registry

Host 使用 insertion-ordered `Map<string, true>` 保存最近 1024 个 finalized composite keys。Turn IDs 由 Engine uuid4 生成，不支持同 session 内复用。

每次 finish：

- 刷新 key 到 newest position。
- 超过 1024 时淘汰 oldest key。

## Late Message Semantics

- Late cancel notification：若 key finalized，直接忽略，不创建 controller。
- Late tool request：acquire lease 时创建临时 controller、立即 abort 并标记 finished；handler 返回 tool_cancelled，release 后删除临时 active state。
- Registry entry 保留到容量淘汰或 process stop。

## 验收标准

- turn_finished 无 active request 时 finalized registry 记录 key、active map 为空。
- Late cancel 后 active map 仍为空。
- Late execute_tool 返回 tool_cancelled，executor invocation 为零。
- Late request settle 后 active map 仍为空。
- Registry stop cleanup 和容量 1024 contract 明确。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- 新增 `MAX_FINALIZED_TURN_KEYS = 1024` 与 bounded registry。
- finishTurn 总是标记 finalized。
- cancel notification 与 acquire lease 接入 finalized guard。
- 新增 finish -> late cancel -> late tool contract test。
