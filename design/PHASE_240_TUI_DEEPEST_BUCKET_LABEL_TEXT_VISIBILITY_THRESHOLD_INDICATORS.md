# Phase240 TUI Deepest Bucket Label Text Visibility Threshold Indicators

## 目标

在 Phase239 的最深层文字标签 `adaptive` profile indicator 中显式展示共享的 120 列切换阈值。

## 已实现

- adaptive indicator 直接复用 `LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_ADAPTIVE_WIDTH`。
- 低于阈值时输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden[120]@,`
- 达到或超过阈值时输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120]@,`
- 显式 `shown` 和 `hidden` indicator 保持紧凑，不追加阈值。
- Help 和 Debug 继续复用同一 indicator helper。

## 边界

- 本阶段不显示距离阈值的剩余列数。
- 不新增状态、action、快捷键或配置项。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或工具接口。

## 验收

- 119 列精确输出 `adaptive>hidden[120]`。
- 120 列精确输出 `adaptive>shown[120]`。
- Help、Debug 和 helper 均覆盖 119/120 边界。
- Phase239 profile 循环、状态保持和 formatter 显隐保持稳定。
- TypeScript 编译和全量测试通过。

## 下一阶段

Phase241 可增加距 120 列阈值的剩余距离，例如 `adaptive>hidden+1[120]`。
