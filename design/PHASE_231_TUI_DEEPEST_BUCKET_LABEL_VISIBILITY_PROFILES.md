# Phase231 TUI Deepest Bucket Label Visibility Profiles

## 目标

将 Phase230 的最深层分段文字标签布尔开关升级为显式 `shown`、`hidden`、`adaptive` 配置档。

## 已实现

- 使用 `liveSessionCommandDeepestNestedBucketLabelVisibilityProfile` 替代布尔状态，默认值为 `shown`。
- 命令面板内复用 `:`，按 `shown -> hidden -> adaptive -> shown` 循环。
- `adaptive` 在 120 列边界解析：低于 120 列为 `hidden`，达到或超过 120 列为 `shown`。
- formatter 根据有效配置决定是否输出 `(low/mid/high)`，并始终保留 `L/M/H`。
- Help 和 Debug 显示配置值及自适应有效值，例如：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels:shown@:`
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels:hidden@:`
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden@:`
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>shown@:`

## 状态和接口边界

- profile 仍属于 TS Host TUI 本地状态，不进入 protocol、Python Engine、provider、MCP 或 plugin 边界。
- `tuiInput.ts` 只负责面板内快捷键映射；面板外 `:` 继续打开命令面板。
- `tuiState.ts` 负责配置档循环和 120 列有效值解析。
- Help、Debug 与 formatter 复用同一解析器，避免边界判断不一致。

## 验收

- 默认、闭面板 no-op、三档循环和关闭/重开保持均有 reducer 测试。
- 119/120 列自适应边界、indicator 和隐藏标签 formatter 均有测试。
- 输入映射、Help、Debug 精确输出测试通过。
- TypeScript 编译和全量测试通过。

## 下一阶段

Phase232 可为该自适应配置档增加显式阈值提示，使 Help/Debug 直接展示 120 列切换边界。
