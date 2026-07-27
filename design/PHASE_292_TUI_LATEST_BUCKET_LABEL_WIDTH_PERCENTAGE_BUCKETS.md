# Phase292 TUI Latest Bucket Label Width Percentage Buckets

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase291 最新宽度百分比后追加 `L/M/H` 分段。

- 复用既有同层 bucket helper，不重复分段算法。
- 共享分段算法保持：0-39 列为 `L`、40-79 列为 `M`、80 列及以上为 `H`。
- 119 列输出 `adaptive>hidden+1[119/120=99%H]@9`。
- 120 列输出 `adaptive>shown[120/120=100%H]@9`。
- 180 列保留真实宽度并输出 `180/120=100%H`。
- indicator、Help 和 Debug 共用同一 bucket helper。

## 边界与验收

- 本阶段不增加 `low/mid/high` 文字标签。
- 不新增状态、action、快捷键或跨层接口。
- bucket helper 已覆盖 0、39、40、79、80 等边界。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase293 已补充 `low/mid/high` 文字标签。
