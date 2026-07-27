# Phase318 TUI Latest Bucket Label Control

## 状态

代码、测试与文档已完成。

## 目标与实现

为 Phase317 最新 `(low/mid/high)` 文字标签增加独立显隐控制，同时始终保留 `L/M/H`。

- 在 `TuiState` 新增默认开启的本地布尔状态 `liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisible`。
- 使用命令面板内快捷键 `5`；面板外 `5` 保持既有 live-session filter 行为。
- 新增 toggle action，reducer 仅在命令面板打开时切换状态。
- 最新 width formatter 接收可选布尔参数：开启输出 `119/120=99%H(high)`，关闭输出 `119/120=99%H`。
- 新增 control indicator，输出 `on@5` 或 `off@5`。
- Help 和 Debug 读取同一状态，并同时展示 control indicator 与 formatter 结果。

## 接口边界与验收

- 状态仅属于 TS Host TUI，不进入 protocol、Python Engine、provider、MCP、plugin 或 session schema。
- 不改变既有 profile、resolver、阈值、距离、宽度、百分比、bucket 或 label 算法。
- 默认显示标签；关闭后保留 `L/M/H`；面板关闭时 action no-op，关闭并重开后设置保持。
- `5` 仅在命令面板内映射到新 action，面板外继续映射 `set_live_session_filter`。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase319 已将布尔控制升级为 `shown/hidden/adaptive` 配置档。
