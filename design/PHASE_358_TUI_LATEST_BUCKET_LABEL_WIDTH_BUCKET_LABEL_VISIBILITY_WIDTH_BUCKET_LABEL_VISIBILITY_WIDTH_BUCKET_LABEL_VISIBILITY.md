# Phase358 TUI Latest Bucket Label Width Bucket Label Visibility Width Bucket Label Visibility Width Bucket Label Visibility

## 状态

代码、测试与文档已完成。

## 背景

Phase357 已在快捷键 `1` 的 adaptive 宽度详情中形成 `L(low)`、`M(mid)`、`H(high)`。按照既有 `bucket -> label -> visibility -> profile -> threshold -> distance -> width -> percentage` 演进顺序，下一步应为这一级文字标签增加独立显隐控制。

现有命令面板已经占用数字键 `0` 到 `9`，并且大部分可打印符号承担搜索或既有控制职责。Phase358 不复用已有字符快捷键，避免输入分支发生优先级冲突。

## 目标与实现

### 状态

- `TuiState` 新增当前层文字标签显隐布尔状态，默认值为 `true`。
- 状态只属于 TS Host TUI 内存，不进入 transcript、session 或 JSON-RPC schema。
- 关闭并重新打开命令面板后保持当前值；新建 TUI state 时恢复默认值。

### Action 与 reducer

- 新增当前层文字标签显隐 toggle action。
- reducer 仅在命令面板打开时切换状态；面板关闭时保持严格 no-op。
- action 执行后关闭帮助覆盖层，与既有命令面板配置 action 行为一致。

### 输入

- 命令面板内使用 `F2` 切换当前层文字标签显隐。
- 输入层应在 printable-search 分支之前识别 `key.name === "f2"`。
- 命令面板外 `F2` 不映射新 action，不改变现有 live session 快捷键。
- 导出的 shortcut 常量使用显示值 `F2`，供 indicator、Help 和 Debug 统一引用。

### 输出组合

- Phase357 width indicator 新增显隐参数，默认保持显示，确保现有直接调用兼容。
- 显示时继续输出 `80/120=66%H(high)`；隐藏时输出 `80/120=66%H`。
- 快捷键 `1` 的父级 adaptive indicator 读取新状态并传入 width indicator。
- 新子级 indicator 输出 `on@F2` 或 `off@F2`。
- Help 和 Debug 同时展示父级组合结果与子级显隐状态。

## 代码修改范围

- `ts-host/src/cli/tuiState.ts`
  - state、action、默认值、shortcut 常量、reducer、width formatter 和子级 indicator。
- `ts-host/src/cli/tuiInput.ts`
  - 命令面板内 `F2` 映射。
- `ts-host/src/cli/tuiHelp.ts`
  - 新显隐状态 indicator。
- `ts-host/src/cli/tuiDebug.ts`
  - 新显隐状态及父级组合输出。
- `ts-host/test/tui.test.ts`
  - state、reducer、formatter 和输入作用域测试。
- `ts-host/test/tuiHelp.test.ts`、`ts-host/test/tuiDebug.test.ts`
  - Help/Debug 集成断言。

## 验收结果

1. 默认状态下 80、119、120、180 列输出继续包含 `(high)`。
2. 关闭状态下只移除 `(low/mid/high)`，保留百分比和 `L/M/H`。
3. toggle 往返、面板关闭 no-op、面板重开状态保持均已覆盖测试。
4. 命令面板内 `F2` 映射新 action，命令面板外不产生该 action。
5. Help、Debug 和快捷键 `1` 父级 indicator 使用同一状态源。
6. 未新增或修改 protocol、Python Engine、provider、MCP、plugin、transcript 或 session 接口。
7. TypeScript 编译、聚焦测试、全量测试及快捷键冲突扫描通过。

## 后续边界

后续 Phase359 已将 Phase358 的布尔状态升级为 `shown/hidden/adaptive` profile；Phase358 本身未引入 profile、阈值或新的自适应算法。
