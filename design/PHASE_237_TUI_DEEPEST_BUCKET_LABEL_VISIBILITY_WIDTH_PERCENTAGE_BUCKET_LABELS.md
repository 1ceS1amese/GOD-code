# Phase237 TUI Deepest Bucket Label Visibility Width Percentage Bucket Labels

## 目标

为 Phase236 的最深层 `L/M/H` 宽度百分比分段增加对应的 `low/mid/high` 文字标签。

## 已实现

- 新增 `liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucketLabel(maxWidth)`。
- label helper 委托给共享的图例宽度百分比分段标签逻辑。
- width indicator 现在输出 `current/threshold=percentage%bucket(label)`。
- 119 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@:`
- 120 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@:`
- 180 列保持真实宽度、封顶百分比、bucket 和标签：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[180/120=100%H(high)]@:`

## 标签行为

- `L` 对应 `low`
- `M` 对应 `mid`
- `H` 对应 `high`
- 代表边界覆盖 0、39、40、79、80、119 和 180 列

## 边界

- 本阶段不增加该文字标签的独立显隐控制。
- 不新增状态、action、快捷键或持久化配置。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或工具接口。

## 验收

- label helper 委托共享算法并覆盖 low/mid/high 边界。
- width indicator、Help 和 Debug 在 119/120 列输出一致。
- 百分比、bucket、距离、profile 和既有标签显隐行为保持稳定。
- TypeScript 编译和全量测试通过。

## 下一阶段

Phase238 可为本阶段新增的 `(low/mid/high)` 标签提供独立显隐控制。
