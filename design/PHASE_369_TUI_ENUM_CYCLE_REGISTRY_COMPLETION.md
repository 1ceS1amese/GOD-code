# Phase369 TUI Enum Cycle Registry Completion

## 状态

代码、测试与文档已完成。

## 审计结论

Phase368 后 reducer 剩余 8 个 cycle case。它们都执行有序值循环，但分为两种副作用：

- 6 个纯 cycle：page size、ranking limit、ranking line limit、summary visibility、neighbor visibility、neighbor adaptive threshold。
- 2 个派生 cycle：category 与 sort mode 在切换后必须重新计算 visible commands，并重置 selected index 与 scroll offset。

因此 registry helper 应从 profile 专用命名泛化为 enum/value cycle，同时允许 reducer 对少数 action追加派生状态。

## 设计

- `TuiProfileCycleDefinition/Registry` 保留兼容别名，底层新增 `TuiCycleDefinition/Registry`。
- `cycleTuiValueFromRegistry(...)` 成为通用 helper；旧 `cycleTuiProfileFromRegistry` 继续作为别名。
- 新增 `LIVE_SESSION_COMMAND_ENUM_CYCLE_REGISTRY`，声明剩余 8 个 action。
- `LIVE_SESSION_COMMAND_CYCLE_REGISTRY` 合并 26 个 profile action 和 8 个 enum action，共 34 项。
- reducer 调用统一 registry 后，对 category/sort action执行 visible command 派生重置；其余 action直接返回 cycle state。
- 删除剩余 8 个 switch case，使 reducer 中 `case "cycle_live_session_command_*"` 为 0。

## 接口边界

- action、state field、value order、fallback、快捷键和用户可见输出保持不变。
- category/sort 的 selected index 与 scroll reset 行为保持不变。
- 兼容导出 `cycleTuiProfileFromRegistry`，避免现有调用方破坏。
- 不进入 JSON-RPC、Python Engine 或持久化 schema。

## 验收标准

- 统一 cycle registry 共 34 项。
- reducer cycle switch case 为 0。
- category/sort 派生行为有专项测试。
- 编译、专项测试和全量测试通过。

## 实现结果

- helper 已泛化为 `cycleTuiValueFromRegistry(...)`，并保留 `cycleTuiProfileFromRegistry` 兼容别名。
- 新增 8 项 enum registry，与 26 项 profile registry 合并为 34 项统一 registry。
- category 与 sort cycle 在统一处理后继续重算 visible commands，并重置 selected index 与 scroll offset。
- reducer 中 `cycle_live_session_command_*` switch case 已清零。
- 新增 helper alias、registry 数量、state field、palette guard、真实默认值循环和派生选择重置测试。

Phase370 已在 cycle registry 之外建立 adaptive visibility formatter 基础，开始治理 resolver、distance 和 indicator 重复链路。
