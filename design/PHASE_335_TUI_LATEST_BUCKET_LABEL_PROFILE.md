# Phase335 TUI Latest Bucket Label Profile

## 状态

代码、测试与文档已完成。

## 目标与实现

将 Phase334 最新 `(low/mid/high)` 文字标签的布尔控制升级为三档可见性配置。

- `TuiState` 使用 `shown/hidden/adaptive` profile，默认值为 `shown`。
- 命令面板快捷键 `3` 驱动 cycle action，按 `shown -> hidden -> adaptive -> shown` 循环；面板关闭时 action no-op，重开后状态保持。
- 新增 resolver；`adaptive` 复用共享 120 列阈值，119 列及以下解析为 `hidden`，120 列及以上解析为 `shown`。
- control indicator 显式配置输出 `shown@3` 或 `hidden@3`；Phase336 后 adaptive 配置输出 `adaptive>hidden[120]@3` 或 `adaptive>shown[120]@3`。
- 最新 width formatter 根据有效 profile 决定是否保留 `(low/mid/high)`；`L/M/H` 始终保留。
- 父级快捷键 `4` indicator、Help 和 Debug 复用同一 resolver，避免展示状态与 formatter 结果分叉。

## 接口边界与验收

- profile 仅属于 TS Host TUI，不进入 protocol、Python Engine、provider、MCP、plugin 或 session schema。
- 不改变共享阈值、距离、宽度、百分比、bucket 或 label 算法。
- `3` 仅在命令面板内映射到 cycle action；面板外继续映射 `close_live_session`。
- 119 列下 adaptive 隐藏文字标签，父级 `4` indicator 不包含 `(high)`；120 列下 adaptive 显示文字标签并包含 `(high)`。
- TypeScript 编译、聚焦测试、全量测试和跨层接口扫描通过。
- Phase336 已在 adaptive control indicator 中增加共享 `[120]` 阈值提示。
