# Phase360 TUI Latest Bucket Label Width Bucket Label Visibility Width Bucket Label Visibility Width Bucket Label Visibility Threshold

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase359 的 F2 adaptive profile indicator 中显式展示共享 120 列切换阈值。

- adaptive indicator 直接复用 `LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_ADAPTIVE_WIDTH`。
- 119 列输出 `latest_width_bucket_label:adaptive>hidden[120]@F2`。
- 120 列及以上输出 `latest_width_bucket_label:adaptive>shown[120]@F2`。
- 显式 `shown@F2` 和 `hidden@F2` 不追加阈值。
- Help 和 Debug 继续复用同一个子级 indicator。

## 接口边界与验收

- 不新增状态、action、快捷键、profile 或配置项。
- 不改变 profile resolver、父级快捷键 `1` formatter 或标签显隐判定。
- 本阶段不显示距阈值的剩余列数。
- 不修改 protocol、Python Engine、provider、MCP、plugin、transcript 或 session schema。
- 119/120 列 adaptive、显式 profile、Help 和 Debug 测试通过。
- TypeScript 编译、聚焦测试、全量测试和跨层接口扫描通过。

后续 Phase361 已在低于阈值时追加剩余列数提示。
