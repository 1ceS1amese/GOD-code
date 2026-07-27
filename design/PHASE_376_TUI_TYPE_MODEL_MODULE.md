# Phase376 TUI Type Model Module

## 状态

代码、测试与文档已完成。

## 审计结论

Phase375 迁出静态常量后，`tuiState.ts` 仍在运行时实现之前定义完整的 TUI 数据模型。该区域包含 51 个 type/interface、约 360 行，只描述 pane、session、event、timeline、approval、state 和 reducer action，不依赖任何运行时值。

`TuiLiveSessionCommandGroup` 依赖运行时命令目录的元素类型，不属于纯类型叶子边界，本阶段保留在 `tuiState.ts`。

## 目标

- 将纯 TUI 数据与 action 类型迁移到独立模块。
- 确保新模块不产生运行时导出或依赖。
- 保持所有从 `tuiState.js` 导入类型的既有消费者兼容。
- 降低后续拆分 reducer、catalog 和 selector 时的循环依赖风险。

## 模块边界

- `tuiTypes.ts` 仅包含 type/interface 声明。
- `tuiState.ts` 使用 `import type` 消费类型，并使用 `export type *` 保留旧接口。
- renderer、input、session、approval、Help 和 Debug 暂不需要更改导入路径。
- 运行时 command catalog、registry、helper 和 reducer 不进入类型模块。

## 验收标准

- 新模块包含预期的 51 个 type/interface。
- 编译后的类型模块没有运行时导出。
- `TuiAction`、`TuiEvent` 和 `TuiState` 的直接导入与旧路径导入类型完全相等。
- reducer、approval、screen 和完整 TUI 测试保持通过。

## 实现结果

- 新增 `src/cli/tuiTypes.ts`，集中承载 51 个纯类型声明。
- `tuiState.ts` 减少 312 行净体积，并通过类型导入及重导出维持公共 API。
- 新增类型边界测试，验证零运行时导出和新旧类型路径等价。

## 后续推进

Phase377 基于共享类型层迁出命令目录和纯分组逻辑，使状态模块不再拥有静态命令元数据，并为 selector 与 reducer 的后续拆分减少运行时耦合。
