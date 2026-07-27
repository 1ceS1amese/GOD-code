# Phase251 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Indicators

## 目标

在 Phase250 的最新 adaptive 宽度提示中加入相对 120 列阈值的归一化百分比。

## 已实现

- 新增 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(maxWidth)`。
- percentage helper 复用共享的整数截断和 100% 封顶算法。
- width indicator 现在输出 `current/threshold=percentage%`。
- 119 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%]@.`
- 120 列输出：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%]@.`
- 180 列保留真实宽度并将百分比封顶：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[180/120=100%]@.`

## 百分比行为

- 0 列：0%
- 40 列：33%
- 80 列：66%
- 119 列：99%
- 120 列及以上：100%

## 边界

- 不增加当前层级百分比分段或分段标签。
- 不新增状态、action、快捷键或持久化配置。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或工具接口。

## 验收

- percentage helper 覆盖 0、40、80、119、120 和 180 列。
- width indicator、Help 和 Debug 对 119/120 列输出一致。
- 180 列保持真实宽度并将百分比限制为 100%。
- 距离、profile、自适应和标签显隐行为保持稳定。
- TypeScript 编译和全量测试通过。

## 下一阶段

Phase252 可将百分比映射为 `L/M/H` 分段。
