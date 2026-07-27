# Phase365 TUI Latest Bucket Label Width Bucket Label Visibility Width Bucket Label Visibility Width Bucket Label Visibility Width Bucket Label

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase364 的 F2 adaptive `L/M/H` 分段后追加对应的 `low/mid/high` 文字标签。

- 使用同层 label helper，并委托既有共享标签映射。
- 最新组合形成 `L(low)`、`M(mid)`、`H(high)`。
- 80 列输出 `latest_width_bucket_label:adaptive>hidden+40[80/120=66%H(high)]@F2`。
- 119 列输出 `latest_width_bucket_label:adaptive>hidden+1[119/120=99%H(high)]@F2`。
- 120 列输出 `latest_width_bucket_label:adaptive>shown[120/120=100%H(high)]@F2`。
- 180 列保留真实宽度并输出 `180/120=100%H(high)`。

## 接口边界与验收

- 不新增状态、action、快捷键、profile 或配置项。
- 不改变 profile resolver、距离、百分比、bucket、父级快捷键 `1` formatter 或标签显隐判定。
- 不修改 protocol、Python Engine、provider、MCP、plugin、transcript 或 session schema。
- label helper 覆盖 low、mid、high 映射。
- width helper、indicator、Help 和 Debug 共用 label 结果。
- TypeScript 编译、聚焦测试、全量测试和跨层接口扫描通过。

Phase365 完成本级 F2 profile 的 profile、阈值、距离、宽度、百分比、bucket 和 label 提示链路。Phase366 已完成帮助溢出治理实现：高级快捷键和 F2 状态可通过宽度感知换行与 Help 滚动访问，不再无条件继续嵌套同构层级。
