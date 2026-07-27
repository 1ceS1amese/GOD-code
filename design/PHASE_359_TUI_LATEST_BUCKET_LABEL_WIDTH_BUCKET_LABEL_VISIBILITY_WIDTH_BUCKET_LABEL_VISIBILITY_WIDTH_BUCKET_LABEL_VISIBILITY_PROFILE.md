# Phase359 TUI Latest Bucket Label Width Bucket Label Visibility Width Bucket Label Visibility Width Bucket Label Visibility Profile

## 状态

代码、测试与文档已完成。

## 目标与实现

将 Phase358 的 F2 布尔文字标签显隐控制升级为 `shown/hidden/adaptive` 三态 profile。

- `TuiState` 使用默认 `shown` 的最新 width bucket label visibility profile。
- 命令面板内 `F2` 按 `shown -> hidden -> adaptive -> shown` 循环。
- 命令面板关闭时 cycle action no-op，关闭并重开后 profile 保持。
- resolver 复用共享 120 列阈值：119 列及以下解析为 `hidden`，120 列及以上解析为 `shown`。
- 父级快捷键 `1` formatter 根据有效 profile 决定是否保留 `(low/mid/high)`。
- 子级 indicator 输出 `shown@F2`、`hidden@F2`、`adaptive>hidden@F2` 或 `adaptive>shown@F2`。
- Help 和 Debug 使用同一 profile 与 resolver。

## 接口边界与验收

- profile 仅属于 TS Host TUI，不进入 protocol、Python Engine、provider、MCP、plugin、transcript 或 session schema。
- 不改变共享阈值、百分比、bucket 或 label 算法。
- 命令面板外 `F2` 继续保持 no-op。
- 测试覆盖三态循环、面板关闭 no-op、重开保持、119/120 自适应边界、父子 formatter 协同和 Help/Debug 输出。
- TypeScript 编译、聚焦测试、全量测试和跨层接口扫描通过。

后续 Phase360 已为 adaptive indicator 增加共享 `[120]` 阈值提示。
