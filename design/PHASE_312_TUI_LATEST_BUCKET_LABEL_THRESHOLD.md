# Phase312 TUI Latest Bucket Label Threshold

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase311 最新 `adaptive` 标签配置提示中显式展示共享 120 列切换阈值。

- adaptive control indicator 直接复用 `LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_ADAPTIVE_WIDTH`。
- 119 列输出 `adaptive>hidden[120]@6`。
- 120 列及以上输出 `adaptive>shown[120]@6`。
- 显式 `shown` 和 `hidden` 不追加阈值。
- Help 和 Debug 继续复用同一 control indicator。

## 接口边界与验收

- 不增加状态、action 或快捷键。
- 不改变 profile resolver 和标签显隐判定。
- 本阶段不显示距阈值的剩余列数。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或 session schema。
- 119/120 列 adaptive、显式 profile、Help 和 Debug 测试通过。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase313 已增加距 120 列阈值的剩余距离。
