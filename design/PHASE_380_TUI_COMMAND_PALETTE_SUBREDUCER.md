# Phase380 TUI Command Palette Subreducer

## 状态

代码、测试与文档已完成。

## 审计结论

Phase379 完成 command actions 分层后，主 `reduceTuiState` 仍直接包含 16 个 command palette 专属 transition，覆盖打开/关闭、选择、滚动、首尾跳转、回绕、分组跳转、搜索、显示切换、history pin 和清理。

profile/category/sort/page size 等 cycle action 已由共享 cycle registry 处理，不应在子 reducer 中重复；真正执行 session command 的 action 仍属于主 reducer。

## 目标

- 建立可组合的 command palette 子 reducer。
- 迁移全部非 registry、非 session execution 的 palette transition。
- 明确区分未处理 action 与已处理但无状态变化的 action。
- 保持主 reducer 的 action 顺序和公开接口。

## 子 reducer 协议

- `reduceTuiCommandPaletteState(state, action)` 返回 `TuiState` 表示该 action 已处理。
- palette 关闭、空结果或边界不允许移动时返回原 `state` 引用，仍表示已处理。
- 不属于该子域的 action 返回 `undefined`，由主 reducer 后续 switch 处理。
- 主 reducer 先处理 palette command 来源统计和 cycle registry，再委托本子 reducer。

## 模块边界

- 子 reducer 运行时依赖 catalog、selectors 和 command actions helper。
- 通过 type-only import 依赖 `TuiState` 与 `TuiAction`。
- session 生命周期、pane/history/event、approval 和通用滚动不进入本模块。
- cycle registry 继续保留在主 reducer 的前置通用路径。

## 验收标准

- 16 个目标 case 只存在于子 reducer。
- 未处理 action 返回 `undefined`；关闭 palette 下的已处理 action返回原 state。
- 代表全部 16 种 action 的序列与主 reducer 逐步结果相等。
- `tuiState.js` 兼容重导出与直接函数引用一致。
- 完整构建与测试通过。

## 实现结果

- 新增 `src/cli/tuiCommandReducer.ts`，集中承载 16 个 command palette transition。
- 主 reducer 删除约 250 行内联 case，改为在 cycle registry 后组合子 reducer。
- `tuiState.ts` 从 3154 行降至 2899 行左右，并继续兼容重导出子 reducer。
- 新增组合契约测试，覆盖 unhandled、handled no-op、完整 transition 序列和旧入口。

## 后续推进

Phase381 迁出 live session 创建占位、导航、激活、关闭、置顶、重命名、过滤、排序和批量 transition，并抽取主 reducer 与子 reducer共享的会话状态 helper。
