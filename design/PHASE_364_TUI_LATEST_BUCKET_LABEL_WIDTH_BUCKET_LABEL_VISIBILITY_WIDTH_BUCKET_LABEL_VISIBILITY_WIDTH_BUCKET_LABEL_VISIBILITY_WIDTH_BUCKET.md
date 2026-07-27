# Phase364 TUI Latest Bucket Label Width Bucket Label Visibility Width Bucket Label Visibility Width Bucket Label Visibility Width Bucket

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase363 的 F2 adaptive 宽度百分比后追加 `L/M/H` 分段。

- 使用同层 bucket helper，并委托既有共享分段算法。
- 共享规则保持：0-39 为 `L`、40-79 为 `M`、80 及以上为 `H`。
- 80 列输出 `latest_width_bucket_label:adaptive>hidden+40[80/120=66%H]@F2`。
- 119 列输出 `latest_width_bucket_label:adaptive>hidden+1[119/120=99%H]@F2`。
- 120 列输出 `latest_width_bucket_label:adaptive>shown[120/120=100%H]@F2`。
- 180 列保留真实宽度并输出 `180/120=100%H`。

## 接口边界与验收

- 本阶段不增加 `low/mid/high` 文字标签。
- 不新增状态、action、快捷键、profile 或配置项。
- 不改变 profile resolver、距离计算、父级快捷键 `1` formatter 或标签显隐判定。
- 不修改 protocol、Python Engine、provider、MCP、plugin、transcript 或 session schema。
- bucket helper 覆盖 0、39、40、79、80、120 边界。
- width helper、indicator、Help 和 Debug 共用 bucket 结果。
- TypeScript 编译、聚焦测试、全量测试和跨层接口扫描通过。

后续 Phase365 已在 `L/M/H` 后追加 `low/mid/high` 文字标签。
