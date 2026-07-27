# Phase385 TUI Event Stream Subreducer

## 状态

代码、测试与文档已完成。

## 审计结论

Phase384 完成后，主 reducer switch 只剩五类跨 session/event action：session started、普通 event、assistant delta、assistant finalize 和 error。对应的 event buffer、stream coalescing、inactive unread 和错误事件 helper 也仍位于 `tuiState.ts`。

这些逻辑可以形成最后一个子 reducer；迁移后 `reduceTuiState` 不再需要主 switch，只负责有序组合各子域。

## 目标

- 建立 session/event-stream 子 reducer。
- 迁移 session started、普通事件、assistant streaming/finalize 和错误事件。
- 迁移 event buffer 更新与 stream helper。
- 将 `reduceTuiState` 收敛为纯组合器。

## 子 reducer 协议

- 五类 session/event action 返回 state。
- 空 delta 和空 standalone final message 返回原 state。
- 非 event-stream action 返回 `undefined`。
- 主组合器对最终 `undefined` 回退到原 state。

## 模块边界

- `tuiEventReducer.ts` 依赖共享 live session helper 处理 session、events 和 unread。
- `MAX_EVENTS=200`、stream coalescing、finalize 和 event buffer 写入归属 event 模块。
- `defaultNow` 从 event 模块导出，供初始 state、event factory 和 error timestamp 共用。
- renderer、controller、transport 和 transcript I/O 不进入 reducer。

## 组合顺序

`reduceTuiState` 当前依次处理：

1. command palette 来源统计；
2. cycle registry；
3. command palette reducer；
4. live session reducer；
5. history/timeline reducer；
6. shell/approval reducer；
7. prompt/turn reducer；
8. event-stream reducer；
9. 未处理 action 回退原 state。

## 验收标准

- 五类剩余 action 只存在于 event reducer。
- `reduceTuiState` 内部 action switch 数量为零。
- active/inactive session event、unread、stream append/finalize 和 error 行为保持不变。
- event helper 的兼容重导出引用一致。
- 完整构建和测试通过。

## 实现结果

- 新增 `src/cli/tuiEventReducer.ts`，承载五类 action 和四个公开 event helper。
- 主 reducer 删除最终 switch 与本地 stream/event helper，成为纯组合器。
- 新增 event reducer 契约测试，覆盖 session start、流式合并、finalize、inactive unread、error、空消息和旧入口。

## 后续推进

Phase386 将纯组合流程迁入独立 `tuiReducer.ts`，通过 factory 显式注入 cycle registry，并让 `tuiState.ts` 只保留兼容 reducer 实例。
