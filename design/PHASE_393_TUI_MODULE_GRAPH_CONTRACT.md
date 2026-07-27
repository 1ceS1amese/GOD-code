# Phase393 TUI Module Graph Contract

## 状态

代码、测试与文档已完成。

## 审计结论

Phase392 清除 facade 内部依赖后，当前 `src/cli` 共有 31 个 `tui*.ts` 模块。实时解析全部本地 import/export 边后未发现循环，但这一事实此前只依赖人工审查，后续新增模块或导入时没有自动化门禁。

## 目标

- 从真实 TypeScript source 构建 TUI 本地模块依赖图。
- 检测指向不存在模块的悬空依赖。
- 使用 strongly connected components 检测任意长度循环。
- 固化 foundation、presentation、reducer、configuration 和 facade 的关键分层约束。

## 契约设计

`test/tuiModuleGraph.test.ts` 在测试运行时：

1. 枚举 `src/cli/tui*.ts`；
2. 解析相对 `import ... from` 和 `export * from` 边；
3. 校验目标模块实际存在；
4. 使用 Tarjan SCC 算法检查循环；
5. 校验 foundation 模块无高层依赖；
6. 校验 presentation 和 reducer 双向隔离；
7. 校验 configured reducer 仅依赖 registry/composer；
8. 校验生产模块不依赖 facade，facade 显式重导出 19 个模块。

## 分层边界

- foundation：types、constants、generic visibility/width metrics、registry executor；
- domain：catalog、selectors、actions、state helper 和 subreducers；
- presentation：neighbor/nested presentation、Help、Debug、renderer；
- configuration：cycle registries + reducer composer -> configured reducer；
- compatibility：`tuiState.ts`，只允许向外聚合导出。

## 验收标准

- 31 个 TUI 模块的本地依赖全部可解析。
- Tarjan SCC 不产生长度大于 1 的 component。
- 五个 foundation 模块依赖集合为空。
- presentation 不依赖 reducer，reducer 不依赖 presentation。
- configured reducer 依赖集合精确为 cycle registries 和 reducer composer。
- 非 facade 模块指向 facade 的边数量为 0。
- 完整测试和构建通过。

## 实现结果

- 新增 `test/tuiModuleGraph.test.ts`，包含 5 项架构契约测试。
- 将 Phase392 的直接导入规则提升为可持续执行的模块图门禁。
- 当前模块图无循环、无悬空边，分层约束全部通过。
