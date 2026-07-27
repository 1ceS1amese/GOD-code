# Phase304 TUI Latest Bucket Label Threshold Indicator

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase303 最新 `adaptive` 标签配置提示中显式展示共享 120 列切换阈值。

- adaptive indicator 复用 `LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_ADAPTIVE_WIDTH`。
- 119 列输出 `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden[120]@7`。
- 120 列及以上输出 `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120]@7`。
- 显式 `shown` 和 `hidden` 不追加阈值。
- Help 和 Debug 继续复用同一 indicator。

## 接口边界与验收

- 不增加新状态、action 或快捷键。
- 本阶段不显示距阈值的剩余列数。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或工具接口。
- 119/120 列 adaptive 精确输出及显式 profile 测试通过。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase305 已增加距 120 列阈值的剩余距离。
