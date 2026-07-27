# Phase371 TUI Adaptive Visibility Resolver Migration

## 状态

代码、测试与文档已完成。

## 审计结论

Phase370 迁移三条代表链路后，仍有 22 个 `shown/hidden/adaptive` resolver 和 23 个 threshold distance helper 保留重复算法。另有 neighbor legend 的 `compact/full/adaptive` resolver，其有效值语义不同，不应错误套用 shown/hidden resolver，但 distance 算法仍相同。

## 目标

- 将剩余 22 个 shown/hidden resolver 全部委托给共享 resolver。
- 将剩余 23 个 threshold distance helper 全部委托给共享 distance helper。
- neighbor legend resolver 保持独立，distance 进入共享 helper。
- 公开函数名称、参数、返回类型和调用方全部保持不变。

## 实现边界

- `tuiAdaptiveVisibilityThresholdDistance` 接受字符串 profile，只根据是否为 `adaptive` 判断距离，兼容 shown/hidden 与 compact/full profile family。
- 不在本阶段批量迁移 indicator formatter；Phase372 单独处理 name、shortcut 和 width callback 元数据。
- width、percentage、bucket、label、Help 和 Debug 逻辑不改变。

## 验收标准

- `tuiState.ts` 中 shown/hidden resolver 不再直接实现阈值判断。
- `tuiState.ts` 中 threshold distance wrapper 不再直接计算阈值差。
- neighbor legend resolver 仍返回 compact/full。
- 公开 wrapper 边界测试和全量测试通过。

## 实现结果

- 22 个剩余 shown/hidden resolver 已迁移，共 25 个 wrapper 委托共享 resolver。
- 23 个剩余 threshold distance helper 已迁移，共 26 个 wrapper 委托共享 distance helper。
- neighbor legend 的 compact/full resolver 与 neighbor adaptive threshold distance 因语义不同继续保留独立实现。
- distance helper 已接受任意字符串 profile，并验证非 adaptive 的 compact profile 返回 `null`。

Phase372 已完成剩余 indicator wrapper 迁移，resolver、distance 和 indicator 三层共享链路现已闭环。
