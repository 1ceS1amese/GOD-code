# Phase299 TUI Latest Bucket Label Width Percentage

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase298 最新宽度提示后追加相对共享 120 列阈值的归一化百分比。

- 新增 `liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentage(maxWidth)`，复用既有共享 percentage helper。
- 百分比继续使用整数截断、最小 0 和最大 100 的规则。
- 119 列输出 `adaptive>hidden+1[119/120=99%]@8`。
- 120 列输出 `adaptive>shown[120/120=100%]@8`。
- 180 列保留真实宽度并输出 `180/120=100%`。
- 显式 profile 不附加宽度或百分比详情。

## 接口边界与验收

- 不新增状态、action、快捷键或跨进程接口。
- percentage helper 覆盖 0、40、80、119、120、180。
- width helper 覆盖 119、120、180；indicator、Help 和 Debug 共用结果。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase300 已在百分比后追加 `L/M/H` 分段。
