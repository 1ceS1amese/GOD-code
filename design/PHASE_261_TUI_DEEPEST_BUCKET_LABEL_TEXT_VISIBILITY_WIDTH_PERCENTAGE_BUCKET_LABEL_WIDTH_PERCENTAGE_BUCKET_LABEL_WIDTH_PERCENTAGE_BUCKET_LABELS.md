# Phase261 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Labels

## 目标

在 Phase260 的最新 `L/M/H` 分段后补充 `low/mid/high` 文字标签。

## 已实现

- 新增纯函数 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(maxWidth)`。
- label helper 复用共享的百分比分段标签算法。
- width indicator 输出 `current/threshold=percentage%bucket(label)`。
- 119 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@-`
- 120 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@-`
- 180 列保留真实宽度并输出 `180/120=100%H(high)`。
- Help、Debug 和 indicator helper 复用同一标签结果。

## 标签行为

- 0-39 列：`L(low)`
- 40-79 列：`M(mid)`
- 80 列及以上：`H(high)`

## 边界

- 本阶段不增加最新文字标签的独立显隐状态或配置档。
- 不新增 action、快捷键或配置项。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或工具接口。

## 验收

- label helper 覆盖 0、39、40、79、80、119 和 180 列。
- width indicator、Help 和 Debug 在 119/120 列输出一致。
- 百分比、分段、阈值距离和 profile 行为保持稳定。
- TypeScript 编译和全量测试通过。

## 下一阶段

Phase262 可增加最新 `low/mid/high` 标签的独立显隐控制。
