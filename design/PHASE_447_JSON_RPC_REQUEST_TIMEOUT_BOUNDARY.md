# Phase447 JSON-RPC Request Timeout Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase446 限制了 pending 数量，但 request timeout 仍直接交给 runtime。Node `setTimeout` 会对 NaN、负数、fractional 和超过 signed 32-bit 范围的值执行隐式截断/钳制；Python `Queue.get` 对 bool、NaN、infinity、零/负值的行为与 Node 不同。非法 timeout 可能变成立即超时、warning、永久等待或 runtime-specific exception。

## 目标

- timeout 在 ID、timer/waiter、pending admission 和 wire write 前验证。
- TS timeout 必须是 1..2,147,483,647 的整数毫秒。
- Python timeout 必须是 0.001..2,147,483.647 的有限秒数，bool 无效。
- 两端最大值对应 Node signed 32-bit timer 上限。
- invalid timeout 不消费 ID、不创建 pending、不写 wire。
- timeout failure 文本稳定且不依赖 runtime coercion。
- 当前 5s/15s/30s/60s 调用值保持兼容。

## Timeout Contract

```text
TS:     1 <= timeout_ms <= 2_147_483_647, integer
Python: 0.001 <= timeout_s <= 2_147_483.647, finite number
error:  JSON-RPC request timeout is out of range.
```

## TS Flow

`request` 在 method/params preflight 后调用 `requireJsonRpcTimeout`，随后才执行 pending capacity check 和 ID allocation。validator 使用 `Number.isSafeInteger`，并显式检查 positive 与 Node maximum；NaN、infinity、fraction、zero、negative 和 overflow 均不会到达 `setTimeout`。

## Python Flow

`require_json_rpc_timeout` 拒绝 bool/non-number，安全转换为 float，并验证 finite/min/max。`request` 使用归一化 float 值调用 `Queue.get`；validation 位于 queue creation 和 pending lock admission 前。invalid timeout 返回 `JsonRpcRequestError(-32602)`。

## 验收标准

- TS 1ms 和最大整数值合法。
- Python 0.001s 和最大秒值合法。
- NaN、infinity、zero、negative、fractional TS ms、sub-millisecond Python 和 overflow 被拒绝。
- invalid timeout 不消费 ID、不写 wire、不改变 pending。
- 默认和现有显式 timeout 调用保持通过。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- TS 新增 `JSON_RPC_MAX_TIMEOUT_MS` 和 `requireJsonRpcTimeout`。
- Python 新增 `JSON_RPC_MIN_TIMEOUT_S`、`JSON_RPC_MAX_TIMEOUT_S` 和 `require_json_rpc_timeout`。
- Python request 使用 validator 返回的 canonical float timeout。
- Tests 覆盖所有 invalid classes、边界值和 pre-admission zero-side-effect。
