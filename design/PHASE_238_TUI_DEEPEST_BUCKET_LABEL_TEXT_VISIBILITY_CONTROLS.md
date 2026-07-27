# Phase238 TUI Deepest Bucket Label Text Visibility Controls

## 目标

为 Phase237 新增的最深层 `(low/mid/high)` 分段文字标签提供独立显隐控制，同时始终保留 `L/M/H`。

## 已实现

- 在 `TuiState` 中新增默认开启的 `liveSessionCommandDeepestNestedBucketLabelTextVisible`。
- 命令面板内使用 `,` 切换文字标签显隐。
- reducer 仅在命令面板打开时处理切换，并在面板关闭/重开后保持状态。
- width formatter 新增可选参数：
  - 开启：`119/120=99%H(high)`
  - 关闭：`119/120=99%H`
- adaptive profile indicator 复用该 formatter 参数。
- Help 和 Debug 展示：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:on@,`
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:off@,`

## 快捷键边界

- `:` 继续循环最深层标签 profile。
- `,` 只在命令面板打开时切换新文字标签。
- 命令面板外的普通输入行为不受影响。

## 接口边界

- 状态仅属于 TS Host TUI，不进入 protocol、Python Engine 或 session schema。
- input、reducer、formatter、Help 和 Debug 各自保持既有职责。
- 不修改 provider、MCP、plugin 或工具接口。

## 验收

- 默认开启、闭面板 no-op、开关循环和关闭/重开保持均有测试。
- 关闭时只隐藏 `(low/mid/high)`，继续保留百分比和 `L/M/H`。
- `,` 输入映射、Help、Debug 和 indicator 精确输出均有测试。
- TypeScript 编译和全量测试通过。

## 下一阶段

Phase239 可将该布尔控制升级为 `shown/hidden/adaptive` profile。
