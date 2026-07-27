# Phase350 TUI Latest Bucket Label Width Bucket Label Visibility Width Bucket Label Visibility

## 状态

代码、测试与文档已完成。

## 目标与实现

为 Phase349 快捷键 `2` adaptive 详情中的 low/mid/high 文字标签增加独立显隐控制。

- `TuiState` 新增默认值为 `true` 的最新文字标签显隐布尔状态。
- reducer 仅在命令面板打开时处理对应 toggle action，关闭并重开后状态保持。
- 命令面板内快捷键 `1` 切换该状态；命令面板外 `1` 继续映射既有 `activate_live_session`。
- 最新 width indicator 接收显隐参数：开启时输出 `H(high)`，关闭时输出 `H`。
- 快捷键 `2` indicator、Help 和 Debug 读取同一状态。
- 子级状态 indicator 输出 `on@1` 或 `off@1`。

## 接口边界与验收

- 状态、action 和快捷键只存在于 TS Host TUI，不进入 protocol 或持久化 schema。
- 不改变 profile resolver、阈值距离、百分比或 bucket 算法。
- 不修改 Python Engine、provider、MCP、plugin 或 session 接口。
- 测试覆盖默认开启、开关往返、面板关闭时 no-op、面板重开后保持、Help/Debug 输出和面板内外快捷键作用域。
- TypeScript 编译、聚焦测试、全量测试和跨层接口扫描通过。

后续 Phase351 已将布尔状态升级为 `shown/hidden/adaptive` 三态配置档。
