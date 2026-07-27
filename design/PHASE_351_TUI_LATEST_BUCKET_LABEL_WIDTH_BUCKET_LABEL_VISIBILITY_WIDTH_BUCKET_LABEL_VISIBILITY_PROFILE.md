# Phase351 TUI Latest Bucket Label Width Bucket Label Visibility Width Bucket Label Visibility Profile

## 状态

代码、测试与文档已完成。

## 目标与实现

将 Phase350 快捷键 `1` 的 low/mid/high 布尔显隐控制升级为三态可见性配置档。

- `TuiState` 使用 `shown/hidden/adaptive` profile，默认值为 `shown`。
- 命令面板快捷键 `1` 驱动 cycle action，按 `shown -> hidden -> adaptive -> shown` 循环。
- 面板关闭时 cycle action no-op，关闭并重开后 profile 保持。
- resolver 复用共享 120 列阈值：119 列及以下为 `hidden`，120 列及以上为 `shown`。
- 子级 indicator 在 Phase351 基础状态下输出 `shown@1`、`hidden@1`、`adaptive>hidden@1` 或 `adaptive>shown@1`；Phase352 已为 adaptive 输出追加共享 `[120]` 阈值。
- 快捷键 `2` formatter 根据有效 profile 决定是否保留 `(low/mid/high)`，始终保留 `L/M/H`。
- Help 和 Debug 读取同一状态及 resolver。

## 接口边界与验收

- profile 仅属于 TS Host TUI，不进入 protocol、Python Engine、provider、MCP、plugin 或 session schema。
- 不改变共享阈值、百分比、bucket 或 label 算法。
- 命令面板外 `1` 继续映射既有 `activate_live_session`。
- 测试覆盖三态循环、no-op、重开保持、119/120 自适应边界、父子 formatter 协同以及 Help/Debug 输出。
- TypeScript 编译、聚焦测试、全量测试和跨层接口扫描通过。

后续 Phase352 已为 adaptive indicator 增加共享阈值提示。
