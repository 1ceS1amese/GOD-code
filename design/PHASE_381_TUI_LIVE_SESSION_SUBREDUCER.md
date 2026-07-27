# Phase381 TUI Live Session Subreducer

## 状态

代码、测试与文档已完成。

## 审计结论

Phase380 迁出 command palette transition 后，主 reducer 仍直接包含 13 个 live session action case，并混合维护会话排序、过滤、名称归一化、事件缓冲选择、未读清理和选区滚动等纯 helper。

`session_started`、turn status 和 event append 会跨越 engine 生命周期或事件域，因此继续由主 reducer 编排，但复用同一组会话状态 helper。

## 目标

- 建立可组合的 live session 子 reducer。
- 迁移创建占位、切换、选择、激活、关闭、置顶、重命名、过滤、排序和批量操作。
- 建立共享 live session 状态 helper 模块，避免子 reducer 与主 reducer复制算法。
- 保持主 reducer、Debug、renderer 和旧导出接口。

## 子 reducer 协议

- `reduceTuiLiveSessionState(state, action)` 返回 state 表示 action 已处理。
- 不满足运行条件的 live session action 返回原 state 引用。
- 非 live session action 返回 `undefined`，由主 reducer继续处理。
- 主 reducer 在 command palette 子 reducer 后调用 live session 子 reducer。

## 模块边界

- `tuiLiveSessionReducer.ts` 依赖共享 live session state helper，并 type-only 依赖 state/action contract。
- `tuiLiveSessionState.ts` 承载 14 个会话常量/纯 helper，包括排序、过滤、事件选择、未读、索引、归一化和滚动。
- engine lifecycle、turn、event mutation、history、approval 和 pane 通用逻辑不进入子 reducer。
- 主 reducer 的跨域路径改为导入共享 helper，不保留重复实现。

## 验收标准

- 13 个 live session case 只存在于子 reducer。
- 共享 helper 在主状态模块中无重复定义。
- unhandled 与 handled no-op 语义明确。
- 覆盖全部 action family 的序列与主 reducer 逐步结果一致。
- 会话名称/过滤归一化、pinned 排序和 unread 过滤保持不变。
- 完整构建和测试通过。

## 实现结果

- 新增 `src/cli/tuiLiveSessionReducer.ts`，承载 13 个 live session transition。
- 新增 `src/cli/tuiLiveSessionState.ts`，集中管理 14 个共享常量/纯 helper。
- 主 `tuiState.ts` 删除 live session case 和重复 helper，从 2899 行降至 2483 行。
- 新增子 reducer 契约测试，覆盖全部 action family、主 reducer 等价性和共享 helper 兼容导出。

## 后续推进

Phase382 迁出 history/timeline 生命周期和对应滚动，并通过按 pane 返回 `undefined` 的协议处理 `scroll_pane` 跨域 action。
