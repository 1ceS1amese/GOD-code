# Phase382 TUI History Timeline Subreducer

## 状态

代码、测试与文档已完成。

## 审计结论

Phase381 迁出 live session transition 后，主 reducer 仍包含 history 选择与激活、history loading/data、selected timeline 和 history/timeline 滚动。`scroll_pane` 同时服务 events、live、history、timeline、help，因此不能整项迁移，必须按实际 pane 部分接管。

## 目标

- 建立 history/timeline 子 reducer。
- 迁移历史选择、激活、加载、数据设置和 timeline 设置。
- 仅接管 history/timeline 两种滚动目标，保留其他 pane 的主 reducer行为。
- 保持 action 顺序、旧导出和主 reducer 结果。

## 子 reducer 协议

- history/timeline 专属 action 返回 state，空 history 等条件下返回原 state。
- `scroll_pane` 的显式 pane 或当前 active pane 为 history/timeline 时由子 reducer处理。
- events/live/help/prompt 的 `scroll_pane` 返回 `undefined`，继续交由主 reducer。
- 其他 action 返回 `undefined`。

## 模块边界

- `tuiHistoryReducer.ts` 运行时只依赖共享 `clamp` 和 `scrollSelectionIntoView` helper。
- history/timeline 数据 contract 通过 type-only import 获取。
- transcript 加载 I/O、session 激活执行、renderer 和 controller 不进入 reducer。
- 主 reducer 继续拥有 events/live/help 的通用滚动分支。

## 验收标准

- 五项专属 action 和 history/timeline scroll 只由子 reducer实现。
- 非目标 pane scroll 返回 `undefined`，不会阻止主 reducer。
- active pane fallback 与显式 pane 行为一致。
- history/timeline 完整生命周期序列与主 reducer逐步结果相同。
- 完整构建和测试通过。

## 实现结果

- 新增 `src/cli/tuiHistoryReducer.ts`，承载六类 history/timeline action。
- 主 reducer 删除 history/timeline 专属 case，并从 `scroll_pane` 移除两个目标分支。
- 新增子 reducer 契约测试，覆盖滚动所有权、active pane fallback、生命周期等价性和旧入口。

## 后续推进

Phase383 迁出 pane、events/live/help scroll、Help/Debug、redraw 和 approval modal，并与 history reducer共同完成 `scroll_pane` 的域分派。
