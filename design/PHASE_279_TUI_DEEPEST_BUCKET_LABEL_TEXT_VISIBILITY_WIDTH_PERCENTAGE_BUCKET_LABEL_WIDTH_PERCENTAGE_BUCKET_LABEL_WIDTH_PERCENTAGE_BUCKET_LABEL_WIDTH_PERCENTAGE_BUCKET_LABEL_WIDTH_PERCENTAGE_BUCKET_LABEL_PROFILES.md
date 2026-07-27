# Phase279 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Profiles

## 状态

代码、测试与文档已完成。

## 目标

将 Phase278 最新 `(low/mid/high)` 标签布尔开关升级为 `shown`、`hidden`、`adaptive` 配置档。

## 已实现

- 使用 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile` 替代布尔状态，默认 `shown`。
- 命令面板内复用 `0`，按 `shown -> hidden -> adaptive -> shown` 循环。
- `adaptive` 在共享 120 列边界解析：低于阈值为 `hidden`，达到或超过阈值为 `shown`。
- Phase277 formatter 根据有效配置决定是否输出 `(low/mid/high)`，始终保留 `L/M/H`。
- control indicator 输出 `shown@0`、`hidden@0`、`adaptive>hidden@0` 或 `adaptive>shown@0`。
- Help、Debug 与 formatter 复用同一 resolver。

## 状态和接口边界

- profile 仅属于 TS Host TUI，不进入 protocol、Python Engine 或持久化 session schema。
- `tuiInput.ts` 只负责命令面板内 `0` 快捷键映射。
- `tuiState.ts` 负责三档循环和有效配置解析。
- 不改变 Phase271-Phase277 的 profile、阈值、距离、宽度、百分比和 bucket 算法。

## 验收

- 默认、闭面板 no-op、三档循环和关闭/重开保持均有测试。
- 119/120 列 adaptive 边界、indicator 和 formatter 均有测试。
- TypeScript 编译、TUI 聚焦测试和全量测试通过。

## 下一阶段

Phase280 已为最新 adaptive profile 增加显式阈值提示。
