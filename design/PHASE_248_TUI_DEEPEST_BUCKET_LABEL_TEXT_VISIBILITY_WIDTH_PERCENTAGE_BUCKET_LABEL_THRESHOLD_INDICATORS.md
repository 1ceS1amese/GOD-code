# Phase248 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Threshold Indicators

## 目标

在 Phase247 的最新 `adaptive` 配置提示中显式展示共享的 120 列切换阈值。

## 已实现

- adaptive indicator 复用 `LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_ADAPTIVE_WIDTH`，不复制阈值字面量。
- 低于阈值时输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden[120]@.`
- 达到或超过阈值时输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120]@.`
- 显式 `shown` 和 `hidden` 保持紧凑格式，不追加阈值。
- Help 和 Debug 继续复用同一 indicator。

## 边界

- 本阶段不增加新状态、action 或快捷键。
- 不增加距阈值的剩余列数。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或工具接口。

## 验收

- 119 列精确输出 `adaptive>hidden[120]`。
- 120 列精确输出 `adaptive>shown[120]`。
- Help、Debug 和 indicator helper 均覆盖边界输出。
- 显式 profile、三档循环和持久性行为保持不变。
- TypeScript 编译和全量测试通过。

## 下一阶段

Phase249 可增加距 120 列阈值的剩余距离，例如在 119 列显示 `hidden+1[120]`。
