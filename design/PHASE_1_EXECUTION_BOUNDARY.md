# Phase 1：执行边界设计

> 历史设计说明：这份文档是 Phase 1 早期设计稿。当前代码中 Phase 1 执行边界已经落地，文中出现的“后续实现时”等表述保留为历史上下文，不代表当前仍未实现。

这份文档只设计 Phase 1：把 `Read / Edit / Bash` 的执行边界补完整。

简单说，Phase 1 不急着接真实模型、不做 MCP、不做 REPL。它只解决一个问题：

> 工具真正执行前，谁来判断能不能执行；工具执行中，谁来取消；工具执行后，谁来记录发生了什么。

---

## 1. Phase 1 目标

Phase 1 要补三件事：

1. **权限系统骨架**
   - 工具执行前先过一层 `PermissionPolicy`
   - 不让 `Read / Edit / Bash` 自己各写一套权限判断

2. **工具策略**
   - `Read / Edit` 走路径策略
   - `Bash` 走命令策略
   - 所有工具执行都走审计策略

3. **回合取消传播**
   - Python Engine 收到 `cancel_turn`
   - TS Host 能把取消传到正在执行的工具
   - `Bash` 能真正停止子进程

---

## 2. 为什么执行边界必须放在 TS Host

权限判断不应该放进 Python Engine。

原因很直接：

- 文件系统是在 TS Host 这边碰的
- shell 命令是在 TS Host 这边跑的
- 后续 interactive approval UI 也更适合放在 TS Host
- MCP、插件、远程工具最终也都会表现成“宿主能力”

Python Engine 只需要决定：

```text
我要调用哪个工具，参数是什么。
```

TS Host 负责决定：

```text
这个工具现在能不能执行，怎么执行，执行完怎么记录。
```

所以 Phase 1 的核心接入点就是：

```text
HostToolRegistry.executeRequest()
```

---

## 3. 推荐模块落点

后续实现时建议新增这些目录：

```text
GOD-code/ts-host/src/policy/
  base.ts
  defaultPolicy.ts
  pathPolicy.ts
  commandPolicy.ts

GOD-code/ts-host/src/audit/
  auditSink.ts
  memoryAuditSink.ts
  noopAuditSink.ts
```

现有工具文件保持简单：

```text
host_tools/read.ts
host_tools/edit.ts
host_tools/bash.ts
```

这些文件只负责“怎么做工具本身”，不负责统一权限策略。

---

## 4. 权限系统接口设计

### 4.1 `PermissionPolicy`

```ts
export interface PermissionPolicy {
  beforeExecute(
    request: ExecuteToolRequest,
    context: PolicyContext
  ): Promise<PolicyDecision>;

  afterExecute(
    request: ExecuteToolRequest,
    result: ToolExecutionResult,
    context: PolicyContext
  ): Promise<void>;
}
```

### 4.2 `PolicyDecision`

```ts
export type PolicyDecision =
  | { action: "allow" }
  | { action: "deny"; reason: string }
  | { action: "prompt"; reason: string };
```

Phase 1 只真正处理：

- `allow`
- `deny`

`prompt` 只预留接口，不做交互 UI。

如果遇到 `prompt`，Phase 1 默认当作 `deny` 处理，错误信息说明：

```text
Interactive approval is not implemented in phase 1.
```

### 4.3 `PolicyContext`

```ts
export interface PolicyContext extends HostToolContext {
  sessionId: string;
  turnId: string;
  toolCallId: string;
  resolvedPath?: string;
  abortSignal?: AbortSignal;
}
```

说明：

- `cwd` 仍然来自 `HostToolContext`
- `sessionId / turnId / toolCallId` 来自 `ExecuteToolRequest`
- `resolvedPath` 给路径策略使用
- `abortSignal` 给取消传播使用

### 4.4 默认错误码

权限拒绝时统一返回：

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

取消时统一返回：

```ts
{
  ok: false,
  error: {
    code: "tool_cancelled",
    message: "...",
    details: {
      tool_name,
      tool_call_id
    }
  }
}
```

---

## 5. 策略优先级

权限判断固定按这个顺序走：

```text
1. denylist
2. explicit allow
3. default allow
4. prompt fallback
```

也就是说：

- deny 永远优先
- allow 不能覆盖 deny
- 没有命中任何规则时，Phase 1 默认 allow
- prompt 只预留，不真正弹确认框

这个默认策略是为了不破坏当前 smoke：

```bash
god-code run "read README.md"
god-code run "bash printf ok"
```

---

## 6. 路径策略

路径策略用于：

- `Read`
- `Edit`

### 6.1 统一路径解析

路径解析必须继续复用：

```ts
resolveToolPath(context.cwd, input.path)
```

不要在 policy 里重新手写一套解析逻辑。

### 6.2 默认规则

Phase 1 默认规则：

- `Read`：允许读取 `cwd` 内路径
- `Edit`：允许修改 `cwd` 内路径
- 超出 `cwd` 的路径默认拒绝

### 6.3 建议的判断方式

实现时用 `path.relative()` 判断是否还在 `cwd` 内：

```text
relative path 不以 ".." 开头，并且不是绝对路径
```

Windows 和 Linux 都按这个规则处理。

### 6.4 失败行为

路径策略拒绝时：

```text
error.code = "permission_denied"
```

不要继续调用真实工具实现。

---

## 7. 命令策略

命令策略用于：

- `Bash`

### 7.1 默认规则

Phase 1 默认：

- `Bash` 默认允许
- 支持 denylist 禁止危险命令片段

建议内置 denylist 先保持很小，避免误伤开发体验：

```text
rm -rf /
mkfs
shutdown
reboot
```

### 7.2 匹配方式

Phase 1 只做简单字符串匹配：

```text
command.includes(pattern)
```

不做 shell AST，不做复杂解析。

### 7.3 失败行为

命中 denylist 时：

```text
error.code = "permission_denied"
```

并且不要 spawn 子进程。

---

## 8. 审计策略

审计不是权限判断本身，但要和权限系统放在同一条执行链上。

### 8.1 `AuditSink`

```ts
export interface AuditSink {
  record(event: AuditEvent): Promise<void>;
}
```

### 8.2 `AuditEvent`

```ts
export type AuditEvent =
  | {
      type: "tool_requested";
      request: ExecuteToolRequest;
      context: PolicyContext;
    }
  | {
      type: "tool_decision";
      request: ExecuteToolRequest;
      decision: PolicyDecision;
    }
  | {
      type: "tool_finished";
      request: ExecuteToolRequest;
      result: ToolExecutionResult;
    };
```

### 8.3 默认实现

Phase 1 建议先做两个实现：

- `NoopAuditSink`
- `MemoryAuditSink`

不急着写 JSONL / SQLite。

---

## 9. `HostToolRegistry` 接入方式

后续实现时，`HostToolRegistry.executeRequest()` 的流程应该变成：

```text
1. 组装 PolicyContext
2. audit: tool_requested
3. policy.beforeExecute()
4. audit: tool_decision
5. 如果 deny / prompt fallback，返回 permission_denied
6. 如果 allow，执行真实工具
7. policy.afterExecute()
8. audit: tool_finished
9. 返回 ToolExecutionResult
```

关键点：

- policy 包住所有工具
- 工具文件不关心权限系统
- policy 抛异常时要包装成结构化错误

policy 抛异常时建议返回：

```text
error.code = "policy_error"
```

---

## 10. 各工具怎么走策略

### 10.1 `Read`

流程：

```text
Read request
  -> resolve path
  -> path policy
  -> allowed 后才 fs.readFile
```

被拒绝时不读文件。

### 10.2 `Edit`

流程：

```text
Edit request
  -> resolve path
  -> path policy
  -> allowed 后才 fs.readFile / fs.writeFile
```

被拒绝时不写文件。

### 10.3 `Bash`

流程：

```text
Bash request
  -> command policy
  -> allowed 后才 spawn bash
```

被拒绝时不创建子进程。

---

## 11. 取消传播设计

目标链路：

```text
cancel_turn
  -> SessionManager.cancel_event
  -> TurnEngine 检查 cancel
  -> ToolScheduler / execute_tool 增加 cancel 语义
  -> TS Host / HostToolRegistry 传递 AbortSignal
  -> Bash 收到取消后 SIGTERM，超时后 SIGKILL
```

### 11.1 Phase 1 最小可做方案

Phase 1 建议先做宿主侧可取消工具上下文：

```ts
export interface HostToolContext {
  cwd: string;
  abortSignal?: AbortSignal;
}
```

然后优先让 `Bash` 响应：

```text
abortSignal.abort()
  -> child.kill("SIGTERM")
  -> 100ms 后如果还没退出，child.kill("SIGKILL")
```

### 11.2 `Read / Edit` 的取消策略

`Read / Edit` 只做协作式检查：

- 执行前检查 `abortSignal.aborted`
- 文件 IO 过程中不强行中断
- 执行后如果已取消，返回 `tool_cancelled`

原因：

- 文件 IO 通常很快
- Phase 1 不引入更复杂的 abortable fs 封装

### 11.3 `Bash` 的取消策略

`Bash` 必须真正尝试停止子进程：

- 收到 abort 后先 `SIGTERM`
- 100ms 后还没结束再 `SIGKILL`
- 返回 `tool_cancelled`
- `details` 里带上 stdout / stderr 截止内容

---

## 12. Python Engine 侧语义

Python Engine 仍然不判断权限。

但它需要理解两个工具结果：

### 12.1 `permission_denied`

如果工具结果是：

```text
ok = false
error.code = "permission_denied"
```

则当前回合结束为：

```text
turn_finished(status=error)
```

### 12.2 `tool_cancelled`

如果工具结果是：

```text
ok = false
error.code = "tool_cancelled"
```

则当前回合结束为：

```text
turn_finished(status=cancelled)
```

这能让取消和普通工具错误区分开。

---

## 13. `turn_options` 预留字段

Phase 1 只设计，不要求马上用满。

建议预留：

```json
{
  "policy_mode": "default",
  "tool_timeout_ms": 10000,
  "cancellation_mode": "cooperative"
}
```

字段含义：

- `policy_mode`
  - `default`
  - `strict`
  - `permissive`

- `tool_timeout_ms`
  - 单工具默认超时
  - 后续可覆盖 `Bash` 默认 10s

- `cancellation_mode`
  - `cooperative`
  - `best_effort_kill`

Phase 1 默认：

```text
policy_mode = default
tool_timeout_ms = 10000
cancellation_mode = cooperative
```

---

## 14. Phase 1 明确不做的事

为了避免范围膨胀，Phase 1 不做：

- 真实 interactive approval UI
- MCP 权限模型
- 插件权限模型
- JSONL / SQLite 审计落盘
- shell AST 解析
- 路径 capability token
- 多用户 / 多 workspace 权限隔离
- 云端策略同步

这些都放到后续阶段。

---

## 15. 后续实现测试清单

### 15.1 TS 单测

必须覆盖：

- `Read` 访问 allow path 成功
- `Read` 访问 deny path 返回 `permission_denied`
- `Edit` 命中 denylist 不写文件
- `Bash` 命中 command denylist 不执行命令
- policy 抛异常时包装为结构化错误
- `Bash` 收到取消后终止子进程
- `prompt` decision 在 Phase 1 按 deny 处理
- audit 记录 request / decision / result

### 15.2 Python 单测

必须覆盖：

- `cancel_turn` 能设置 active turn 的 cancel flag
- tool result 为 `tool_cancelled` 时，turn 结束为 `cancelled`
- tool result 为 `permission_denied` 时，turn 结束为 `error`
- 普通 tool error 仍然保持 `error`

### 15.3 集成测试

建议覆盖：

- `god-code run "bash sleep 10"` 后触发取消，最终收到 `turn_finished(status=cancelled)`
- 被权限拒绝的工具不会产生真实副作用
- 审计记录包含 request、decision、result 三段信息
- 当前 smoke 不被默认策略破坏

---

## 16. 验收标准

Phase 1 实现完成后，应该满足：

- 默认配置下，现有 `Read / Edit / Bash` 行为不变
- 所有工具执行前都经过统一 policy
- 权限拒绝不会触发真实副作用
- `Bash` 可以被取消并清理子进程
- `permission_denied` 和 `tool_cancelled` 都有固定错误码
- 审计接口能记录完整执行链
- Python Engine 仍然不直接碰文件系统和 shell
