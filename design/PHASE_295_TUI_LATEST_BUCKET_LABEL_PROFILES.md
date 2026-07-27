# Phase295 TUI Latest Bucket Label Profiles

## 状态

代码、测试与文档已完成。

## 目标与实现

将 Phase294 最新文字标签的布尔显隐控制升级为 `shown/hidden/adaptive` 三档配置。

- `TuiState` 使用 `liveSessionCommandLatestDeepestBucketLabelTextVisibilityProfile`，默认值为 `shown`。
- 命令面板内继续使用快捷键 `8`，按 `shown -> hidden -> adaptive -> shown` 循环；面板外仍输入普通字符 `8`。
- `adaptive` 复用共享 120 列阈值：119 列解析为 `hidden`，120 列解析为 `shown`。
- formatter、Help、Debug 与 control indicator 复用同一 resolver，避免显示结果分叉。
- control indicator 输出 `shown@8`、`hidden@8`、`adaptive>hidden@8` 或 `adaptive>shown@8`。
- 隐藏文字标签时仅移除 `(low/mid/high)`，保留 `L/M/H` 分段。

## 接口边界与验收

- 状态仅属于 TS Host TUI，不进入 protocol、Python Engine、provider、MCP、plugin 或 session schema。
- action 仅在命令面板打开时生效，关闭并重开后配置保持。
- 119/120 边界、显式配置、循环顺序、输入映射及 Help/Debug 一致性均有测试覆盖。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase296 已为该 adaptive control indicator 增加共享阈值提示。
