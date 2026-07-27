# Phase368 TUI Profile Cycle Registry Family Migration

## 状态

代码、测试与文档已完成。

## 审计结论

Phase367 已迁移 latest family 的 10 个 profile cycle action。当前 reducer 仍有 24 个 `cycle_live_session_command_*` case：

- 5 个非 profile domain：page size、category、sort mode、ranking limit、ranking line limit。
- 3 个独立 profile：summary visibility、neighbor visibility、neighbor adaptive threshold。
- 9 个 neighbor progress legend family profile。
- 7 个 deepest nested family profile。

其中后两组共 16 个 case 与 Phase367 helper 完全同构，适合作为第二批 registry 迁移范围。

## 目标

- 将 neighbor progress legend family 的 9 个 action 迁移到 registry。
- 将 deepest nested family 的 7 个 action 迁移到 registry。
- 保留 latest family registry 的公开测试入口，同时提供包含全部已迁移 action 的统一 registry。
- 将 reducer 中重复 profile cycle case 从 24 个减少到 8 个。

## 设计

### 1. 分 family registry

在 `tuiState.ts` 增加：

- `LIVE_SESSION_COMMAND_NEIGHBOR_LEGEND_PROFILE_CYCLE_REGISTRY`
- `LIVE_SESSION_COMMAND_DEEPEST_NESTED_PROFILE_CYCLE_REGISTRY`
- `LIVE_SESSION_COMMAND_PROFILE_CYCLE_REGISTRY`

统一 registry 通过对象展开组合 latest、neighbor legend 和 deepest nested 三个 family。

### 2. Profile domain 保持

- neighbor legend 主 profile 保留 `compact -> full -> adaptive -> compact`，fallback 为 `compact`。
- 其余 15 个 visibility profile 保留 `shown -> hidden -> adaptive -> shown`，fallback 为 `shown`。
- 每项继续复用现有 `*_PROFILES` 常量，不重新声明 profile 顺序。

### 3. Reducer 接线

- Phase367 的 registry 调用改为使用统一 registry。
- 删除对应 16 个 switch case。
- palette guard、Help 关闭和未注册 action fallback 行为不变。
- 剩余 8 个 cycle case继续由 switch 处理，避免把非 profile domain 混入本阶段。

## 测试计划

1. latest、neighbor legend、deepest nested registry 数量分别为 10、9、7。
2. 合并 registry 共 26 个 action，action key 不重复。
3. 每个 definition 的 stateKey 存在于初始 state。
4. 所有 26 个 action 在 palette 关闭时保持 state 引用。
5. neighbor legend 主 profile 保持 compact/full/adaptive 顺序。
6. 其余新增 15 个 action保持 shown/hidden/adaptive 顺序。
7. reducer 中不再存在 latest、neighbor legend 或 deepest nested profile cycle case。
8. 既有 Help、Debug、input、renderer 和 PTY 测试通过。

## 接口边界

- 不重命名 action、state field、profile、shortcut 或 indicator。
- 不修改 profile resolver、阈值、宽度算法或 Help formatter。
- registry 仍为 TS Host TUI 本地实现，不进入 protocol、Python Engine、provider、session、transcript 或配置 schema。

## 验收标准

- 已迁移 registry action：26 个。
- reducer 剩余 cycle case：8 个。
- 目标 family 旧式 reducer case：0 个。
- TypeScript 编译、专项测试和全量测试通过。

## 实现结果

- 新增 neighbor legend、deepest nested 两个 family registry，并与 latest registry 合并为 26 项统一 registry。
- neighbor legend 主 profile 保留 `compact/full/adaptive` 和 `compact` fallback，其余迁移项保留 `shown/hidden/adaptive`。
- 删除 16 个目标 reducer case，剩余 cycle case 精确为 8 个。
- 新增 family 数量、合并数量、state field 存在性、palette guard 和 reducer 下一值测试。

## 后续边界

Phase369 已将 summary/neighbor 独立 profile 和非 profile enum cycle domain 接入统一 registry，并通过兼容类型别名保持 profile 调用边界。
