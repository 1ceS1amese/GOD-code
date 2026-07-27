# Phase246 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Controls

## 目标

为 Phase245 新增的最深层文字标签显隐宽度分段标签 `(low/mid/high)` 提供独立显隐控制，同时保留紧凑分段符号 `L/M/H`。

## 已实现

- `TuiState` 新增默认开启且跨命令面板关闭/重开保持的 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisible`。
- 命令面板打开时使用 `.` 切换标签显示。
- formatter 新增可选布尔参数：开启时输出 `99%H(high)`，关闭时输出 `99%H`。
- 新增 control indicator：
  - 开启：`visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:on@.`
  - 关闭：`visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:off@.`
- Help 和 Debug 读取同一状态，并通过同一 formatter 展示最终结果。
- reducer 仅在命令面板打开时处理切换。

## 接口与状态边界

- 状态归属：TS Host TUI 本地状态，不进入 protocol、Python Engine 或持久化 session schema。
- 输入边界：`tuiInput.ts` 只负责将面板内 `.` 映射为 action。
- 状态变更：`tuiState.ts` reducer 负责切换布尔值。
- 展示边界：`tuiHelp.ts` 和 `tuiDebug.ts` 共享 control indicator 与 formatter。

## 验收

- 默认显示 `(low/mid/high)`，切换后只隐藏文字标签，不隐藏 `L/M/H`。
- 面板关闭时 action 不改变状态；关闭并重新打开面板后设置保持。
- `.` 的面板内输入映射有测试覆盖。
- TypeScript 编译、TUI 聚焦测试和全量测试通过。

## 下一阶段

Phase247 可将布尔控制升级为 `shown/hidden/adaptive` 配置档，并继续复用 formatter 参数和 Help/Debug 接线。
