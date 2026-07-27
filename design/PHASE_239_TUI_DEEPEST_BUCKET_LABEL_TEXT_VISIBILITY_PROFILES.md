# Phase239 TUI Deepest Bucket Label Text Visibility Profiles

## 目标

将 Phase238 的最深层 `(low/mid/high)` 文字标签布尔开关升级为 `shown`、`hidden`、`adaptive` 配置档。

## 已实现

- 使用 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityProfile` 替代布尔状态，默认值为 `shown`。
- 命令面板内复用 `,`，按 `shown -> hidden -> adaptive -> shown` 循环。
- `adaptive` 在共享的 120 列边界解析：低于 120 列为 `hidden`，达到或超过 120 列为 `shown`。
- formatter 根据有效 profile 决定是否输出 `(low/mid/high)`，并始终保留百分比与 `L/M/H`。
- Help 和 Debug 展示配置值及自适应有效值：
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:shown@,`
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:hidden@,`
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden@,`
  - `visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown@,`

## 边界

- `:` 继续控制外层最深标签 profile，`,` 只控制本阶段的文字标签 profile。
- 面板关闭时 action 为 no-op，配置在面板关闭/重开后保持。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或工具接口。

## 验收

- 默认、闭面板 no-op、三档循环和状态保持均有 reducer 测试。
- 119/120 列自适应解析、formatter、Help 和 Debug 输出均有测试。
- `,` 输入映射和显式 profile indicator 有精确测试。
- TypeScript 编译和全量测试通过。

## 下一阶段

Phase240 可在 adaptive indicator 中显式展示共享的 120 列阈值。
