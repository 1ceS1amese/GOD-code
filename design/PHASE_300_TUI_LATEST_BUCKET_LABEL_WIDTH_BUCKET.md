# Phase300 TUI Latest Bucket Label Width Bucket

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase299 最新宽度百分比后追加 `L/M/H` 分段。

- 新增 `liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucket(maxWidth)`。
- helper 委托既有共享 bucket 算法，避免重复分段边界。
- 共享规则保持：0-39 列为 `L`、40-79 列为 `M`、80 列及以上为 `H`。
- 119 列输出 `adaptive>hidden+1[119/120=99%H]@8`。
- 120 列输出 `adaptive>shown[120/120=100%H]@8`。
- 180 列保留真实宽度并输出 `180/120=100%H`。

## 接口边界与验收

- 本阶段不增加 `low/mid/high` 文字标签。
- 不新增状态、action、快捷键或跨进程接口。
- bucket helper 覆盖 0、39、40、79、80、120 边界。
- indicator、Help 和 Debug 共用同一 bucket helper 结果。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase301 已补充 `low/mid/high` 文字标签。
