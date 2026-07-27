# Phase390 TUI Neighbor Legend Presentation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase389 拆出 neighbor adaptive 基础算法后，`tuiState.ts` 仍持有完整的 neighbor progress legend presentation 长链。该函数族共 48 个运行时导出和兼容 alias，统一围绕 120 列阈值生成 profile resolution、threshold distance、width percentage、bucket、label、visibility 和 indicator 文本。

## 目标

- 整体迁移 neighbor legend presentation 函数族，避免继续在 facade 中扩展长链。
- 保持 120 列 adaptive 阈值、33/66 bucket 规则和全部快捷键文本。
- 保持 shallow 到最深八层 visibility presentation 的调用签名和输出。
- 保持 `tuiState.ts` 的 48 个兼容导出引用不变。

## 模块设计

`src/cli/tuiNeighborLegendPresentation.ts` 依赖：

- `tuiAdaptiveVisibility.ts`：profile resolution、distance 和 indicator formatter；
- `tuiWidthMetrics.ts`：percentage、bucket、label 和 width formatter；
- `tuiCommandPaletteConstants.ts`：adaptive width 与 presentation shortcuts；
- `tuiTypes.ts`：九个 profile 类型，仅 type-only。

模块不依赖 state facade。`tuiState.ts` 只导入后续 deepest/latest wrapper 仍需复用的七个函数，并兼容重导出完整模块。

## 验收标准

- 独立模块运行时导出数量为 48。
- adaptive legend 在 119/120 列分别解析为 compact/full。
- 80 列保持 `66%H(high)`，adaptive distance 保持 40。
- shallow indicator 和最深 width indicator 输出保持不变。
- 48 个 facade 兼容导出均保持同一引用。
- facade 内不再定义该函数族，完整测试和构建通过。

## 实现结果

- 新增 `src/cli/tuiNeighborLegendPresentation.ts`。
- `tuiState.ts` 删除完整 presentation 函数族和 aliases，行数降至约 980 行。
- 新增 `test/tuiNeighborLegendPresentation.test.ts`，覆盖导出面、阈值、metrics、代表性输出和兼容引用。
