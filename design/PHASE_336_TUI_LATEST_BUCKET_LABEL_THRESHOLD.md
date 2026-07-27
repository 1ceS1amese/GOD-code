# Phase336 TUI Latest Bucket Label Threshold

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase335 最新 `adaptive` 标签配置提示中显式展示共享 120 列切换阈值。

- adaptive control indicator 直接复用 `LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_ADAPTIVE_WIDTH`。
- 119 列基础输出 `adaptive>hidden[120]@3`；Phase337 已追加剩余距离。
- 120 列及以上输出 `adaptive>shown[120]@3`。
- 显式 `shown` 和 `hidden` 不追加阈值。
- Help 和 Debug 继续复用同一 control indicator。

## 接口边界与验收

- 不增加状态、action、快捷键或配置项。
- 不改变 profile resolver、formatter 和标签显隐判定。
- 本阶段不显示距阈值的剩余列数。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或 session schema。
- 119/120 列 adaptive、显式 profile、Help 和 Debug 测试通过。
- TypeScript 编译、聚焦测试、全量测试和跨层接口扫描通过。
- Phase337 已加入距 120 列阈值的剩余距离。
