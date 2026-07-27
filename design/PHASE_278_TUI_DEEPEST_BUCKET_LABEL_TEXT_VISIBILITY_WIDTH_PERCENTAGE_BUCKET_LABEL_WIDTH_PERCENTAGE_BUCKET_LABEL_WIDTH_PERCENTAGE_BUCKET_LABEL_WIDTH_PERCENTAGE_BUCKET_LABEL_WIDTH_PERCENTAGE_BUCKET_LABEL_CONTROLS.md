# Phase278 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Controls

## 状态

代码、测试与文档已完成。

## 目标

为 Phase277 最新 `(low/mid/high)` 标签提供独立显隐控制，同时始终保留 `L/M/H`。

## 已实现

- 在 `TuiState` 新增默认开启的本地布尔状态：
  - `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisible`
- 使用命令面板内未占用的 `0` 作为快捷键；面板外 `0` 的 live quick action 行为保持不变。
- 新增 toggle action，reducer 仅在命令面板打开时切换状态。
- 最新 width formatter 接收可选布尔参数：
  - 开启：`119/120=99%H(high)`
  - 关闭：`119/120=99%H`
- 新增 control indicator：
  - 开启：`visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:on@0`
  - 关闭：`visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:off@0`
- Help 和 Debug 读取同一状态，并将 control indicator 与最终 formatter 输出同时展示。

## 接口边界

- 状态仅属于 TS Host TUI。
- 不进入 protocol、Python Engine、provider、MCP、plugin 或 session schema。
- 不改变 Phase271-Phase277 的 profile、resolver、阈值、距离、宽度、百分比和 bucket 算法。

## 验收

- 默认显示标签，关闭后保留 `L/M/H`。
- 面板关闭时 action no-op；关闭并重新打开面板后设置保持。
- `0` 仅在命令面板内映射到新 action。
- Help、Debug、formatter、reducer 和输入映射均有精确测试。
- TypeScript 编译、TUI 聚焦测试和全量测试通过。

## 后续阶段

Phase279 已将该布尔控制升级为 `shown/hidden/adaptive` 配置档。
