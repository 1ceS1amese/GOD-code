# Phase367 TUI Profile Cycle Registry Foundation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase366 已解决 Help 内容不可达问题，但 profile cycle 的实现仍以重复 switch case 为主：

- `tuiState.ts` 当前包含 29 个导出的 profile 类型和 34 个 `cycle_live_session_command_*` reducer 分支。
- 每个三态 visibility profile 分支重复执行相同流程：检查命令面板、查找当前索引、循环到下一值、写回 state、关闭 Help。
- latest profile family 单独占用 10 个 cycle action，其中 9 个使用 `shown -> hidden -> adaptive`，并共享 `shown` fallback。
- action union、输入映射、Help/Debug indicator 和 state 字段已经形成外部测试 contract；本阶段不能通过重命名字段或 action 来换取代码缩短。
- 全量迁移 34 个分支会同时触及多种 profile value domain。Phase367 先建立 registry 基础并迁移 latest family，避免一次性扩大回归面。

## 目标

建立声明式 profile cycle registry，让 reducer 从元数据解析 `action -> stateKey -> values -> fallback`，并迁移 latest profile family 的 10 个现有 action。

## 设计

### 1. 通用 registry helper

新增 `ts-host/src/cli/tuiProfileRegistry.ts`：

- `TuiProfileCycleDefinition` 描述 `stateKey`、有序 `values` 和 `fallback`。
- `cycleTuiProfileFromRegistry(...)` 接收普通 state、action type 和 registry。
- 未注册 action 返回 `undefined`，由既有 reducer switch 继续处理。
- 已注册 action 在 guard 不通过时返回原 state；guard 由调用方传入，避免 helper 知道命令面板语义。
- 当前 state 值不在 values 中时，下一值使用 fallback，保持旧代码的 `?? "shown"` 行为。

### 2. latest family registry

在 `tuiState.ts` 中声明 `LIVE_SESSION_COMMAND_LATEST_PROFILE_CYCLE_REGISTRY`：

- 保留全部现有 action 字符串。
- 保留全部现有 state field，包括快捷键 `8` 对既有 deepest nested profile field 的映射。
- 复用现有 `*_PROFILES` 常量，不复制 profile 顺序。
- fallback 全部保持 `shown`。

### 3. reducer 接线

- `reduceTuiState(...)` 在进入主 switch 前尝试 registry reducer。
- registry action 仅在 `liveSessionCommandPaletteVisible` 时生效。
- 成功 cycle 后统一设置 `helpVisible: false`。
- 删除已迁移的 10 个重复 switch case。
- 其他 24 个 cycle 分支保持原样，作为后续阶段迁移基线。

### 4. 接口兼容

以下 contract 不变：

- `TuiAction` action names。
- `TuiState` field names 和默认值。
- profile 顺序与 resolver 行为。
- `tuiInput` 快捷键映射。
- Help、Debug 和 indicator 文本。
- JSON-RPC、Python Engine、provider、session、transcript 和配置 schema。

## 测试计划

1. helper：未注册 action 返回 `undefined`。
2. helper：按 values 顺序 cycle，并从最后一项回绕到第一项。
3. helper：未知当前值回落到 fallback。
4. helper：guard 不通过时保持对象引用不变。
5. registry：latest family 精确包含 10 个 action，且 stateKey 唯一性与既有特殊映射明确测试。
6. reducer：命令面板关闭时 10 个 action 均为 no-op。
7. reducer：命令面板打开时 10 个 action 均保持原三态循环并关闭 Help。
8. 既有 F2、数字快捷键、Help、Debug、renderer 和 PTY 测试全部通过。

## 验收标准

- latest family 的 10 个重复 reducer case 被 registry 接线替代。
- 不修改任何用户可见 action、shortcut、profile 或 indicator contract。
- registry helper 不依赖 `TuiState`，可供后续 profile family 复用。
- TypeScript 编译、专项测试和 18 文件全量测试通过。

## 实现结果

- 新增 `tuiProfileRegistry.ts`，helper 不依赖 `TuiState`，通过 registry、guard 和可选 patch 完成通用 profile cycle。
- 新增 `LIVE_SESSION_COMMAND_LATEST_PROFILE_CYCLE_REGISTRY`，声明 10 个既有 latest action、state field、profiles 和 fallback。
- `reduceTuiState(...)` 在主 switch 前处理 registry action；命令面板关闭时保持原 state 引用，打开时 cycle 并关闭 Help。
- 删除 latest family 的 10 个重复 reducer case；剩余 profile family 暂不迁移。
- 新增 helper、registry 数量、特殊 field 映射、palette guard 和三态循环 contract 测试。

## 后续边界

Phase368 已迁移 deepest nested 与 neighbor legend families，统一 registry 当前覆盖 26 个 action。Help/Debug formatter 声明式化仍不与 reducer registry 混合处理。
