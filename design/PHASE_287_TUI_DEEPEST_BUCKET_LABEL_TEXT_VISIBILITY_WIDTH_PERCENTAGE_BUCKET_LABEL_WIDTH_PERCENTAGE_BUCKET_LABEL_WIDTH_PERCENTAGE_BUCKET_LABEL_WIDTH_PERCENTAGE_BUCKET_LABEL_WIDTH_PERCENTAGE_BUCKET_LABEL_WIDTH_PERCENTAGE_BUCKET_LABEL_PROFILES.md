# Phase287 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Profiles

## 状态

代码、测试与文档已完成。

## 目标与实现

将 Phase286 最新 `(low/mid/high)` 标签布尔开关升级为 `shown`、`hidden`、`adaptive` 配置档。

- 使用三档 profile 替代布尔状态，默认 `shown`。
- 命令面板内复用 `9`，按 `shown -> hidden -> adaptive -> shown` 循环。
- 新增纯 resolver；`adaptive` 在共享 120 列边界解析，低于阈值为 `hidden`，达到或超过阈值为 `shown`。
- Phase285 formatter 根据有效配置决定是否输出 `(low/mid/high)`，始终保留 `L/M/H`。
- control indicator 输出 `shown@9`、`hidden@9`、`adaptive>hidden@9` 或 `adaptive>shown@9`。
- Help、Debug 与 formatter 复用同一 resolver。

## 状态和接口边界

- profile 仅属于 TS Host TUI，不进入 protocol、Python Engine、provider、MCP、plugin 或持久化 session schema。
- `tuiInput.ts` 只负责命令面板内 `9` 快捷键映射，面板外 `9` 保持原有 prompt 输入行为。
- `tuiState.ts` 负责三档循环和有效配置解析。
- 不改变既有 profile、阈值、距离、宽度、百分比、bucket 和 label 算法。

## 验收与下一阶段

- 默认、闭面板 no-op、三档循环和关闭/重开保持均有测试。
- 119/120 列 adaptive 边界、indicator、formatter、Help 和 Debug 均有测试。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase288 已为最新 adaptive profile 增加显式阈值提示。
