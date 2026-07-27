# Phase263 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Profiles

## 目标

将 Phase262 最新文字标签布尔开关升级为 `shown`、`hidden`、`adaptive` 配置档。

## 已实现

- 使用 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile` 替代布尔状态，默认 `shown`。
- 命令面板内复用 `#`，按 `shown -> hidden -> adaptive -> shown` 循环。
- `adaptive` 在共享 120 列边界解析：低于阈值为 `hidden`，达到或超过阈值为 `shown`。
- formatter 根据有效配置决定是否输出 `(low/mid/high)`，始终保留 `L/M/H`。
- indicator 输出 `shown@#`、`hidden@#`、`adaptive>hidden@#` 或 `adaptive>shown@#`。
- Help、Debug 与 formatter 复用同一 resolver。

## 状态和接口边界

- profile 仅属于 TS Host TUI，不进入 protocol、Python Engine 或持久化 session schema。
- `tuiInput.ts` 只负责面板内 `#` 快捷键映射。
- `tuiState.ts` 负责三档循环和有效配置解析。

## 验收

- 默认、闭面板 no-op、三档循环和关闭/重开保持均有测试。
- 119/120 列 adaptive 边界、indicator 和 formatter 均有测试。
- TypeScript 编译、TUI 聚焦测试和全量测试通过。

## 下一阶段

Phase264 可为最新 adaptive profile 增加显式阈值提示。
