# Phase378 TUI Command Selectors Module

## 状态

代码、测试与文档已完成。

## 审计结论

Phase377 迁出命令目录后，`tuiState.ts` 仍包含一组只读取 command palette 状态的纯 selector：搜索归一化、可见命令过滤与排序、当前命令选择、usage ranking，以及只被排序使用的 group rank。它们不修改状态，也不依赖 reducer 私有实现。

搜索归一化同时被 reducer 的输入 action 使用，因此作为 selector 模块的公开纯函数迁移，而不是在两处复制。

## 目标

- 将命令面板只读派生逻辑迁入独立 selector 模块。
- 统一 renderer、Debug、session 和 reducer 对可见命令的计算路径。
- 保持 `tuiState.js` 的现有函数导出和引用兼容。
- 为后续 reducer 独立化减少大型模块内部依赖。

## 模块边界

- `tuiCommandSelectors.ts` 运行时依赖 command catalog，type-only 依赖 TUI state model。
- 模块接收最小 `Pick<TuiState, ...>` 状态视图，不拥有状态或副作用。
- 目录元数据与分组函数继续由 catalog 模块负责。
- reducer 仅调用 selector 和 normalization，不进入 selector 模块。

## 验收标准

- 搜索空白归一化、大小写转换和 32 字符上限保持不变。
- category/query 过滤保留原 catalog index。
- usage 模式保持 group 优先和组内 usage 排序。
- ranking 仅返回正使用次数并按次数降序截断。
- 新旧路径四个函数引用相同，完整测试通过。

## 实现结果

- 新增 `src/cli/tuiCommandSelectors.ts`，承载四个公开纯函数和内部 group rank。
- `tuiState.ts` 删除 selector 实现，改为导入供 reducer 使用并兼容重导出。
- 新增 selector 契约测试，覆盖 normalization、filter、sort、ranking、selection 和旧入口一致性。

## 后续推进

Phase379 迁出 command id 与 reducer action 的双向映射及命令历史/usage 纯更新，使命令查询层和执行协议层分别拥有清晰边界。
