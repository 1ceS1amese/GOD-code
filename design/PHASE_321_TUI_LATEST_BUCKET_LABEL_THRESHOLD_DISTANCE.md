# Phase321 TUI Latest Bucket Label Threshold Distance

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase320 最新 adaptive 阈值提示中展示距离共享 120 列阈值还差多少列。

- 新增纯函数 `liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance(...)`。
- 仅当 profile 为 `adaptive` 且宽度低于 120 时返回 `120 - maxWidth`。
- 119 列输出 `adaptive>hidden+1[120]@5`。
- 120 列及以上保持 `adaptive>shown[120]@5`。
- 显式 `shown/hidden` 不显示距离。
- Help、Debug 和 control indicator 共用同一 helper 结果。

## 接口边界与验收

- 不新增状态、action、快捷键或配置项。
- 本阶段不显示当前宽度，也不改变 profile resolver。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或 session schema。
- helper 覆盖 adaptive 80、119、120 及显式 profile。
- 119/120 列 control indicator、Help 和 Debug 边界输出通过测试。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase322 已加入当前宽度与阈值组合，例如 `[119/120]`。
