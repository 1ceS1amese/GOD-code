# Phase449 JSON-RPC Response Lifecycle Diagnostics

## 状态

代码、测试与文档已完成。

## 审计结论

Phase446-448 封闭了 pending capacity、timeout 和 ID exhaustion，但所有未命中 pending 的 response 仍被视为 unknown。重复 response、timeout 后到达的 late response 和从未分配的 ID 具有不同故障含义；缺少分类会削弱 peer bug、重试问题和 transport delay 的诊断。Python 甚至完全静默，且 timeout pop 与 response queue delivery 存在窄竞争窗口。

## 目标

- 记录近期离开 pending 的 request ID 与 settlement 原因。
- response 已完成后再次到达分类为 duplicate。
- timeout 后 response 到达分类为 late。
- 不在 pending/history 的 ID 分类为 unexpected。
- settled history 固定为 512 项，FIFO 淘汰，不能形成新的无界状态。
- malformed response 只要消费 pending，也归类为 completed，后续到达仍是 duplicate。
- Python 提供可选 diagnostic callback，默认保持兼容静默。
- diagnostic consumer 失败不得中断 Python transport。
- Python timeout/response 竞争不应丢失已经从 pending 取走并投递的 response。

## Diagnostic Contract

```text
Duplicate JSON-RPC response id: <id>
Late JSON-RPC response id: <id>
Unexpected JSON-RPC response id: <id>
```

```text
JSON_RPC_SETTLED_HISTORY_LIMIT = 512
state = completed | timed_out
```

## TS Flow

`settledRequests` 使用 insertion-ordered Map。timeout 删除 pending 后记录 `timed_out`；response 命中 pending 后在 payload validation 前记录 `completed`。未命中 pending 时按 history 发出 duplicate/late/unexpected `protocol_error`。每次插入超过 512 时删除最旧 ID。

## Python Flow

`JsonRpcConnection` 增加 bounded `OrderedDict` 和可选 `protocol_diagnostic` callback。response 在 `_pending_lock` 内 pop、record completed 并 put queue，timeout 在同一 lock 内仅当成功 pop 时记录 timed_out；若 response 已先 pop，则 requester 再从 waiter 做 non-blocking recovery。callback exception 被隔离。

## 验收标准

- completed request 的第二个 response 分类为 duplicate。
- timed-out request 的 response 分类为 late。
- never-issued/non-retained ID 分类为 unexpected。
- 三类 response 都不改变 pending state。
- history 保持最多 512 项并淘汰最旧 ID。
- Python 无 callback 时保持静默。
- callback failure 不影响 reader。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- 两端新增 `JSON_RPC_SETTLED_HISTORY_LIMIT = 512` 与 bounded settlement history。
- TS 将 unknown response diagnostic 拆为 duplicate/late/unexpected。
- Python 新增 optional failure-isolated protocol diagnostic callback。
- Python response delivery 移入 pending lock，并增加 timeout-edge waiter recovery。
- Tests 覆盖三种分类、history eviction 和 queue delivery。
