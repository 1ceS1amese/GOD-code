# Phase379 TUI Command Actions Module

## 状态

代码、测试与文档已完成。

## 审计结论

Phase378 迁出只读 selector 后，`tuiState.ts` 仍负责 command id 与 reducer action 的双向映射，以及命令历史、使用次数和 pinned history 的纯更新。这些函数只依赖共享 action/id 类型，不依赖完整 state、catalog 或 reducer 实现。

## 目标

- 建立命令执行映射层，分离 command id 与 reducer action 协议。
- 将 palette 来源识别和命令统计纯更新集中管理。
- 保持 input 和 `tuiState.js` 既有入口兼容。
- 让 reducer 只编排 action、历史和 usage 更新，不拥有映射细节。

## 模块边界

- `tuiCommandActions.ts` 仅 type-only 依赖 `tuiTypes.ts`。
- 模块负责 command-to-action、palette-action-to-command 和三项纯 bookkeeping 更新。
- reducer 仍负责真正的 session 状态转换和递归去除 source 后执行。
- catalog、selector、renderer 和输入解析不进入 actions 模块。

## 验收标准

- 九个 command id 均映射到正确 action，并可从 command palette action 反向恢复。
- 非 command palette action 不计入命令历史和 usage。
- history 与 pinned history 保持去重、最近优先和最多五项。
- usage 更新不修改原对象。
- 新旧路径五个函数引用一致，完整测试通过。

## 实现结果

- 新增 `src/cli/tuiCommandActions.ts`，集中管理双向 action 映射和三项 bookkeeping helper。
- `tuiState.ts` 删除对应实现，改为导入供 reducer 使用并兼容重导出。
- 新增 actions 契约测试，覆盖九项映射、来源隔离、容量限制、去重、不可变更新和旧入口。

## 后续推进

Phase380 将命令面板打开、导航、搜索、显示切换和历史操作迁入可组合子 reducer，使主 reducer 不再直接持有该子域的 transition switch。
