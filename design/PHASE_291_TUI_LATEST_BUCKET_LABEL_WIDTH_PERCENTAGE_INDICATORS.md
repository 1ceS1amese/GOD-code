# Phase291 TUI Latest Bucket Label Width Percentage Indicators

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase290 最新宽度提示后追加相对共享 120 列阈值的归一化百分比。

- 复用既有同层 percentage helper，避免重复百分比算法。
- percentage helper 继续使用共享整数截断和 100% 封顶规则。
- 119 列输出 `adaptive>hidden+1[119/120=99%]@9`。
- 120 列输出 `adaptive>shown[120/120=100%]@9`。
- 180 列保留真实宽度并输出 `180/120=100%`。
- 不新增状态、action、快捷键或跨层接口。

## 验收与下一阶段

- percentage helper 已覆盖 0、40、80、119、120、180；最新 width helper 覆盖 119、120、180。
- indicator、Help 和 Debug 在 119/120 列复用同一结果。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase292 已追加 `L/M/H` 百分比分段。
