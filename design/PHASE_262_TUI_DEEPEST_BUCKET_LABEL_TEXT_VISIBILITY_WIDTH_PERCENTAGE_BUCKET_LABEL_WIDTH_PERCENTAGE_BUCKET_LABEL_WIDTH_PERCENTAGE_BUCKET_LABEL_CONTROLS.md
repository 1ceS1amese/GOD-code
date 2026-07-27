# Phase262 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Controls

## 目标

为 Phase261 最新 `(low/mid/high)` 标签提供独立显隐控制，同时保留 `L/M/H`。

## 已实现

- `TuiState` 新增默认开启并跨命令面板关闭/重开保持的 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisible`。
- 命令面板打开时使用未冲突的 `#` 切换标签显示。
- width formatter 新增可选布尔参数：开启输出 `99%H(high)`，关闭输出 `99%H`。
- 新增 control indicator：
  - 开启：`visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:on@#`
  - 关闭：`visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:off@#`
- Help 和 Debug 读取同一状态，并通过同一 formatter 展示最终结果。
- reducer 仅在命令面板打开时处理切换。

## 接口与状态边界

- 状态仅属于 TS Host TUI，不进入 protocol、Python Engine 或持久化 session schema。
- `tuiInput.ts` 只负责将面板内 `#` 映射为 action。
- `tuiState.ts` reducer 负责切换布尔值。
- Help 和 Debug 共享 control indicator 与 formatter。

## 验收

- 默认显示文字标签，切换后只隐藏文字标签而保留 `L/M/H`。
- 面板关闭时 action 不改变状态；关闭并重新打开面板后设置保持。
- `#` 快捷键与既有映射无冲突。
- TypeScript 编译、TUI 聚焦测试和全量测试通过。

## 下一阶段

Phase263 可将布尔控制升级为 `shown/hidden/adaptive` 配置档。
