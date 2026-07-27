# Phase260 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Buckets

## 目标

在 Phase259 的最新宽度百分比后追加 `L/M/H` 分段，使当前宽度区间可被快速识别。

## 已实现

- 新增纯函数 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(maxWidth)`。
- bucket helper 复用共享的百分比分段算法。
- width indicator 输出 `current/threshold=percentage%bucket`。
- 119 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H]@-`
- 120 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H]@-`
- 180 列保留真实宽度并输出 `180/120=100%H`。
- Help、Debug 和 indicator helper 复用同一分段结果。

## 分段行为

- 0-39 列：`L`
- 40-79 列：`M`
- 80 列及以上：`H`

## 边界

- 本阶段不增加 `low/mid/high` 文字标签。
- 不新增状态、action、快捷键或配置项。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或工具接口。

## 验收

- bucket helper 覆盖 0、39、40、79、80、119 和 180 列。
- width indicator、Help 和 Debug 在 119/120 列输出一致。
- 百分比截断、封顶、阈值距离和 profile 行为保持稳定。
- TypeScript 编译和全量测试通过。

## 下一阶段

Phase261 可为 `L/M/H` 补充 `low/mid/high` 文字标签。
