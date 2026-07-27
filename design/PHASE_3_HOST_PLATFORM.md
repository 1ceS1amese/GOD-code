# Phase 3：宿主能力平台化

Phase 3 的主题是：

> 把 TS Host 从“固定执行几个内置工具”，推进成一个能接外部能力的平台。

这一阶段已经落下一层可运行骨架，但不直接实现完整 MCP、不做插件市场、不接真实模型 SDK。

---

## 1. Phase 3 目标

当前 GOD-code 已经有：

- TS Host 工具执行边界
- Python 回合循环
- `ModelRequest -> ModelAdapter`
- `TranscriptStore`
- `HostToolRegistry`
- `ToolScheduler`

Phase 3 要把这些边界继续往外扩：

```text
外部系统 / MCP / plugins / skills / provider SDK
  -> TS Host 或 Python provider adapter 边界
  -> 标准工具目录 / 标准模型接口 / 标准转录存储
  -> TurnEngine
```

核心原则：

- 外部工具能力优先进入 TS Host
- Python Engine 不直接管理 MCP transport / plugin runtime
- 真实模型 provider 不进入 `TurnEngine`
- transcript 落盘不写进 `TurnEngine`
- 现有 `Read / Edit / Bash / ListFiles / Search / Write` 行为不变

---

## 2. 当前已实现的运行骨架

当前 Phase 3 已经补上这些最小代码：

- `JsonlTranscriptStore`
  - 每个 session 一个 `.jsonl`
  - `append(...)` 追加写入
  - `list_entries(...)` 顺序读取
  - 通过 `GOD_CODE_TRANSCRIPT_DIR` 显式启用，默认仍用内存存储
- transcript replay helper
  - 从 user / assistant / tool_call / tool_result entry 重建基础 messages
- `ProviderRegistry`
  - 默认注册 `fake`
  - `create_session(model_adapter=...)` 从 registry 选择 adapter
- TS MCP 平台骨架
  - `McpToolRegistry`
  - `InMemoryMcpToolRegistry`
  - MCP tool 可以注册到 `HostToolRegistry`
- TS plugin 平台骨架
  - `PluginManifest`
  - manifest runtime validation
  - `PluginRegistry`
  - plugin tool 可以注册到 `HostToolRegistry`
- TS 工具名边界
  - `ToolName = string`
  - `BuiltInToolName` 保留内置六个工具名
  - 外部工具可以使用自定义 `tool_name`

---

## 3. 本阶段仍不做什么

Phase 3 当前只落平台骨架，不做完整外部集成：

- 不连接真实 MCP server
- 不实现 stdio/socket MCP transport
- 不做插件市场
- 不动态安装 npm 包
- 不接 Anthropic / OpenAI SDK
- 不读取 API key
- 不做真实 HTTP 请求
- 不做 REPL / TUI
- 不改 Phase 1 权限边界，外部工具仍走 `HostToolRegistry.executeRequest(...)`
- 不改 Phase 2 `ModelRequest -> ModelAdapter` 路径

---

## 4. Transcript 落盘与 replay

### 4.1 设计目标

把当前的内存 transcript 扩成可替换的 durable store。

当前已新增：

```text
py-engine/src/god_code_engine/transcripts/jsonl.py
```

当前接口：

```python
class JsonlTranscriptStore(TranscriptStore):
    def append(self, session_id: str, entry: TranscriptEntry) -> None: ...
    def list_entries(self, session_id: str) -> TranscriptEntries: ...
```

### 4.2 数据形态

每个 session 一个 `.jsonl` 文件。

每行是一条 transcript entry，建议包含：

```json
{
  "session_id": "session-1",
  "turn_id": "turn-1",
  "type": "tool_result",
  "timestamp": "2026-04-23T00:00:00.000Z",
  "payload": {}
}
```

### 4.3 replay 方向

当前 replay 先保持简单：

```text
JsonlTranscriptStore.list_entries(session_id)
  -> replay helper
  -> rebuild messages / inspect history
```

当前仍不实现：

- SQLite
- DuckDB
- crash recovery snapshot
- 多进程并发写
- transcript compaction
- event sourcing 完整框架

---

## 5. 真实模型 provider 接入边界

### 5.1 设计目标

真实模型可以替换 fake model，但不能把 SDK 细节塞进 `TurnEngine`。

当前已新增：

```text
py-engine/src/god_code_engine/providers/registry.py
```

当前接口：

```python
class ProviderRegistry:
    def register(self, name: str, adapter: ModelAdapter) -> None: ...
    def get(self, name: str) -> ModelAdapter: ...
    def names(self) -> list[str]: ...
```

### 5.2 接入顺序

推荐顺序：

1. 保留 `FakeModelAdapter`
2. 新增 provider registry
3. 让 `create_session` 从 registry 选择 adapter
4. 后续再接 Anthropic / OpenAI / local provider

### 5.3 职责边界

```text
Provider SDK wrapper
  -> ProviderResponseNormalizer
  -> ProviderModelAdapter
  -> ModelAdapter.next_action(request)
  -> TurnEngine
```

不做：

- API key 管理
- provider retry / fallback
- token 精确预算
- HTTP 客户端抽象
- billing / rate limit

---

## 6. MCP transport 接入边界

### 6.1 设计目标

MCP 是宿主能力，不放进 Python Engine。

当前已新增骨架：

```text
ts-host/src/mcp/
  client.ts
  registry.ts
  transport.ts
```

建议接口：

```ts
interface McpToolRegistry {
  listTools(): Promise<ToolCatalogEntry[]>;
  executeTool(name: string, input: Record<string, unknown>, context): Promise<ToolExecutionResult>;
}
```

### 6.2 数据流

```text
MCP server
  -> TS MCP client
  -> MCP tool registry
  -> HostToolRegistry adapter
  -> execute_tool
  -> Python ToolScheduler
```

### 6.3 边界规则

- TS Host 管 MCP 连接、transport、进程生命周期
- MCP tool 转成 GOD-code `ToolCatalogEntry`
- Python Engine 只看到普通工具
- 工具执行仍然走 `execute_tool`
- permission / audit 仍然走 Phase 1 的 `HostToolRegistry`

当前仍不做：

- 真实 MCP server 连接
- stdio/socket transport 实现
- auth
- remote server lifecycle
- MCP resource / prompt 支持

---

## 7. Plugin / Skill registry 边界

### 7.1 设计目标

插件和 skill 先走声明式 manifest，不让 Python Engine 直接加载插件文件。

当前已新增骨架：

```text
ts-host/src/plugins/
  manifest.ts
  loader.ts
  registry.ts
```

manifest 草案：

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

### 7.2 职责边界

- plugin 只声明能力
- tool handler 仍注册到 `HostToolRegistry`
- permission 仍走 Phase 1 policy
- Python Engine 只消费最终 tool catalog / prompt fragments / model options

本阶段不做：

- 插件市场
- 动态 npm install
- sandbox 插件运行时
- UI 插件
- skill prompt 注入执行

---

## 8. 文档和实现关系

Phase 3 当前状态是：

```text
运行骨架已开始落地 / 真实外部集成仍未实现
```

也就是说：

- `JsonlTranscriptStore` 已可用，但默认不启用
- `ProviderRegistry` 已可用；无 provider 环境变量时 registry 只有 `fake`，Phase 4 可通过环境变量额外注册真实 provider adapter
- `McpToolRegistry` 已有 fake/in-memory 骨架，不代表 MCP transport 已接通
- `PluginManifest` 和 `PluginRegistry` 已有骨架，不代表插件市场或 sandbox runtime 已可用

---

## 9. 当前测试覆盖与后续测试计划

### Python

- `JsonlTranscriptStore.append` / `list_entries`
- transcript replay 按 session 恢复顺序
- `ProviderRegistry` 默认返回 fake
- 未注册 provider 返回明确错误
- `create_session(model_adapter="fake")` 不受影响

### TS

- plugin manifest 校验
- plugin registry 注册工具目录
- MCP registry 能把 MCP tool 转成 `ToolCatalogEntry`
- MCP / plugin tool 执行仍然走 `HostToolRegistry.executeRequest(...)`
- permission policy 对 plugin / MCP tool 仍然生效

### 集成

- 默认 `god-code run "read README.md"` 不受影响
- 启用 JSONL transcript 后能看到落盘记录
- fake provider 仍能完整跑 read/list/search/write
- plugin/MCP 未启用时不影响现有 smoke

---

## 10. 推荐落地顺序

后续真正写代码时，建议按这个顺序：

1. 真实 provider adapter
2. 真实 MCP transport
3. plugin loader / sandbox runtime
4. transcript compaction / recovery
5. REPL / TUI

这样每一步都能独立测试，也不会把宿主能力、模型 provider、转录落盘混到一个中心文件里。
