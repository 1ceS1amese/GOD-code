# Phase388 TUI State Factory Module

## 状态

代码、测试与文档已完成。

## 审计结论

Phase387 拆出 cycle registry 后，`tuiState.ts` 仍是 70 字段初始状态默认值和独立 TUI event 构造的真源。子 reducer、测试和运行入口都需要初始状态，但不应为了创建状态而依赖包含大量格式化 wrapper 的兼容 facade。

## 目标

- 将初始状态和 event factory 迁入低耦合模块。
- 保持可注入 clock，确保启动事件和测试可确定。
- 保证每次构造都返回独立的可变集合。
- 保持 `tuiState.ts` 旧导出引用不变。

## 模块设计

`src/cli/tuiStateFactory.ts` 导出：

```ts
createInitialTuiState(now?): TuiState
createTuiEvent(kind, text, now?): TuiEvent
```

该模块仅运行时依赖 `tuiEventReducer.ts` 的 `defaultNow`，并 type-only 依赖 `tuiTypes.ts`。它不导入 `tuiState.ts`，因此调用方可以直接获得完整初始状态而不经过 facade。

## 验收标准

- 初始状态包含完整 70 字段 contract 和启动 system event。
- 注入 clock 只调用一次并决定启动事件 timestamp。
- 多次构造的数组和对象不共享引用。
- event factory 同时支持注入 clock 和默认 clock。
- `tuiState.ts` 的两个兼容导出与独立模块保持同一引用。
- facade 内不再存在 factory 实现，完整测试和构建通过。

## 实现结果

- 新增 `src/cli/tuiStateFactory.ts`。
- `tuiState.ts` 改为兼容重导出 factory，不再持有默认状态对象。
- 新增 `test/tuiStateFactory.test.ts`，覆盖完整默认值、clock、集合隔离和兼容接口。
