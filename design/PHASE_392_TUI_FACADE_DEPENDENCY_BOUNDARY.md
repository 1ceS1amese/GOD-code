# Phase392 TUI Facade Dependency Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase391 已将 `tuiState.ts` 收敛为 facade，但 7 个生产模块仍从 facade 导入 constants、types、selectors、factories、presentation helpers 和正式 reducer。这种内部 barrel 依赖隐藏真实所有权，也会在未来模块新增时重新引入循环依赖风险。

## 目标

- 生产模块只从具体所有者模块导入实现和类型。
- 将正式 registry-configured reducer 迁入独立模块。
- `tuiState.ts` 只作为外部兼容入口，不被内部生产模块消费。
- 保持全部旧 facade 导出引用不变。

## 模块设计

新增 `src/cli/tuiConfiguredReducer.ts`：

```ts
export const reduceTuiState = createTuiReducer(
  LIVE_SESSION_COMMAND_CYCLE_REGISTRY
);
```

内部导入规则：

- constants -> `tuiCommandPaletteConstants.ts`；
- types -> `tuiTypes.ts`；
- catalog/selectors/actions -> 对应 command 模块；
- factories -> `tuiStateFactory.ts`；
- configured reducer -> `tuiConfiguredReducer.ts`；
- adaptive/presentation -> 对应独立模块；
- `tuiState.ts` 仅允许测试和外部兼容调用方使用。

## 验收标准

- `src/cli` 中除 facade 自身外，对 `./tuiState.js` 的 import 数量为 0。
- configured reducer 与 facade 的 `reduceTuiState` 保持同一引用。
- configured reducer 能执行正式 cycle registry action。
- `tuiState.ts` 不包含 import、runtime declaration 或实现代码。
- facade 固定为 19 行兼容重导出。
- 完整测试和构建通过。

## 实现结果

- 新增 `src/cli/tuiConfiguredReducer.ts`。
- 迁移 `tuiInput.ts`、`tuiRenderer.ts`、`tuiHelp.ts`、`tuiDebug.ts`、`tuiSession.ts`、`tuiPtySmoke.ts` 和 `tuiApproval.ts` 到具体模块导入。
- `tuiState.ts` 从 23 行进一步收敛为 19 行 re-export-only facade。
- 新增 `test/tuiFacade.test.ts`，把内部依赖禁令固化为结构测试。
