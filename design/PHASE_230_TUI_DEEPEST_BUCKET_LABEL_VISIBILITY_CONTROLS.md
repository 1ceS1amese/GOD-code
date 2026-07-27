# Phase230 TUI Deepest Bucket Label Visibility Controls

## 目标

为 Phase229 新增的最深层宽度百分比分段标签 `(low/mid/high)` 提供独立显隐控制，同时保留紧凑分段符号 `L/M/H`。

## 已实现

- 在 `TuiState` 中新增默认开启且跨命令面板关闭/重开保持的 `liveSessionCommandDeepestNestedBucketLabelVisible`。
- 命令面板打开时使用 `:` 切换标签；命令面板关闭时，`:` 仍保持原有的打开命令面板行为。
- formatter 新增可选布尔参数：开启时输出 `99%H(high)`，关闭时输出 `99%H`。
- Help 和 Debug 同步展示 `visibility_bucket_labels_labels_labels_labels_labels_labels_labels:on@:` 或 `off@:`。
- reducer 仅在命令面板打开时处理切换，避免全局快捷键语义冲突。

## 接口与状态边界

- 状态归属：TS Host TUI 本地状态，不进入 protocol、Python Engine 或持久化 session schema。
- 输入边界：`tuiInput.ts` 只负责将面板内 `:` 映射为 action。
- 状态变更：`tuiState.ts` reducer 负责切换布尔值。
- 展示边界：`tuiHelp.ts` 和 `tuiDebug.ts` 读取同一状态与 formatter，避免显示结果分叉。

## 验收

- 默认显示 `(low/mid/high)`，切换后只隐藏文字标签，不隐藏 `L/M/H`。
- 面板关闭时 action 不改变状态；关闭并重新打开面板后设置保持。
- `:` 的面板内切换和面板外打开行为均有输入映射覆盖。
- TypeScript 编译、TUI 定向测试和全量测试通过。

## 下一阶段

Phase231 可将该布尔控制升级为 `shown/hidden/adaptive` 配置档，并继续复用当前 formatter 参数和 Help/Debug 接线。
