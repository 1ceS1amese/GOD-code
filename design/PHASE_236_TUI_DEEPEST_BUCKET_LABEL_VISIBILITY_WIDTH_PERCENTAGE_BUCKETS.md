# Phase236 TUI Deepest Bucket Label Visibility Width Percentage Buckets

## 目标

将 Phase235 的最深层宽度百分比映射为共享的 `L/M/H` 分段，并附加到 adaptive indicator。

## 已实现

- 新增 `liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucket(maxWidth)`。
- bucket helper 委托给共享的图例宽度百分比分段逻辑。
- width indicator 现在输出 `current/threshold=percentage%bucket`。
- 119 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H]@:`
- 120 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H]@:`
- 180 列保持真实宽度、封顶百分比和高分段：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[180/120=100%H]@:`

## 分段行为

- 低区间使用 `L`
- 中区间使用 `M`
- 高区间使用 `H`
- 代表边界覆盖 0、39、40、79、80、119 和 180 列

## 边界

- 本阶段不显示 `low/mid/high` 文字标签。
- 不新增状态、action、快捷键或持久化配置。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或工具接口。

## 验收

- bucket helper 委托共享算法并覆盖 L/M/H 边界。
- width indicator、Help 和 Debug 在 119/120 列输出一致。
- 百分比封顶、距离、profile 和标签显隐行为保持稳定。
- TypeScript 编译和全量测试通过。

## 下一阶段

Phase237 可为 `L/M/H` 增加对应的 `(low/mid/high)` 文字标签。
