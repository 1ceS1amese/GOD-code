# Phase420 Finalized Event Fan-Out Guard

## 状态

代码、测试与文档已完成。

## 审计结论

Phase415 的 finalized registry 已阻止晚到 cancel 和 tool request 重新激活已结束 turn，但 `god_code_event` 在 Phase416-419 完成 schema validation 后仍无条件 emit。消息重排或 Engine bug 因此可让晚到 assistant delta、tool result、error 或重复 turn_finished 污染 TUI、raw event collector 和其他 Host listeners。

## 目标

- 首个合法 `turn_finished` 保持原有 lifecycle cleanup 和 listener emission。
- finalized turn 的后续所有 turn-scoped events 不再 fan-out。
- 重复 `turn_finished` 不重复 resolve consumer、不刷新 registry 顺序。
- `session_started` 不参与 turn finalization gate。
- 相同 turn_id 在不同 session 中继续隔离。
- 复用容量 1024 的现有 registry，不增加无界状态。

## Host Event Flow

事件先经过完整 envelope/payload validation，再执行：

1. `session_started` 直接 emit。
2. 计算 `(session_id, turn_id)` composite key。
3. key 已 finalized：静默丢弃，不 mutation、不 emit。
4. 首个 `turn_finished`：执行 `finishTurn` 后 emit。
5. 其他 active turn event：正常 emit。

Validation 始终先于 suppression，非法晚到事件仍保持 invalid-params boundary，而不是被 finalized 状态掩盖。

## 验收标准

- 首次 terminal event 只 emit 一次并记录 finalized key。
- 同 turn 的 late assistant/error 和重复 terminal event 不 emit。
- 其他 session 的相同 turn_id 正常 emit。
- session_started 正常 emit。
- finalized registry 大小和 insertion order 不因重复 terminal event变化。
- TypeScript/Python 全量测试及跨语言 integration 全部通过。

## 实现结果

- `handleGodCodeEvent` 在 validation 后增加 finalized fan-out gate。
- 移除 `turn_id!`，依赖 discriminated event union 的类型保证。
- Process lifecycle test 覆盖 late、duplicate、cross-session 和 session-scoped cases。
