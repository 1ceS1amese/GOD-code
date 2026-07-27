# Phase245 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Labels

## 目标

在 Phase244 的 `L/M/H` 分段后补充 `low/mid/high` 文字标签，使最深层文字标签显隐宽度区间同时具备紧凑值和可读语义。

## 已实现

- 新增 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabel(maxWidth)`。
- label helper 复用共享的百分比分段标签算法。
- width indicator 现在输出 `current/threshold=percentage%bucket(label)`。
- 119 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@,`
- 120 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@,`
- 180 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[180/120=100%H(high)]@,`

## 标签行为

- 0-39 列：`L(low)`
- 40-79 列：`M(mid)`
- 80 列及以上：`H(high)`

## 边界

- 本阶段不增加标签显隐状态或配置档。
- 不新增 action、快捷键或持久化配置。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或工具接口。

## 验收

- label helper 覆盖 0、39、40、79、80、119 和 180 列。
- width indicator、Help 和 Debug 在 119/120 列输出一致。
- 百分比、分段、阈值距离和 profile 行为保持稳定。
- TypeScript 编译和全量测试通过。

## 下一阶段

Phase246 可增加最深层文字标签显隐宽度百分比分段标签的显隐控制。
