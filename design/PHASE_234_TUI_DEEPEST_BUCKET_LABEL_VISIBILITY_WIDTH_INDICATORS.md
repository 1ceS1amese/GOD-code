# Phase234 TUI Deepest Bucket Label Visibility Width Indicators

## 目标

在 Phase233 的最深层 adaptive 标签显隐提示中同时展示当前宽度和共享的 120 列阈值。

## 已实现

- 新增 `liveSessionCommandDeepestNestedBucketLabelVisibilityWidthIndicator(maxWidth)`。
- width helper 输出精确的 `current/threshold` 文本，并复用共享阈值常量。
- 119 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120]@:`
- 120 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120]@:`
- 180 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[180/120]@:`
- Phase233 的 `+N` 距离在阈值以下继续保留。
- 显式 `shown/hidden` profile 不附加宽度详情。

## 边界

- 不计算或显示宽度百分比；该能力留给下一阶段。
- 不新增状态、action、快捷键或外部持久化配置。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或工具接口。

## 验收

- width helper 覆盖 119、120 和 180 列。
- Help、Debug 和 indicator helper 对 119/120 列输出一致。
- 距离、profile 循环、自适应有效值和文字标签显隐行为保持稳定。
- TypeScript 编译和全量测试通过。

## 下一阶段

Phase235 可加入当前宽度相对 120 列阈值的百分比，例如 `[119/120=99%]`。
