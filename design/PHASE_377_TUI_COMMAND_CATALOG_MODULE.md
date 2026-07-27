# Phase377 TUI Command Catalog Module

## 状态

代码、测试与文档已完成。

## 审计结论

Phase376 建立共享类型层后，命令面板的九项静态目录和分组逻辑仍位于 `tuiState.ts`。目录、group key、连续分组、邻组解析和邻组标签均为纯运行时逻辑，只依赖共享类型，不需要完整 `TuiState` 或 reducer。

筛选、使用次数排序、当前选择和 reducer 跳组逻辑仍依赖 state，本阶段不迁移。

## 目标

- 建立独立的命令目录运行时模块。
- 将命令元数据和纯分组逻辑从状态模块移出。
- 保持 `tuiState.js` 的全部既有值与类型导出。
- 让 renderer、Help、Debug 和 reducer 共享同一目录对象与分组实现。

## 模块边界

- `tuiCommandCatalog.ts` 仅通过 `import type` 依赖 `tuiTypes.ts`。
- 模块导出 command、visible entry、group 类型，以及目录和四个纯分组函数。
- `tuiState.ts` 导入目录、group key 和 grouping 供 selector/reducer 使用，并兼容重导出整个模块。
- state selector、usage ranking、adaptive profile 和 reducer 不进入目录模块。

## 验收标准

- 目录保持九个 command id、快捷键、分类和 favorite 元数据。
- 连续分组、wrap 邻组和 compact/standard/full 标签结果保持不变。
- 新模块与 `tuiState.js` 导出的目录及函数引用完全相同。
- renderer、Help、Debug、TUI 和完整测试通过。

## 实现结果

- 新增 `src/cli/tuiCommandCatalog.ts`，集中管理九项命令目录和四个纯分组函数。
- `tuiState.ts` 删除重复目录与分组实现，改为导入和兼容重导出。
- 新增目录契约测试，覆盖元数据、分组、邻组、标签和旧接口引用一致性。

## 后续推进

Phase378 基于独立目录模块迁出命令搜索、过滤、排序、选择和 usage ranking，使状态模块不再拥有命令面板的只读派生规则。
