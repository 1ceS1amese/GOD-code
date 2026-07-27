# Phase314 TUI Latest Bucket Label Width Indicator

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase313 最新 adaptive 阈值距离提示中同时展示当前宽度与共享 120 列阈值。

- 新增 `liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(maxWidth)`。
- helper 输出 `current/threshold` 并复用共享阈值常量。
- 119 列输出 `adaptive>hidden+1[119/120]@6`。
- 120 列输出 `adaptive>shown[120/120]@6`。
- 180 列 helper 输出 `180/120`。
- 显式 profile 不附加宽度详情。

## 接口边界与验收

- 不新增状态、action、快捷键或配置项。
- 不改变 profile resolver、距离计算或标签显隐判定。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或 session schema。
- helper 覆盖 119、120、180；Help、Debug 与 control indicator 共用结果。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase315 已加入相对阈值百分比，例如 `[119/120=99%]`。
