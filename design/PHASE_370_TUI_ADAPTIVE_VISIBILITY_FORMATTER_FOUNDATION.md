# Phase370 TUI Adaptive Visibility Formatter Foundation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase369 清除了 reducer 中 34 个重复 cycle case，但 `tuiState.ts` 仍存在 27 个 visibility resolver、27 个 threshold distance helper 和大量同构 indicator formatter。共同算法均为：

1. 显式 `shown/hidden` 直接返回。
2. `adaptive` 根据共享宽度阈值解析。
3. 低于阈值时追加距离。
4. adaptive indicator 组合 `profile>effective+distance[width]`。

## 目标

- 建立与具体 TUI state field 无关的 adaptive visibility helper。
- 首批迁移 deepest nested bucket label、latest deepest text 和 F2 latest width bucket label 三条代表链路。
- 保持全部公开 wrapper、indicator 文本和测试 contract。

## 设计

新增 `tuiAdaptiveVisibility.ts`：

- `resolveTuiAdaptiveVisibilityProfile(...)`
- `tuiAdaptiveVisibilityThresholdDistance(...)`
- `formatTuiAdaptiveVisibilityIndicator(...)`

具体导出函数继续存在，只把内部算法委托给共享 helper。formatter 接收 name、shortcut、threshold 和延迟执行的 width indicator，不依赖 `TuiState`、Help 或 Debug。

## 验收标准

- 三条代表链路的 resolver、distance 和 indicator 使用共享 helper。
- 显式 profile 不执行 width indicator callback。
- 80、119、120、180 列输出保持不变。
- Help、Debug、F2 和既有 wrapper contract 保持不变。
- 编译、专项测试和全量测试通过。

## 实现结果

- 新增独立 `tuiAdaptiveVisibility.ts`，集中 resolver、threshold distance 和 adaptive indicator 组合算法。
- deepest nested bucket label、latest deepest text、F2 latest width bucket label 三条链路已委托共享 helper。
- 公开 wrapper、name、shortcut、width formatter 和输出文本保持不变。
- 新增阈值边界、距离、adaptive 格式及显式 profile 延迟 callback 测试。

## 后续边界

Phase371 已完成剩余 shown/hidden resolver 和通用 threshold distance wrapper 的迁移。indicator formatter 批量迁移留给 Phase372；width、percentage、bucket、label 算法仍不在本阶段重构。
