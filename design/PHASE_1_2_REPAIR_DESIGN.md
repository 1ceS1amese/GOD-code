# Phase 1 / Phase 2 修复设计：执行边界与模型边界补强

> 历史修复说明：这份文档记录 Phase 1 / Phase 2 审计后的修复方案和落地结果。当前代码中对应修复已经基本落地，文中保留的“后续实现时”等表述用于追溯当时计划，不代表当前仍未完成。

这份文档记录 Phase 1 / Phase 2 审计后的小修范围和落地结果。

它记录上一轮审计后需要补的小缺口，方便后续实现时直接照着做。修复范围很窄：

- 不重写现有架构
- 不改 JSON-RPC 协议
- 不接真实模型 provider
- 不实现 MCP / plugin / REPL / TUI
- 不进入 Phase 3

目标是让 Phase 1 的执行边界更严一点，让 Phase 2 的 streaming / provider 预留口更稳一点。

---

## 1. 总目标

### Phase 1 要补强什么

当前 Phase 1 已经实现了权限、策略、审计和取消传播。本修复设计记录的是已经补齐的几个边角：

1. `HostToolRegistry.executeRequest(...)` 是唯一正式入口，raw handler 调用只保留为内部细节。
2. deny / prompt / policy error 路径的 audit 记录已补成闭环。
3. `Bash.cwd` 默认不能跳出 session cwd。

### Phase 2 要补强什么

当前 Phase 2 已经实现了 `PromptBuilder -> ModelRequest -> ModelAdapter` 路径，但后续接真实 provider 前还需要补两个小口：

1. streaming loop 内部要支持取消检查。
2. provider normalizer 要预留 tool catalog 校验入口。

---

## 2. Phase 1：执行边界补强

### 2.1 收紧 `HostToolRegistry` 入口

修复前有两个入口：

```ts
registry.execute(...)
registry.executeRequest(...)
```

其中：

- `executeRequest(...)` 会经过 policy / audit / abort signal。
- `execute(...)` 直接调用工具 handler，可能绕过 policy / audit。

实现后，`executeRequest(...)` 是唯一正式入口。

建议调整：

```text
HostToolRegistry.executeRequest(...)
  -> 正式入口，runtime / MCP / plugin / future tools 都走这里

HostToolRegistry.runHandler(...) 或 executeRaw(...)
  -> private 内部方法，只负责调用真实工具 handler
```

设计后的主链路：

```text
executeRequest
  -> audit: tool_requested
  -> permissionPolicy.beforeExecute
  -> audit: tool_decision
  -> deny / prompt / allow
  -> run raw handler
  -> permissionPolicy.afterExecute
  -> audit: tool_finished
  -> return ToolExecutionResult
```

测试如果只想测某个工具本体，优先直接调用具体函数：

- `executeRead`
- `executeEdit`
- `executeBash`
- `executeListFiles`
- `executeSearch`
- `executeWrite`

不要在测试里依赖一个 public raw registry 入口。

---

### 2.2 补完整 audit 链路

后续所有工具请求尽量形成统一审计链：

```text
tool_requested
tool_decision
tool_finished
```

#### allow 路径

```text
tool_requested
tool_decision(action=allow)
真实执行工具
tool_finished(result=actual result)
```

#### deny 路径

```text
tool_requested
tool_decision(action=deny)
不执行工具
tool_finished(result=permission_denied)
```

返回：

```ts
{
  ok: false,
  error: {
    code: "permission_denied",
    message: "...",
    details: {
      tool_name,
      reason
    }
  }
}
```

#### prompt 路径

Phase 1 没有交互确认 UI，所以 `prompt` 继续按 deny 处理。

```text
tool_requested
tool_decision(action=prompt)
不执行工具
tool_finished(result=permission_denied)
```

错误信息继续说明：

```text
Interactive approval is not implemented in phase 1.
```

#### policy error 路径

如果 `permissionPolicy.beforeExecute(...)` 抛异常：

```text
tool_requested
tool_finished(result=policy_error)
```

不执行工具。

返回：

```ts
{
  ok: false,
  error: {
    code: "policy_error",
    message: "...",
    details: {
      tool_name
    }
  }
}
```

说明：

- audit 自己失败时，不改变工具执行结果。
- `NoopAuditSink` 和 `MemoryAuditSink` 继续保留。
- 本轮不做 audit 落盘。

---

### 2.3 限制 `Bash.cwd` 不能跳出 session cwd

当前 `Bash` 支持输入：

```json
{
  "command": "pwd",
  "cwd": ".."
}
```

这会让实际工作目录跳出 session cwd。

后续实现时规则固定为：

- 不传 `cwd`：继续使用 `context.cwd`
- 传了 `cwd`：
  - 用 `resolveToolPath(context.cwd, requestedCwd)` 解析
  - 用 `isPathInside(context.cwd, resolvedCwd)` 判断
  - 不在 session cwd 内就拒绝

拒绝返回：

```ts
{
  ok: false,
  error: {
    code: "permission_denied",
    message: "Bash cwd is limited to the session cwd.",
    details: {
      cwd: resolvedCwd
    }
  }
}
```

要求：

- 被拒绝时不能 spawn 子进程。
- cwd 内子目录仍然允许。
- 不新增配置开关。
- 不改变 Bash command denylist。
- 不改变 Bash 默认 10s timeout。
- 不改变 Bash 取消逻辑。

---

## 3. Phase 2：模型边界补稳

### 3.1 streaming loop 增加取消检查

当前 `TurnEngine` 会在进入模型前和工具后检查 cancel，但 streaming loop 内部还没有在每个 event 之间检查。

后续实现时，把内部调用从：

```python
action = self._next_model_action(session, turn_id, turn_options)
```

调整为：

```python
action = self._next_model_action(session, turn_id, turn_options, cancel_event)
```

推荐新增内部异常：

```python
class TurnCancelled(Exception):
    pass
```

原因：

- 不污染公开 `ModelAction` 类型。
- 不改 `ModelAdapter` 接口。
- 内部控制流更直接。

streaming loop 规则：

```text
for event in adapter.stream_actions(request):
  if cancel_event.is_set():
    raise TurnCancelled

  if event is AssistantDelta:
    emit assistant_delta
    continue

  if cancel_event.is_set():
    raise TurnCancelled

  return final ModelAction
```

外层 `run_turn` 捕获 `TurnCancelled` 后：

```text
turn_finished(status=cancelled)
```

行为要求：

- 已经发出的 `assistant_delta` 可以保留。
- 取消后不能再发 `assistant_message`。
- 取消后不能继续消费 provider stream。
- fake streaming 现有行为不变。
- 非 streaming 路径不受影响。

---

### 3.2 provider normalizer 预留 tool catalog 校验入口

当前 `SimpleProviderResponseNormalizer` 能把 provider payload 转成：

- `AssistantMessageAction`
- `ToolCallAction`

但它不检查 tool name 是否在当前 session tool catalog 里。

后续实现时新增轻量 helper：

```python
def validate_tool_call_against_catalog(
    action: ModelAction,
    tools: list[ToolCatalogEntry],
) -> ModelAction:
    ...
```

行为：

- 如果 action 是 `AssistantMessageAction`：原样返回。
- 如果 action 是 `ToolCallAction`：
  - tool name 在 catalog 内：原样返回。
  - tool name 不在 catalog 内：抛 `ProviderResponseError`。

错误信息：

```text
Provider returned unknown tool: <tool_name>
```

边界：

- 不在 `TurnEngine` 里强制调用。
- 后续真实 provider adapter 接入时调用。
- `FakeModelAdapter` 不受影响。
- 当前只校验工具名，不做 input schema 校验。
- 不新增 provider registry。

---

## 4. 后续实现测试清单

### 4.1 TS 单测

后续实现时需要覆盖：

1. `HostToolRegistry` 正式路径
   - `Read / Edit / Bash / ListFiles / Search / Write` 都能通过 `executeRequest(...)` 执行。

2. audit deny 链路
   - path deny 后返回 `permission_denied`
   - audit events 为：

```text
tool_requested
tool_decision
tool_finished
```

3. audit prompt 链路
   - 自定义 policy 返回 `{ action: "prompt" }`
   - 返回 `permission_denied`
   - audit 记录最终 `tool_finished`

4. policy exception 链路
   - 自定义 policy 抛异常
   - 返回 `policy_error`
   - audit 记录最终 `tool_finished`

5. Bash cwd 限制
   - `{ command: "pwd", cwd: ".." }` 返回 `permission_denied`
   - 不执行真实命令

6. Bash cwd 内子目录
   - `{ command: "pwd", cwd: "subdir" }` 成功
   - stdout 对应子目录

---

### 4.2 Python 单测

后续实现时需要覆盖：

1. streaming cancel before first event
   - cancel flag 在进入 streaming 前已经 set
   - 最终 `turn_finished(status=cancelled)`
   - 不发 `assistant_message`

2. streaming cancel after delta
   - custom streaming adapter 先 yield `AssistantDelta`
   - 测试触发 cancel
   - 后续 final assistant action 不再发出
   - 最终 `turn_finished(status=cancelled)`

3. provider tool catalog 校验
   - assistant action 原样通过
   - 已注册 tool call 原样通过
   - 未注册 tool call 抛 `ProviderResponseError`

4. 回归
   - fake model 六类 deterministic prompt 仍然通过
   - `PromptBuilder` 仍然构造 `ModelRequest`
   - `TurnEngine` read / list / search / write 路径仍然通过

---

## 5. 后续实现后的验证命令

```bash
./tools/run-python-tests.sh
```

```bash
cd GOD-code/ts-host
npx tsc -p tsconfig.json --noEmit
npm test -- --run
```

可选 smoke：

```bash
cd GOD-code/ts-host
npm run build
cd ..
node ts-host/dist/cli/main.js rpc-smoke
node ts-host/dist/cli/main.js run "read README.md"
node ts-host/dist/cli/main.js run "bash printf ok"
```

---

## 6. 明确不做

这份设计不包含：

- Phase 3 实现
- 真实 Anthropic / OpenAI / local model SDK
- MCP runtime
- plugin / skill runtime
- REPL / TUI
- JSON-RPC wire contract 修改
- provider registry
- provider input schema 校验
- audit 落盘

---

## 7. 默认决策

- `executeRequest(...)` 是唯一正式宿主工具执行入口。
- raw handler 调用只能作为 `HostToolRegistry` 内部细节。
- `Bash.cwd` 默认不能跳出 session cwd。
- `prompt` 策略在 Phase 1 继续按 `permission_denied` 处理。
- provider normalizer 只先校验 tool name。
- streaming cancel 用内部 `TurnCancelled` 异常处理，不扩大公开类型。
