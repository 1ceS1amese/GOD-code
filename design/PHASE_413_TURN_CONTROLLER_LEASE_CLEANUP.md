# Phase413 Turn Controller Lease Cleanup

## 状态

代码、测试与文档已完成。

## 审计结论

Phase408-412 建立了 session-scoped cancellation 与结果优先级，但 `turn_finished` event 仍立即删除 controller。若 event 与尚未完成的 Host request 竞态，in-flight executor 会保留旧 signal，但 Host map 丢失 cancellation state；晚 cancel/late request 可能创建新 controller，且 lifecycle 无法证明何时安全释放状态。

## 目标

- Controller cleanup 必须等待所有 Host RPC request leases 结束。
- turn_finished 在仍有 in-flight request 时标记 finished 并 abort，不立即删除。
- Single/batch handler 无论 success、cancel、throw 都释放 lease。
- 最后一个 lease 释放后原子清理 controller、计数和 finished marker。
- 无 in-flight request 的正常 turn_finished 仍立即清理。

## Lease Model

Host 保留三组按 `(session_id, turn_id)` 复合键索引的状态：

- AbortController map
- in-flight request count map
- finished key set

Single execute_tool 和整个 execute_tools RPC 各持有一个 request lease；batch 内 slots 共用该 lease/controller。

## Lifecycle

- Handler entry：acquire lease，计数 +1。
- Handler exit：finally release，计数 -1。
- turn_finished：abort controller；count=0 立即删除，否则加入 finished set。
- 最后 release 且 key finished：删除 controller 和 marker。
- stop：清空三组状态。

## Semantics

turn_finished 在 Host request 尚未结束时被视为最终 lifecycle decision，因此会 abort signal；Phase412 result-time gate 将晚 executor outcome 转换为 tool_cancelled。该行为防止 finished turn 在 Host 层继续提交结果。

## 验收标准

- In-flight request 存在时 turn_finished 不立即删除 controller。
- Controller signal 被 abort，finished marker 存在。
- Executor settle 后结果为 tool_cancelled。
- Lease release 后三组状态全部清空。
- 正常 cleanup、session isolation、tombstone rollback 保持通过。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- Single/batch handlers 使用 acquire/finally-release lease。
- turn_finished 改为 `finishTurn` 延迟清理。
- stop 同步清空 lease/finished bookkeeping。
- 新增 finished-before-result race contract test。
