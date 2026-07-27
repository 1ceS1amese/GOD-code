# Phase373 TUI Width Metrics Formatter Migration

## 状态

代码、测试与文档已完成。

## 审计结论

Phase372 后 adaptive indicator 已统一，但仍有 13 个 percentage、17 个 bucket、17 个 label wrapper，以及 26 个同构 width indicator。绝大多数 wrapper 已间接复用根函数，真正重复的是 width 文本组合。

## 目标

- 新增纯 width metrics helper，统一 percentage、bucket、label 和完整文本。
- 根 percentage/bucket/label wrapper 委托共享 helper。
- 全部 26 个 width indicator 委托 `formatTuiWidthMetrics(...)`。
- 保留所有长名称公开 wrapper 与可选 label 参数。

## 行为边界

- percentage 保持整数向下取整并 clamp 到 0-100。
- bucket 保持 `<33 => L`、`<66 => M`、其余 `H`。
- label 保持 low/mid/high。
- 超过阈值时保留真实宽度，百分比上限仍为 100。

## 验收标准

- 26 个 width indicator 全部使用共享 formatter。
- 旧式 width 字符串模板重复为 0。
- 0、39、40、79、80、119、120、180 宽度矩阵通过。
- 编译、专项测试和全量测试通过。

## 实现结果

- 新增 `tuiWidthMetrics.ts`，统一 percentage、bucket、label 和 width 文本格式。
- 根 percentage/bucket/label wrapper 已委托共享 helper，现有长名称别名链保持不变。
- 25 个可选 label width indicator 与 F2 width indicator 共 26 个 wrapper 已全部迁移。
- 新增 0、39、40、79、80、119、120、180 宽度矩阵与 label 显隐测试。

Phase374 已将 44 个纯 metrics 转发 wrapper 收敛为导出别名，保留所有兼容名称并进一步缩减大型 state 模块。
