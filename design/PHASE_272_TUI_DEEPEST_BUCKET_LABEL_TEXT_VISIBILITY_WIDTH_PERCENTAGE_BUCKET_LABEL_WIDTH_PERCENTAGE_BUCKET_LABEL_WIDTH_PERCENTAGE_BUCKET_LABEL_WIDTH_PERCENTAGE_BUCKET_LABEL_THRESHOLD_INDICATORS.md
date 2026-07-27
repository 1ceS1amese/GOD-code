# Phase272 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Threshold Indicators

## 状态

代码、测试与文档已完成。

## 目标

在 Phase271 最新 `adaptive` 配置提示中显式展示共享 120 列切换阈值。

## 已实现

- adaptive indicator 复用 `LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_ADAPTIVE_WIDTH`。
- 119 列输出 `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden[120]@$`。
- 120 列及以上输出 `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120]@$`。
- 显式 `shown` 和 `hidden` 不追加阈值。
- Help 和 Debug 继续复用同一 indicator。

## 边界

- 不增加新状态、action 或快捷键。
- 本阶段不显示距阈值的剩余列数。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或工具接口。

## 验收

- 119/120 列 adaptive 精确输出通过测试。
- Help、Debug、显式 profile、三档循环和持久性行为保持正确。
- TypeScript 编译、聚焦测试和全量测试通过。

## 下一阶段

Phase273 已增加距 120 列阈值的剩余距离。
