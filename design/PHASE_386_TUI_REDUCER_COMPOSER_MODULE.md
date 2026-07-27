# Phase386 TUI Reducer Composer Module

## 状态

代码、测试与文档已完成。

## 审计结论

Phase385 删除主 action switch 后，`reduceTuiState` 虽然已经是组合器，但仍定义在 `tuiState.ts`，并直接读取同文件中的 cycle registry。若新组合器反向导入 `tuiState.ts` 获取 registry，会形成 facade 与 reducer 的循环依赖。

## 目标

- 将 reducer 组合流程迁入独立模块。
- 通过显式依赖注入 cycle registry，避免反向导入 facade。
- 保持 `reduceTuiState(state, action)` 现有调用签名。
- 对组合顺序和跨域 command bookkeeping 建立直接测试。

## 接口设计

```ts
createTuiReducer(cycleRegistry): TuiReducer
```

- factory 捕获 registry 并返回稳定 reducer 函数。
- `tuiState.ts` 使用 `LIVE_SESSION_COMMAND_CYCLE_REGISTRY` 创建兼容实例。
- reducer 内部递归处理移除 `source` 后的 command palette action，保持统计只记录一次。
- 空或替代 registry 可用于测试和后续自定义部署。

## 组合顺序

1. command palette 来源 history/usage；
2. 注入的 cycle registry；
3. command palette reducer；
4. live session reducer；
5. history/timeline reducer；
6. shell/approval reducer；
7. prompt/turn reducer；
8. event-stream reducer；
9. 未处理 action 返回原 state。

## 模块边界

- `tuiReducer.ts` 依赖各子 reducer、command actions/selectors 和通用 registry executor。
- 模块只 type-only 依赖 `TuiState`/`TuiAction`。
- 模块不导入 `tuiState.ts`，依赖图保持单向。
- Phase386 完成时 registry 定义暂留 `tuiState.ts`，通过 factory 参数接入；该后续边界已由 Phase387 的 `tuiCycleRegistries.ts` 完成拆分。

## 验收标准

- `reduceTuiState` 组合实现只存在于 `tuiReducer.ts`。
- `tuiState.ts` 只通过 factory 创建兼容 reducer 实例。
- 空 registry 不执行 cycle；正式 registry 保持既有 cycle 行为。
- command source bookkeeping 先于 domain reducer。
- 未知 action 返回原 state，完整构建和测试通过。

## 实现结果

- 新增 `src/cli/tuiReducer.ts`，导出 `TuiReducer` 和 `createTuiReducer`。
- `tuiState.ts` 将 `reduceTuiState` 收敛为基于正式 registry 的兼容实例。
- 新增组合器测试，覆盖 registry 注入、全部 reducer domain、bookkeeping 顺序和未知 action。

## 后续完成

Phase387 已将正式 cycle values 与 registry composition 迁入独立模块，composer factory 现在可直接接收独立配置模块导出的正式 registry。
