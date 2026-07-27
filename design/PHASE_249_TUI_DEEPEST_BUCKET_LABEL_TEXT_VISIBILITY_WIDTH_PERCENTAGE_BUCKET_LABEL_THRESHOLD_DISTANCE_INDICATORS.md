# Phase249 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Threshold Distance Indicators

## 目标

在 Phase248 的 120 列阈值提示基础上，展示最新 adaptive 分段标签距离可见阈值还差多少列。

## 已实现

- 新增纯函数 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance(...)`。
- 仅当 profile 为 `adaptive` 且当前宽度低于 120 时返回 `120 - maxWidth`。
- 119 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[120]@.`
- 120 列及以上保持：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120]@.`
- 显式 `shown`、`hidden` 不显示距离。
- Help、Debug 和 indicator helper 复用同一距离结果。

## 距离行为

- adaptive，80 列：`40`
- adaptive，119 列：`1`
- adaptive，120 列及以上：无距离
- shown/hidden：无距离

## 边界

- 不新增状态、action、快捷键或配置项。
- 本阶段不显示当前宽度，只显示阈值和剩余距离。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或工具接口。

## 验收

- helper 覆盖 adaptive 80、119、120 以及显式 profile。
- Help、Debug 在 119 列显示 `hidden+1[120]`，在 120 列显示 `shown[120]`。
- profile 循环、阈值提示和 formatter 行为保持稳定。
- TypeScript 编译和全量测试通过。

## 下一阶段

Phase250 可在 indicator 中加入当前宽度，例如将阈值部分扩展为 `[119/120]`。
