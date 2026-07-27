# Phase448 JSON-RPC Request ID Exhaustion

## 状态

代码、测试与文档已完成。

## 审计结论

Phase439 要求 positive safe-integer ID，但 allocator 仍在耗尽后继续递增。TS `nextId++` 会越过 `Number.MAX_SAFE_INTEGER`，随后因 IEEE-754 精度丢失出现重复/停滞数值；Python `itertools.count` 会无限生成不符合 wire contract 的整数。虽然每次 request 最终会失败，但 allocator state 继续变化且不能明确表达 terminal condition。

## 目标

- request ID 范围固定为 1..9,007,199,254,740,991。
- 最后一个合法 ID 可被分配一次。
- 分配最后一个 ID 后 allocator 进入显式 terminal state。
- terminal state 的每次 request 稳定失败，不再执行数值递增。
- exhaustion 在 timer/waiter、pending insertion 和 wire write 前失败。
- 不循环复用旧 ID，避免 delayed response 与新 request 错误 correlation。
- capacity/timeout validation 继续优先于 ID allocation。

## Allocator Contract

```text
JSON_RPC_MAX_REQUEST_ID = 9_007_199_254_740_991
active state   = next positive safe integer
terminal state = null / None
error          = JSON-RPC request id space exhausted.
```

## TS Flow

`nextId` 从 `number` 改为 `number | null`。`allocateRequestId` 返回当前 ID；若当前值是 maximum，则将 state 设为 null，否则加一。null 状态直接 throw，不创建 timer/pending 或调用 writer。allocator 不使用 unsafe sentinel number。

## Python Flow

移除 unbounded `itertools.count`，`_next_id` 改为 `int | None`。在 pending lock 内读取当前 ID并原子更新为 next integer 或 None；None 时抛出 `JsonRpcRequestError(-32600)`。最后一个 request 的 timeout/response cleanup 不会重新开放 ID 空间。

## 验收标准

- maximum safe ID 被正确编码到 wire。
- 分配 maximum 后 state 为 null/None。
- 后续多次 request 均得到稳定 exhaustion error。
- terminal request 不写额外 frame、不增加 pending。
- allocator 不生成 unsafe integer、不 wrap 到 1、不复用旧 ID。
- 初始、capacity overflow 和 invalid timeout 不消费 ID。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- 两端新增 `JSON_RPC_MAX_REQUEST_ID`。
- TS 新增 nullable allocator state 和 `allocateRequestId`。
- Python 用 nullable integer 替换 `itertools.count`，并在 admission lock 内推进状态。
- Tests 覆盖 maximum wire ID、terminal state、重复 failure、single-frame output 和 pending cleanup。
