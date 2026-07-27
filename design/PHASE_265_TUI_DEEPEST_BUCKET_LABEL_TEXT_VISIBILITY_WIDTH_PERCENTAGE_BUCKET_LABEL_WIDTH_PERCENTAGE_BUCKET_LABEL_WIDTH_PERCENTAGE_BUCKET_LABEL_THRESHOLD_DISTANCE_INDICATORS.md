# Phase265 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Threshold Distance Indicators

## 目标

在 Phase264 最新 adaptive 阈值提示中展示距离 120 列阈值还差多少列。

## 已实现

- 新增纯函数 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance(...)`。
- 仅当 profile 为 `adaptive` 且宽度低于 120 时返回 `120 - maxWidth`。
- 119 列输出 `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[120]@#`。
- 120 列及以上保持 `adaptive>shown[120]@#`。
- 显式 `shown/hidden` 不显示距离。
- Help、Debug 和 indicator 共用同一结果。

## 边界

- 不新增状态、action、快捷键或配置项。
- 本阶段不显示当前宽度。
- 不修改任何跨进程接口。

## 验收

- helper 覆盖 adaptive 80、119、120 及显式 profile。
- 119/120 列 indicator 和 Help 边界输出通过测试。
- TypeScript 编译和全量测试通过。

## 下一阶段

Phase266 可加入当前宽度与阈值组合，例如 `[119/120]`。
