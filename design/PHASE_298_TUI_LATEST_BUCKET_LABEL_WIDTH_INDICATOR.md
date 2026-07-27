# Phase298 TUI Latest Bucket Label Width Indicator

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase297 最新 adaptive 阈值距离提示中同时展示当前宽度与共享 120 列阈值。

- 新增 `liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthIndicator(maxWidth)`。
- helper 输出 `current/threshold` 并复用共享阈值常量。
- 119 列输出 `adaptive>hidden+1[119/120]@8`。
- 120 列输出 `adaptive>shown[120/120]@8`。
- 180 列 helper 输出 `180/120`。
- 显式 profile 不附加宽度详情。

## 接口边界与验收

- 不新增状态、action、快捷键或跨进程接口。
- helper 覆盖 119、120、180；Help、Debug 与 indicator 共用结果。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase299 已加入相对阈值的百分比，例如 `[119/120=99%]`。
