# Phase435 Host Tool Request Construction Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

TS Host 已验证 execute_tool(s) ingress，但 Python Engine outbound request 仍由 scheduler 内联 dict 构造。正常 provider normalizer 会较早检查 ToolCall，不过 custom adapter、direct constructor 或 scheduler caller 可绕过：ToolCall dataclass 没有 identity/JSON invariant，scheduler 不检查 session/turn identity、empty batch 或 duplicate call IDs。这会把本可在 Engine 内定位的问题推迟到跨进程 Host rejection。

## 目标

- ToolCall 在构造时保证 non-blank call/name identity 和 JSON-safe input。
- Scheduler 在发送前验证 session/turn identity。
- Batch 必须 non-empty 且 call IDs 唯一。
- Serial/batch request 通过集中 builder 构造。
- 最终 outbound payload 必须递归 JSON-safe。
- malformed request 不调用 requester，不跨进程发送。

## Request Contract

Serial request：session_id、turn_id、tool_call_id、tool_name 均 non-blank，input 为 JSON-safe object。

Batch request：共享 non-blank session/turn identity，tool_calls 非空，每个 slot 满足 ToolCall contract，tool_call_id 在 batch 内唯一。

## Validation Layers

1. `ToolCall.__post_init__` 封闭模型 action construction。
2. `ToolScheduler` 在 execute/execute_many 入口验证 turn scope 和 batch集合不变量。
3. `_build_execute_tool_request` / `_build_execute_tools_request` 生成最终 payload并执行 whole-object JSON safety。
4. TS Host 继续独立执行 Phase399/406 ingress validation。

## 验收标准

- 正常 serial、legacy parallel 和 batched requests 保持通过。
- 空白 ToolCall identity 和 non-JSON input 在构造点失败。
- 空白 session/turn、empty batch、duplicate IDs 在 requester 前失败。
- requester invocation count 为零。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- ToolCall 新增 construction invariant。
- Scheduler 新增 execution identity 与 batch集合 validation。
- 新增集中 serial/batch request builders。
- Existing tests 更新为更早的 construction failure semantics。
- Tests 锁定 no-request-on-invalid invariant。

