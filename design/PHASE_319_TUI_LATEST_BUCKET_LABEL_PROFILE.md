# Phase319 TUI Latest Bucket Label Profile

## 状态

代码、测试与文档已完成。

## 目标与实现

将 Phase318 最新文字标签的布尔显隐控制升级为 `shown/hidden/adaptive` 三档配置。

- `TuiState` 使用 `liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile`，默认值为 `shown`。
- 命令面板内快捷键 `5` 循环 `shown -> hidden -> adaptive -> shown`；面板外仍保持既有 live-session filter 行为。
- resolver 复用共享 120 列阈值：119 列解析为 `hidden`，120 列解析为 `shown`。
- 父级 width indicator、Help 和 Debug 使用 resolver 的有效值决定是否输出 `(low/mid/high)`。
- control indicator 输出 `shown@5`、`hidden@5`、`adaptive>hidden@5` 或 `adaptive>shown@5`。

## 接口边界与验收

- profile 只属于 TS Host TUI，不进入 protocol、Python Engine、provider、MCP、plugin 或 session schema。
- 不修改共享阈值、百分比、bucket 和 label 算法。
- action 仅在命令面板打开时生效，关闭并重开后 profile 保持。
- 119/120 边界、Input、Reducer、Help、Debug 和 formatter 联动已有测试覆盖。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase320 已为最新 adaptive profile 增加共享 120 列阈值提示。
