# Phase383 TUI Shell Approval Subreducer

## 状态

代码、测试与文档已完成。

## 审计结论

Phase382 迁出 history/timeline 后，主 reducer 剩余的纯 UI shell 状态包括 pane 切换、events/live/help 滚动、Help/Debug overlay、强制重绘和 approval modal。它们不依赖 engine turn 或 event mutation。

`scroll_pane` 的 history/timeline 所有权已经属于 Phase382，因此 shell reducer 必须对这两个目标返回 `undefined`，而不是覆盖前一子域协议。

## 目标

- 建立 UI shell/approval 子 reducer。
- 迁移 pane、剩余滚动、overlay、redraw 和 approval modal transition。
- 与 history reducer 共同完成 `scroll_pane` 的按 pane 分派。
- 让主 reducer进一步收敛到 engine/prompt/event 状态。

## 子 reducer 协议

- shell 专属 action 返回 state；无法滚动或 prompt pane 滚动返回原 state。
- events/live/help scroll 由 shell reducer处理。
- history/timeline scroll 返回 `undefined`，由排列在前的 history reducer处理。
- 非 shell action 返回 `undefined`。

## 模块边界

- `tuiShellReducer.ts` 依赖共享 clamp 和 live session visible-index selector。
- pane/state/action contract 通过 type-only import 获取。
- approval modal 只负责显示状态，不包含审批决策或 controller I/O。
- engine lifecycle、prompt submit、event stream 和错误写入不进入 shell reducer。

## 验收标准

- 七类 shell action 只存在于新模块。
- history/timeline scroll 不被 shell reducer截获。
- events/live/help/prompt scroll 保持既有方向和边界语义。
- shell、overlay、approval 完整序列与主 reducer逐步结果一致。
- 完整构建和测试通过。

## 实现结果

- 新增 `src/cli/tuiShellReducer.ts`，承载七类 UI shell/approval action。
- 主 reducer 删除 pane、剩余 scroll、Help/Debug、redraw 和 approval modal case。
- 新增 shell 契约测试，覆盖滚动所有权、handled no-op、overlay/approval 生命周期和旧入口。

## 后续推进

Phase384 迁出 prompt 编辑、提交、status、turn finished、cancel 和 exit，使主 reducer进一步收敛到 session-started 与 event-stream 编排。
