# Phase352 TUI Latest Bucket Label Width Bucket Label Visibility Width Bucket Label Visibility Threshold

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase351 快捷键 `1` 的 adaptive 配置提示中显式展示共享 120 列切换阈值。

- adaptive indicator 直接复用 `LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_ADAPTIVE_WIDTH`。
- 119 列输出 `adaptive>hidden[120]@1`。
- 120 列及以上输出 `adaptive>shown[120]@1`。
- 显式 `shown@1` 和 `hidden@1` 不追加阈值。
- Help 和 Debug 继续复用同一个子级 indicator。

## 接口边界与验收

- 不新增状态、action、快捷键或配置项。
- 不改变 profile resolver、快捷键 `2` formatter 或标签显隐判定。
- 本阶段不显示距阈值的剩余列数。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或 session schema。
- 119/120 列 adaptive、显式 profile、Help 和 Debug 测试通过。
- TypeScript 编译、聚焦测试、全量测试和跨层接口扫描通过。

后续 Phase353 已在低于阈值时追加剩余列数提示。
