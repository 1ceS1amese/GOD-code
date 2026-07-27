# Phase389 TUI Neighbor Adaptive Foundation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase388 后，`tuiState.ts` 仍直接拥有 neighbor visibility 限制、三档阈值、距离、目标、进度、进度 bucket 和 compact help 的 12 个基础 helper。这些算法同时被 renderer、Help、Debug 和后续长链 presentation wrapper 使用，属于可独立复用的基础计算层，而不是 state facade 职责。

## 目标

- 将 neighbor adaptive 基础算法迁入独立模块。
- 保持 dense、balanced、spacious 三套阈值和边界语义。
- 保持进度百分比上限、L/M/H 分段及 compact help 文本。
- 保持 `tuiState.ts` 全部旧导出引用不变。

## 模块设计

`src/cli/tuiNeighborAdaptive.ts` 导出 12 个 helper，仅运行时依赖 command palette 的 `|` 快捷键常量，并 type-only 依赖 neighbor profile 类型。模块不依赖 facade；`tuiState.ts` 只为尚未迁移的 presentation wrapper 导入必要基础函数并兼容重导出完整模块。

## 验收标准

- 独立模块运行时导出数量为 12。
- 三套阈值分别保持 `72/112`、`88/128`、`104/144`。
- 87/88/127/128 等关键宽度边界保持 compact/standard/full 语义。
- target、distance 和 progress 对同一阶段保持一致。
- bucket 边界保持 32/33 和 65/66，compact help 文本保持不变。
- 12 个 facade 兼容导出均保持同一引用，完整测试和构建通过。

## 实现结果

- 新增 `src/cli/tuiNeighborAdaptive.ts`。
- `tuiState.ts` 删除 12 个基础 helper 实现，继续作为兼容出口。
- 新增 `test/tuiNeighborAdaptive.test.ts`，覆盖导出面、阈值边界、派生一致性和兼容引用。
