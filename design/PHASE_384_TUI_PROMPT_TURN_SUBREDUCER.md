# Phase384 TUI Prompt Turn Subreducer

## 状态

代码、测试与文档已完成。

## 审计结论

Phase383 迁出 shell 状态后，主 reducer 仍直接处理 prompt 编辑和 turn 生命周期：status、append/backspace/clear、submit、finished、cancel 和 exit。这八类 action 只依赖 prompt/turn 字段及 active live session status helper，不依赖事件缓冲实现。

`session_started` 同时初始化 session、events 和 engine status，继续作为主 reducer 的跨域入口。

## 目标

- 建立 prompt/turn 子 reducer。
- 迁移 prompt 编辑、提交和 turn 状态转换。
- 保持 approval modal、running/stopping、exit 等输入门控规则。
- 让主 reducer收敛到 session-started 与 event-stream 编排。

## 子 reducer 协议

- 八类 prompt/turn action 返回 state，禁用操作返回原 state。
- 非 prompt/turn action 返回 `undefined`。
- 子 reducer 通过共享 helper 同步 active live session status。
- 主 reducer 在 shell reducer 后调用 prompt reducer。

## 模块边界

- `tuiPromptReducer.ts` 运行时只依赖 `updateActiveLiveSessionStatus`。
- state/action contract 使用 type-only import。
- event append、assistant stream、error event 写入和 session-started 不进入本模块。
- approval modal 只作为 prompt 输入门控条件读取。

## 验收标准

- 八类目标 case 只存在于 prompt reducer。
- running/stopping/approval/exit 输入门控保持不变。
- submit、cancel、finish、error 和 exit 同步正确 session status。
- 完整编辑与 turn 序列和主 reducer逐步结果一致。
- 完整构建和测试通过。

## 实现结果

- 新增 `src/cli/tuiPromptReducer.ts`，集中承载八类 prompt/turn transition。
- 主 reducer 删除对应 case，仅保留 session-started 与 event-stream/error 编排。
- 新增 prompt reducer 契约测试，覆盖禁用输入、提交取消序列、错误完成、idle cancel 和旧入口。

## 后续推进

Phase385 迁出 session-started 和 event-stream/error 逻辑，删除主 reducer最终 switch，并将 `reduceTuiState` 收敛为纯子 reducer组合器。
