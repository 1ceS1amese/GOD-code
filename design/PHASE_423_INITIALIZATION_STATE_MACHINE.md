# Phase423 Initialization State Machine

## 状态

代码、测试与文档已完成。

## 审计结论

Phase422 已验证 initialize 的 protocol version，但握手仍不是运行时状态边界：Python Engine 可在 initialize 前 create_session，重复 initialize 可改写 execute_tools capability；TypeScript Host 也可直接 create/submit/cancel，并允许两个并发 initialize RPC 同时进入协商。

## 目标

- 将 initialize 从普通 RPC 提升为一次性 lifecycle transition。
- 业务 RPC 必须在成功握手后才能发出或执行。
- 重复 initialize 不得改写已协商 capability state。
- 并发 initialize 只能有一个请求进入 wire。
- 失败的 initialize 不得把 Host/Engine 标记为 initialized。
- stop/child exit 必须清理 Host handshake state。
- shutdown 保持可在未初始化或失败初始化后执行，保证 cleanup 可达。

## Host State Machine

Host 维护：

- `initialized`
- `initializing`

状态转换：

```text
uninitialized --initialize--> initializing --valid response--> initialized
                                      |--failure-----------> uninitialized
initialized --stop/exit------------------------------------> uninitialized
```

规则：

- initialized 时再次 initialize：拒绝。
- initializing 时并发 initialize：拒绝且不发送第二个 RPC。
- createSession/submitTurn/cancelTurn：仅 initialized 可调用。
- shutdown/stop：不要求 initialized。

## Engine State Machine

Engine 使用 `_initialized`：

- 初始为 false。
- version 和 capability negotiation 全部成功后设为 true。
- 重复 initialize 返回 JSON-RPC `-32002`。
- create_session/submit_turn/cancel_turn 在 false 时返回 `-32002`。
- shutdown 始终可调用，因为进程即将终止，不提供同进程 reinitialize。

## Error Semantics

- Version/schema 问题：`-32602` invalid params。
- 正确请求在错误 lifecycle state：`-32002`。
- Host 本地状态错误在发送 RPC 前抛出明确 Error。

## 验收标准

- 未初始化 Host 不发送 create/submit/cancel RPC。
- 并发 Host initialize 只发送一个 RPC。
- 成功后重复 Host initialize 被拒绝。
- failed Host initialize 可保持 uninitialized。
- Engine 未初始化业务方法统一返回 -32002。
- Engine 重复 initialize 返回 -32002 且 capability state不变。
- 正常 start -> initialize -> session -> turn 路径保持通过。
- 全量 TS/Python/integration 通过。

## 实现结果

- Host 新增 initialized/initializing state 与业务 preflight。
- Host exit/stop 清理 handshake state。
- Engine 新增 one-shot initialized state 与共享 `_require_initialized`。
- 现有 direct server/process tests 已显式建立正确握手前置条件。
- 新增 pre-initialize、duplicate 和 concurrent initialize tests。
