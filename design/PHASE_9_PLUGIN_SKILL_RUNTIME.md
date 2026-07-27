# Phase 9：Plugin / Skill Runtime

Phase 9 的目标是把当前 TS Host 侧已有的 plugin manifest / registry 骨架，推进到第一版真实 **Plugin / Skill Runtime**。

当前基础实现已落地。plugin / skill 仍然只放在 TS Host，不进入 Python Engine，也不改变 JSON-RPC wire contract。

---

## 1. 目标

Phase 9 固定为：

- 显式加载本地 plugin / skill manifest
- 校验 plugin / skill 的 id、version、tools、permissions、prompt fragments
- 将 plugin / skill tools 合并进 GOD-code `ToolCatalogEntry`
- 将已绑定 handler 的 plugin tool 注册到 `HostToolRegistry`
- plugin tool 执行继续走 `HostToolRegistry.executeRequest(...)`
- 继续复用 Phase 1 的 permission / audit / cancel 边界

目标调用链：

```text
Local plugin / skill directory
  -> TS PluginSkillRuntime
  -> PluginManifest / SkillManifest validation
  -> PluginRegistry
  -> HostToolRegistry.executeRequest(...)
  -> Python Engine execute_tool flow
```

---

## 2. 为什么放在 TS Host

Plugin / skill runtime 涉及：

- 本地目录发现
- manifest 读取和校验
- tool handler 注册
- 权限声明
- prompt fragment 收集
- 后续 sandbox / marketplace / package lifecycle

这些都属于宿主能力，不应该放进 Python Engine。

Python Engine 只需要看到标准工具目录、标准工具执行结果和后续可选的 prompt augmentation，不应该知道 plugin 文件布局、加载规则或运行时策略。

---

## 3. 当前已有基础

当前 TS Host 已经有最小骨架：

```text
ts-host/src/plugins/
  manifest.ts
  loader.ts
  registry.ts
  runtime.ts
```

已有能力：

- `PluginManifest`
- `parsePluginManifest(...)`
- `loadPluginManifest(...)`
- `loadPluginManifestFile(...)`
- `PluginRegistry`
- `PluginRegistry.registerManifest(...)`
- `PluginRegistry.registerTool(...)`
- `PluginRegistry.registerToolsWithHostRegistry(...)`
- `PluginSkillRuntime`
- `PluginRuntimeError`

Phase 9 不推翻原有接口，而是在它们之上补了 runtime 边界。

---

## 4. Plugin / Skill 的边界

Phase 9 不让 plugin 直接改核心执行路径。

plugin / skill 可以声明：

- tool catalog entries
- permission declarations
- prompt fragments

plugin / skill 不可以直接操作：

- `TurnEngine`
- `ToolScheduler`
- Python provider adapter
- JSON-RPC peer
- `HostToolRegistry.executeRequest(...)` 的 policy / audit 流程

对 Python Engine 来说，plugin / skill tool 仍然只是普通工具。

---

## 5. 配置模型

第一版只支持显式配置的本地目录：

```ts
interface PluginRuntimeConfig {
  pluginDirs: string[];
  enabledPluginIds?: string[];
}
```

默认行为：

- 未配置 plugin / skill：现有 CLI / smoke 完全不变
- 配置 plugin / skill：TS Host 读取 manifest，并把可用 tools 合并进 tool catalog
- plugin / skill 路径只能来自宿主配置，不能来自模型输出
- plugin / skill 默认不自动执行任意 JS / shell 代码

后续可以再把配置来源扩展到：

- 项目级配置文件
- 用户级配置文件
- workspace profile

但第一版不做自动发现。

---

## 6. Manifest 设计

现有 `PluginManifest` 可以继续保留：

```ts
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  tools?: ToolCatalogEntry[];
  permissions?: string[];
  promptFragments?: string[];
}
```

Skill 第一版复用同一套 shape；如果后续要拆分文档语义，可以增加别名：

```ts
interface SkillManifest {
  id: string;
  name: string;
  version: string;
  tools?: ToolCatalogEntry[];
  permissions?: string[];
  promptFragments?: string[];
}
```

第一版只要求：

- `id` 非空
- `name` 非空
- `version` 非空
- `tools` 必须是 `ToolCatalogEntry[]`
- `permissions` 必须是 string array
- `promptFragments` 必须是 string array

---

## 7. Runtime 设计接口

建议新增运行时接口：

```ts
interface LoadedPlugin {
  manifest: PluginManifest;
  rootDir: string;
}
```

```ts
interface PluginSkillRuntime {
  load(): Promise<void>;
  listTools(): ToolCatalogEntry[];
  promptFragments(): string[];
  registerToolsWithHostRegistry(hostRegistry: HostToolRegistry): void;
  close(): Promise<void>;
}
```

运行时职责：

- 从 `PluginRuntimeConfig.pluginDirs` 读取 manifest
- 校验 manifest
- 检查 plugin id 是否重复
- 检查 tool name 是否重复
- 汇总 tool catalog
- 汇总 prompt fragments
- 把已有 handler 的 tools 注册到 `HostToolRegistry`
- 退出时释放 runtime 资源

---

## 8. Tool handler 设计

第一版不执行 plugin 自带任意代码。

建议规则：

- manifest 可以声明 tool catalog
- tool handler 必须由 TS Host 显式绑定
- 未绑定 handler 的 tool 不应进入可执行 tool catalog
- 所有 plugin tool 执行都必须经过 `HostToolRegistry.executeRequest(...)`

这样做的原因是：

- 避免第一版直接引入任意代码执行风险
- 保留 Phase 1 policy / audit / cancel 边界
- 让 plugin manifest 先作为声明式能力目录落地

后续如果要支持 plugin 自带 handler，需要单独设计 sandbox runtime。

---

## 9. Tool name 规则

Phase 3 已经把 TS 侧 `ToolName` 放宽为 string。Phase 9 需要在 runtime 层加命名约束，避免外部 tool 撞内置工具。

建议第一版规则：

- 内置工具继续使用：
  - `Read`
  - `Edit`
  - `Bash`
  - `ListFiles`
  - `Search`
  - `Write`
- plugin tool 建议使用：
  - `plugin.<pluginId>.<toolName>`
- skill tool 建议使用：
  - `skill.<skillId>.<toolName>`
- runtime 拒绝重复 tool name
- runtime 默认不允许覆盖内置工具名

这不是 JSON-RPC 协议要求，而是 TS Host runtime 的安全默认值。

---

## 10. Permission / Audit 边界

plugin manifest 里的 `permissions` 第一版只作为声明，不直接绕过 policy。

执行时仍然按现有链路：

```text
HostToolRegistry.executeRequest
  -> audit: tool_requested
  -> PermissionPolicy.beforeExecute
  -> audit: tool_decision
  -> plugin tool handler
  -> PermissionPolicy.afterExecute
  -> audit: tool_finished
```

后续可以把 plugin permissions 接入 policy，例如：

- 插件要求文件读写权限
- 插件要求 bash 权限
- 插件要求网络权限
- 插件要求特定 workspace 权限

但第一版不设计交互式授权 UI。

---

## 11. Prompt fragments 边界

`promptFragments` 第一版只在 TS Host runtime 内汇总。

Phase 9 不直接把 prompt fragment 注入 Python Engine，因为当前 JSON-RPC `create_session` / `submit_turn` 没有这类字段。

后续如果要启用 prompt augmentation，建议单独设计：

- session-level prompt fragments
- tool-level prompt fragments
- prompt fragment provenance
- prompt injection 风险控制

在那之前，`promptFragments()` 只是 runtime 能力出口，不改变现有 wire contract。

---

## 12. 与 MCP 的关系

Phase 8 的 MCP runtime 和 Phase 9 的 plugin / skill runtime 都属于 TS Host 平台能力。

共同点：

- 都把外部能力转成 `ToolCatalogEntry`
- 都通过 `HostToolRegistry.executeRequest(...)` 执行
- 都复用 Phase 1 permission / audit
- 都不改变 Python Engine

区别：

- MCP 负责 server / transport / remote tool protocol
- plugin / skill 负责本地 manifest / prompt fragments / host-bound handlers

第一版不强行把 MCP 和 plugin 合成一个 runtime，只保持共同的 host registry 接入点。

---

## 13. 不改的接口

Phase 9 不改变：

- `HostToolRegistry.executeRequest(...)`
- `ToolCatalogEntry`
- `ExecuteToolRequest`
- `ToolExecutionResult`
- `initialize`
- `create_session`
- `submit_turn`
- `execute_tool`
- `god_code_event`
- Python `ToolScheduler`
- Python `ModelRequest`
- Python `TurnEngine`

也就是说，plugin / skill 对 Python Engine 来说只是普通工具目录和普通工具执行结果。

---

## 14. 明确不做

第一版不做：

- plugin marketplace
- dynamic npm install
- 自动扫描全局插件目录
- 执行 plugin 自带任意 JS / TS / shell 代码
- sandbox runtime
- UI plugin
- renderer plugin
- provider adapter plugin
- prompt fragment 自动注入
- 远程 plugin 下载
- plugin 签名校验
- plugin 权限交互式授权 UI
- Python-side plugin runtime

---

## 15. 实现测试覆盖

TS 测试已覆盖：

- plugin manifest validation
- plugin registry 注册工具
- 从显式目录加载 `plugin.json`
- 从显式目录加载 `skill.json`
- `enabledPluginIds` 过滤
- 重复 plugin id 被拒绝
- plugin tool name 与内置工具冲突时被拒绝
- `promptFragments()` 按加载顺序汇总
- 未绑定 handler 的 tool 不进入 runtime 可执行 tool catalog
- 已绑定 handler 的 plugin tool 可以注册到 `HostToolRegistry`
- plugin tool 执行仍走 `HostToolRegistry.executeRequest(...)`
- audit 能记录 plugin tool 请求、决策、结果
- Phase18 后新增 `god-code plugins validate <manifest_or_dir>` CLI，用于离线校验 plugin / skill manifest。

Python 默认不新增运行逻辑，只跑回归：

```bash
./tools/run-python-tests.sh
```

TS 回归：

```bash
cd GOD-code/ts-host
npx tsc -p tsconfig.json --noEmit
npm test -- --run
```

Smoke：

```bash
cd GOD-code
node ts-host/dist/cli/main.js rpc-smoke
node ts-host/dist/cli/main.js run "read README.md"
node ts-host/dist/cli/main.js run "bash printf ok"
```

Plugin / skill 测试使用本地临时 manifest，不从网络下载。

---

## 16. 默认决策

- Phase 9 第一版只实现本地 plugin / skill runtime
- plugin / skill runtime 只放 TS Host
- 默认 CLI 行为保持不变
- plugin / skill 只能来自显式宿主配置
- 第一版不执行 plugin 自带任意代码
- plugin / skill tools 必须继续经过 Phase 1 policy / audit
- 不改 JSON-RPC
- 不改 Python Engine
