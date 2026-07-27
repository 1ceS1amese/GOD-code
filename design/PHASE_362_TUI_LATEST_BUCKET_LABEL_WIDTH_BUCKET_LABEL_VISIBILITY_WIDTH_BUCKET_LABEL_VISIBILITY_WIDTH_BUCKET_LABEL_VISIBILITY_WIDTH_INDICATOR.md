# Phase362 TUI Latest Bucket Label Width Bucket Label Visibility Width Bucket Label Visibility Width Bucket Label Visibility Width Indicator

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase361 的 F2 adaptive 阈值距离提示中同时展示当前宽度与共享 120 列阈值。

- 新增同层 width indicator helper。
- helper 输出 `current/threshold` 并复用共享阈值常量。
- 80 列输出 `latest_width_bucket_label:adaptive>hidden+40[80/120]@F2`。
- 119 列输出 `latest_width_bucket_label:adaptive>hidden+1[119/120]@F2`。
- 120 列输出 `latest_width_bucket_label:adaptive>shown[120/120]@F2`。
- 180 列 helper 输出 `180/120`，保留真实当前宽度。
- 显式 profile 不附加宽度详情。

## 接口边界与验收

- 不新增状态、action、快捷键、profile 或配置项。
- 不改变 profile resolver、距离计算、父级快捷键 `1` formatter 或标签显隐判定。
- 不修改 protocol、Python Engine、provider、MCP、plugin、transcript 或 session schema。
- helper 覆盖 80、119、120、180；Help、Debug 与 indicator 共用结果。
- TypeScript 编译、聚焦测试、全量测试和跨层接口扫描通过。

后续 Phase363 已在宽度组合后追加相对阈值百分比。
