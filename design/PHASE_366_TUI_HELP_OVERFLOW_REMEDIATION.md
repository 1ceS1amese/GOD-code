# Phase366 TUI Help Overflow Remediation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase365 已完成当前 F2 profile 的完整提示链路，但现有帮助系统已经出现明确的用户可见退化，不应继续添加同构嵌套层级。

当前证据：

- `tuiState.ts` 已达到约 4108 行，TUI 相关核心与测试文件合计约 8832 行。
- 当前存在 29 个 command visibility profile 类型、34 个 command palette cycle action 和 27 个导出 shortcut 常量。
- 命令面板详细帮助被拼接为单行，测试快照中的该行约 3075 字符。
- Phase365 的 `latest_width_bucket_label` 位于该行约第 2666 列，后续分页和导航提示约从第 2703 列开始。
- renderer 的 `visibleSlice(...)` 只保留终端宽度以内的前缀并追加省略号；因此在常见 80、120 或 160 列终端中，绝大多数高级快捷键、F2 状态和尾部导航说明不可见。
- compact renderer 只取 `rows.slice(0, maxRows)`，而 `TuiState` 没有 help scroll offset；被截掉的帮助行无法通过现有 PageUp/PageDown 找回。
- Debug 输出也存在约 3204 字符的单行，但 Debug 本质是诊断接口；Phase366 优先修复用户帮助，不同时重构 Debug contract。

## 实现决策

Phase366 聚焦“帮助内容可达性”，不继续增加新的 bucket/label/profile 层级。

### 1. 宽度感知换行

- `buildTuiHelpLines(state, { maxWidth })` 在提供 `maxWidth` 时，将命令面板帮助拆为逻辑 section，并在 ` | ` token 边界执行宽度感知换行。
- 每个返回行的可见长度不得超过 `maxWidth`。
- 不截断 token；单个 token 超宽时才使用既有安全截断规则。
- 未提供 `maxWidth` 时仍返回稳定、可测试的逻辑行，不再生成 3000 字符单行。

已实现 section：

1. `Command palette actions`：执行、搜索、分类、分页和关闭。
2. `Command palette display`：排序、ranking、summary、neighbor 等常用显示控制。
3. `Command palette advanced profiles`：现有嵌套 profile 快捷键与当前状态。
4. `Command palette latest`：F2 profile 及其当前自适应详情。

### 2. Help pane 滚动状态

- `TuiState` 新增 `helpScrollOffset`，默认 `0`。
- `scroll_pane` 在 pane 为 `help` 时更新 offset，并按当前帮助行数或 renderer 提供的可见范围做边界限制。
- 切换到 Help pane 时从当前 offset 展示；显式关闭再重新打开 Help 时可保留 offset，避免用户每次返回开头。
- 当帮助内容因状态或宽度变化缩短时，renderer 使用 clamp 后的有效 offset，避免空白页。

### 3. Renderer 可达性

- full 和 compact renderer 都通过同一 helper 获取 `offset + visibleRows` 范围。
- Help 标题显示 `Help [start-end/total]`，与已有 scroll position 设计保持一致。
- compact renderer 不再固定只展示帮助数组开头；PageUp/PageDown 可访问后续 section。
- overlay 和 active Help pane 使用同一内容与 offset，不引入第二套帮助来源。

### 4. 输入与行为

- 复用现有 PageUp/PageDown -> `scroll_pane` 映射，不增加新快捷键。
- Help pane 中 Up/Down 和 PageUp/PageDown 均可驱动帮助滚动；具体步长复用现有 scroll action 的 `amount` 规则。
- 命令面板输入、F2 profile、protocol 和 session 行为不改变。

## 修改范围

- `ts-host/src/cli/tuiState.ts`
  - `helpScrollOffset` 状态及 help pane scroll reducer。
- `ts-host/src/cli/tuiHelp.ts`
  - 逻辑 section、宽度感知 token wrapping、最新 F2 section。
- `ts-host/src/cli/tuiRenderer.ts`
  - Help 可见范围、标题位置和 full/compact 一致接线。
- `ts-host/src/cli/tuiInput.ts`
  - 仅在现有 Up/Down 行为无法覆盖 Help pane 时补最小映射；不新增 shortcut。
- `ts-host/test/tui.test.ts`
  - reducer、renderer、宽度和 F2 可达性测试。
- `ts-host/test/tuiHelp.test.ts`
  - section 和换行 contract。
- `ts-host/test/tuiScreen.test.ts`、`test/tuiPtySmoke.test.ts`
  - 终端宽度及滚动 smoke 回归。

## 验收标准

1. 80、120、160 列下生成的每条 Help 内容行均不超过可用宽度。
2. 首屏保留命令执行、搜索、关闭和滚动说明。
3. 通过 Help 滚动可看到 `latest_width_bucket_label:...@F2`。
4. 通过 Help 滚动可看到 `Enter run`、`/ clear` 和 `Esc close`，不再因 3000 字符单行永久丢失。
5. `helpScrollOffset` 默认值、上下滚动、边界 clamp 和重开保持均有测试。
6. full 与 compact renderer 展示相同 section 顺序和滚动位置。
7. 不新增 command profile、command action、命令面板快捷键或跨层 schema。
8. TypeScript 编译、聚焦测试、全量测试和 PTY smoke 通过。

## 实现结果

- `tuiHelp.ts` 输出 actions、navigation、display、context、advanced、latest 六类命令面板帮助，并通过 `wrapHelpLines(...)` 保证 80、120、160 列 contract。
- 超宽 profile indicator 在宽度受限时压缩为 `shortcut=value`，无宽度参数时保留原始稳定 indicator，避免改变既有 helper contract。
- `helpScrollOffset` 默认 `0`，help pane 的 Up/Down 使用 1 行步长，PageUp/PageDown 继续使用既有 5 行步长；reducer 对负 offset 做下界 clamp，renderer 对内容尾部做有效 offset clamp。
- full 与 compact renderer 共用 `visibleHelpSection(...)`，标题统一为 `Help [start-end/total]`；命令面板保持打开时切到 Help pane 仍可访问完整 section 和 F2 状态。
- Phase366 没有新增 command profile、command action、命令面板快捷键或跨层 schema。

## 后续边界

Phase367 已完成声明式 profile cycle registry 基础，并迁移 latest family 的 10 个 reducer action。后续迁移仍需保持用户可见行为和 reducer contract，不与 Help formatter 重构混合。
