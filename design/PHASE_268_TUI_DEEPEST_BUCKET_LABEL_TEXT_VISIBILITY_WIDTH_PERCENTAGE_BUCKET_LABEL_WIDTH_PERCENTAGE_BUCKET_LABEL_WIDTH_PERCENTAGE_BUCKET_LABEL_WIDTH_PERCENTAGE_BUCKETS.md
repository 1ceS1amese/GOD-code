# Phase268 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Buckets

## 目标

在 Phase267 最新宽度百分比后追加 `L/M/H` 分段。

## 已实现

- 新增 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(maxWidth)`。
- 复用共享分段算法：0-39 列为 `L`、40-79 列为 `M`、80 列及以上为 `H`。
- 119 列输出 `adaptive>hidden+1[119/120=99%H]@#`。
- 120 列输出 `adaptive>shown[120/120=100%H]@#`。
- 180 列保留真实宽度并输出 `180/120=100%H`。
- Help、Debug 和 indicator 共用同一 bucket helper。

## 边界

- 本阶段不增加 `low/mid/high` 文字标签。
- 不新增状态、action、快捷键或跨层接口。

## 验收

- bucket helper 覆盖 0、39、40、79、80 等边界。
- TypeScript 编译、TUI 聚焦测试和全量测试通过。

## 下一阶段

Phase269 可补充 `low/mid/high` 文字标签。
