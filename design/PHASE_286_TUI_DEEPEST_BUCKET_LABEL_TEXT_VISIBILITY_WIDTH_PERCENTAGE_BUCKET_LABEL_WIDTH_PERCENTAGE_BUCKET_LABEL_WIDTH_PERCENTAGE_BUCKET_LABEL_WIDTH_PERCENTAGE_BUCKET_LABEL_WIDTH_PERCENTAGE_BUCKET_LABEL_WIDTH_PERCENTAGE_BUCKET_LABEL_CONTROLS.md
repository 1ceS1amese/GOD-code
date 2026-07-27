# Phase286 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Controls

## 状态

代码、测试与文档已完成。

## 目标与实现

为 Phase285 最新 `(low/mid/high)` 标签提供独立显隐控制，同时始终保留 `L/M/H`。

- 在 `TuiState` 新增默认开启的本地布尔状态，状态仅属于 TS Host TUI。
- 使用命令面板内未占用的 `9` 作为快捷键；面板外既有输入行为保持不变。
- 新增 toggle action，reducer 仅在命令面板打开时切换状态。
- 最新 width formatter 接收可选布尔参数：
  - 开启：`119/120=99%H(high)`。
  - 关闭：`119/120=99%H`。
- 新增 control indicator：
  - 开启：`visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:on@9`。
  - 关闭：`visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:off@9`。
- Help 和 Debug 读取同一状态，并同时展示 control indicator 与 formatter 输出。

## 接口边界与验收

- 状态不进入 protocol、Python Engine、provider、MCP、plugin 或 session schema。
- 不改变既有 profile、resolver、阈值、距离、宽度、百分比、bucket 或 label 算法。
- 默认显示标签，关闭后保留 `L/M/H`；面板关闭时 action no-op，关闭并重开后设置保持。
- `9` 仅在命令面板内映射到新 action。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase287 已将布尔控制升级为 `shown/hidden/adaptive` 配置档。
