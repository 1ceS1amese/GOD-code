# Phase375 TUI Command Palette Constants Module

## 状态

代码、测试与文档已完成。

## 审计结论

Phase374 完成后，`tuiState.ts` 仍同时承担状态模型、纯函数和命令面板静态配置职责。审计确认其中有 28 个快捷键及共享宽度常量不依赖 reducer、状态类型或运行时逻辑，适合作为第一批低耦合定义迁出。

## 目标

- 将 28 个无状态命令面板常量迁移到独立模块。
- 保持 `tuiState.ts` 的既有导出路径，避免调用方批量迁移。
- 建立后续拆分 `tuiState.ts` 时可复用的单向依赖边界。

## 模块边界

- `tuiCommandPaletteConstants.ts` 不导入其他模块，只导出静态常量。
- `tuiState.ts` 导入这些常量供内部逻辑使用，并通过 `export *` 保留原公共接口。
- `tuiInput.ts`、Help、Debug 和其他消费者继续从 `tuiState.js` 导入，无需修改。
- profile 类型、cycle registry 和 reducer action 暂不迁移，避免形成反向依赖或循环依赖。

## 验收标准

- 独立模块仅导出预期的 28 个常量。
- 每个常量都能通过旧 `tuiState.js` 路径取得相同值。
- 命令输入、Help、Debug 和完整测试保持通过。
- TypeScript 构建无循环依赖或类型退化。

## 实现结果

- 新增 `src/cli/tuiCommandPaletteConstants.ts`，集中管理 27 个快捷键和 1 个自适应宽度常量。
- `tuiState.ts` 改为消费并重导出新模块，既有调用方接口保持不变。
- 新增边界测试，逐项验证 28 个直接导出及其兼容重导出。

## 后续推进

Phase376 将 `tuiState.ts` 中不依赖运行时值的数据模型与 action 类型迁移到纯类型模块，继续缩小状态模块职责并为后续运行时拆分提供共享契约。
