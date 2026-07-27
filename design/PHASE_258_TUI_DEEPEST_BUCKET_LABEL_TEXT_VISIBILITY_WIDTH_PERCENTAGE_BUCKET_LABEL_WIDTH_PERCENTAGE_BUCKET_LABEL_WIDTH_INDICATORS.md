# Phase258 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Bucket Label Width Indicators

## 目标

在 Phase257 的最新 adaptive 阈值距离提示中同时展示当前宽度和共享的 120 列阈值。

## 已实现

- 新增纯函数 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(maxWidth)`。
- width helper 输出 `current/threshold`，阈值复用 adaptive profile resolver 使用的共享常量。
- 119 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120]@-`
- 120 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120]@-`
- 180 列输出的 width helper 为 `180/120`。
- 阈值以下继续保留 `+N` 距离；显式 `shown/hidden` 不附加宽度详情。
- Help、Debug 和 indicator helper 复用同一宽度结果。

## 边界

- 本阶段不计算或显示当前层级宽度百分比。
- 不新增状态、action、快捷键或配置项。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或工具接口。

## 验收

- width helper 覆盖 119、120 和 180 列。
- Help、Debug 在 119/120 列展示对应 `current/threshold`。
- 距离、profile 循环、自适应有效值和 formatter 行为保持稳定。
- TypeScript 编译和全量测试通过。

## 下一阶段

Phase259 可加入当前宽度相对 120 列阈值的百分比，例如 `[119/120=99%]`。
