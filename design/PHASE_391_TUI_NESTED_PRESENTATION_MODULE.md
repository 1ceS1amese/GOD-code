# Phase391 TUI Nested Presentation Module

## 状态

代码、测试与文档已完成。

## 审计结论

Phase390 后，`tuiState.ts` 剩余的 104 个运行时导出全部属于 deepest nested、latest deepest 和 latest F2 width presentation。由于历史生成顺序导致 deepest 与 latest helper 相互复用，并且部分 aliases 位于文件尾部，单独拆一个函数族会产生新的横向循环依赖。

## 目标

- 整体迁移剩余 nested/latest presentation 层。
- 保持所有 profile resolver、threshold distance、width metrics、indicator 和 alias。
- 保持 deepest、latest deepest 与 F2 输出 contract。
- 将 `tuiState.ts` 收敛为纯兼容 facade 和正式 reducer 实例入口。

## 模块设计

`src/cli/tuiNestedPresentation.ts` 导出 104 个运行时 helper/alias，依赖：

- 通用 adaptive visibility formatter；
- 通用 width metrics formatter；
- command palette shortcut/width constants；
- Phase390 neighbor legend percentage/bucket/label 基础 presentation；
- nested/latest profile types，仅 type-only。

模块不依赖 `tuiState.ts`。facade 只保留各模块重导出，以及：

```ts
export const reduceTuiState = createTuiReducer(LIVE_SESSION_COMMAND_CYCLE_REGISTRY);
```

## 验收标准

- nested presentation 模块运行时导出数量为 104。
- deepest adaptive profile 在 119/120 列分别解析为 hidden/shown。
- 80 列 width indicator 保持 `80/120=66%H(high)`。
- deepest、deepest text、latest deepest 和 F2 indicator 输出保持不变。
- 104 个 facade 兼容导出保持同一引用。
- `tuiState.ts` 不再定义 presentation helper，文件只保留重导出和 reducer 实例。
- 完整测试与构建通过。

## 实现结果

- 新增 `src/cli/tuiNestedPresentation.ts`。
- `tuiState.ts` 从 983 行收敛为 23 行纯 facade。
- 新增 `test/tuiNestedPresentation.test.ts`，覆盖导出面、边界、代表性输出和兼容引用。
