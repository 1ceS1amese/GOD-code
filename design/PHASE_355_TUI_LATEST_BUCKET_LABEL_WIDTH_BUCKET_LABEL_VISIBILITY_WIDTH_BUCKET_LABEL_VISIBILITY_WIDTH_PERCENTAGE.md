# Phase355 TUI Latest Bucket Label Width Bucket Label Visibility Width Bucket Label Visibility Width Percentage

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase354 最新宽度提示后追加相对共享 120 列阈值的归一化百分比。

- 使用同层 percentage helper，并复用既有共享算法。
- 继续使用整数截断、最小 0 和最大 100 的规则。
- 80 列输出 `adaptive>hidden+40[80/120=66%]@1`。
- 119 列输出 `adaptive>hidden+1[119/120=99%]@1`。
- 120 列输出 `adaptive>shown[120/120=100%]@1`。
- 180 列保留真实宽度并输出 `180/120=100%`。
- 显式 profile 不附加宽度或百分比详情。

## 接口边界与验收

- 不新增状态、action、快捷键或配置项。
- 不改变 profile resolver、距离计算、快捷键 `2` formatter 或标签显隐判定。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或 session schema。
- percentage helper 覆盖 0、40、80、119、120、180。
- width helper、indicator、Help 和 Debug 共用百分比结果。
- TypeScript 编译、聚焦测试、全量测试和跨层接口扫描通过。

后续 Phase356 已在百分比后追加 `L/M/H` 分段。
