# Phase436 Tool Cancellation Notification Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

`cancel_tool_execution` 是除 god_code_event 外唯一 Engine-to-Host notification。Engine 由已验证的 cancel_turn request 内联构造 payload，但没有独立 typed construction invariant；Host 只检查 generic record 和两个 identity，顶层或 nested non-JSON extension 可在 direct runtime 调用中穿过并创建/abort controller。

## 目标

- Python Engine 用 typed notification object 构造 payload。
- session_id 与 turn_id 在构造时必须 non-blank。
- TS Host 使用独立 runtime converter。
- 整个 notification 必须递归 JSON-safe。
- Validation 在 finalized lookup 和 controller mutation 之前完成。
- malformed notification 不创建或 abort controller。

## Notification Contract

```json
{
  "session_id": "session-1",
  "turn_id": "turn-1"
}
```

Wire schema 保持 open object 以兼容 JSON-safe metadata，但 bundled Engine 的 typed builder 当前只发 canonical 两字段 payload。

## Validation Layers

1. Engine `CancelToolExecutionNotification.__post_init__` 验证 identity。
2. `to_dict()` 生成 canonical payload。
3. Host `asCancelToolExecutionNotification` 验证 full JSON safety 与 identity。
4. 只有 converter 成功后才检查 finalized registry 并执行 abortTurn。

## 验收标准

- Successful cancel_turn 发出 canonical notification。
- 空白 identity 在 Python construction 和 Host ingress 均被拒绝。
- non-JSON extension 被 Host 拒绝。
- malformed payload 不改变 controller state。
- finalized notification suppression 保持不变。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- 新增 Python `CancelToolExecutionNotification` dataclass。
- Engine server 用 typed object 替代 inline dict。
- 新增 TS `CancelToolExecutionNotification` interface 与 converter。
- Host handler 改为 validate-before-lifecycle。
- Tests 覆盖 canonical emission、constructor failure 和 Host no-mutation invariant。

