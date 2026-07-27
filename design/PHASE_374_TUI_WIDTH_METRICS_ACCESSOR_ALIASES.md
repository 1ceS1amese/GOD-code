# Phase374 TUI Width Metrics Accessor Aliases

## 状态

代码、测试与文档已完成。

## 审计结论

Phase373 已统一 metrics 算法，但 `tuiState.ts` 仍保留 44 个只接收 `maxWidth` 并原样转发到根 percentage、bucket 或 label 函数的 wrapper。这些 wrapper 没有额外校验、状态、格式化或副作用。

## 目标

- 将 44 个纯转发函数改为导出的函数别名。
- 保持所有导出名称、调用签名、返回值与模块导入方式。
- 根 percentage、bucket、label 函数继续保留具名实现。

## 接口边界

- 调用方仍使用原导出名称并以函数方式调用。
- TypeScript 推断签名来自目标函数，不降低类型精度。
- 不转换 resolver、distance、indicator 或带额外参数的 width formatter。
- 不修改 Help、Debug、input、state 或跨进程接口。

## 验收标准

- 纯 `return root(maxWidth)` metrics wrapper 数量为 0。
- 新增导出别名数量为 44。
- percentage、bucket、label 代表别名与根函数引用相同。
- 既有全部调用测试通过。

## 实现结果

- 40 个多行纯转发函数和 4 个单行 percentage 函数已转换，共 44 个导出别名。
- `tuiState.ts` 中指向 metrics 根函数的纯 `return root(maxWidth)` wrapper 已清零。
- percentage、bucket、label 代表导出与根函数引用相同，原调用结果保持不变。

## 后续推进

Phase375 将 `tuiState.ts` 中与状态无关的命令面板快捷键和宽度常量迁移到零依赖模块，并通过兼容重导出保持现有调用方稳定。
