# Phase293 TUI Latest Bucket Label Width Percentage Bucket Labels

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase292 最新 `L/M/H` 分段后补充 `low/mid/high` 文字标签。

- 复用既有同层 label helper 和共享标签映射。
- 最新组合形成 `L(low)`、`M(mid)`、`H(high)`。
- 119 列输出 `adaptive>hidden+1[119/120=99%H(high)]@9`。
- 120 列输出 `adaptive>shown[120/120=100%H(high)]@9`。
- 180 列保留真实宽度并输出 `180/120=100%H(high)`。
- 不新增状态、action、快捷键或跨层接口。

## 验收与下一阶段

- label helper 已覆盖 low、mid、high 映射。
- width indicator、Help、Debug、TypeScript 编译及全量测试通过。
- Phase294 已增加最新文字标签的独立显隐控制。
