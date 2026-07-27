# Phase387 TUI Cycle Registries Module

## 状态

代码、测试与文档已完成。

## 审计结论

Phase386 已允许 reducer composer 显式接收 cycle registry，但 31 个运行时数组与 registry 常量仍定义在 `tuiState.ts`。现有配置包含 latest 10 项、neighbor legend 9 项、deepest nested 7 项和 enum 8 项，最终合并为 34 个 cycle action。

## 目标

- 将 cycle values、profile arrays 和 registry composition 迁入独立模块。
- 保持 `tuiState.ts` 的全部兼容导出引用不变。
- 让正式 reducer 只导入最终合并 registry。
- 禁止 registry 模块反向导入 facade。

## 模块设计

`src/cli/tuiCycleRegistries.ts` type-only 依赖 `tuiTypes.ts` 和 `tuiProfileRegistry.ts`，拥有 31 个运行时导出，并组合 26 个 profile cycle action 和 8 个 enum cycle action。`tuiState.ts` 仅导入最终 registry、传给 `createTuiReducer` 并通过 `export *` 保留旧入口。

## 验收标准

- 独立模块运行时导出数量为 31。
- 三组 profile registry 数量分别为 10、9、7，合并后为 26。
- enum registry 为 8，最终 registry 为 34，且 key 集合等于两者并集。
- `tuiState.ts` 的 31 个兼容导出与独立模块保持同一引用。
- reducer 能通过抽取后的正式 registry 执行 enum 与 profile cycle。
- registry 模块不导入 `tuiState.ts`，完整构建和测试通过。

## 实现结果

- 新增 `src/cli/tuiCycleRegistries.ts`，集中持有全部 cycle 配置。
- `tuiState.ts` 收敛为最终 registry 的消费端和兼容重导出 facade。
- 新增 `test/tuiCycleRegistries.test.ts`，覆盖导出面、组合完整性、兼容引用和 reducer 接线。
