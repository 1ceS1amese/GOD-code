# Phase432 Shutdown Response Schema Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Shutdown 是最后一个 Host 发起且未验证 response 的公开 Engine RPC。Host 此前等待 JSON-RPC 完成后直接丢弃 result，因此任意 object、错误 status 或 non-JSON runtime payload 都会被当成正常 acknowledgement。与此同时 `stop()` 必须在 acknowledgement malformed、timeout 或 peer failure 时仍完成 child cleanup。

## 目标

- Host 以 unknown 接收 shutdown result。
- Acknowledgement 必须是递归 JSON-safe object。
- status 必须精确等于 `shutting_down`。
- 显式 `shutdown()` 对 malformed acknowledgement 抛错。
- `stop()` 继续捕获 shutdown failure 并完成 stdin/process/peer cleanup。
- Engine construction test 锁定 canonical response 与 connection stop side effect。

## Response Contract

```json
{
  "status": "shutting_down"
}
```

Response 保持 open object，未来可增加 JSON-safe shutdown metadata；核心 status 不做宽松兼容。

## Lifecycle Semantics

`shutdown()` 是可观察的协议调用，必须验证 acknowledgement。`stop()` 是强制 cleanup orchestration：它先清理 Host runtime maps，再尝试 validated shutdown；任何失败都被有意忽略，随后继续关闭 stdin、等待/终止 child 并关闭 peer。协议完整性不会削弱 cleanup 可达性。

## 验收标准

- Canonical Python response 通过 converter。
- null、缺失/错误 status 和 non-JSON extension 被拒绝。
- 显式 shutdown 可报告 malformed acknowledgement。
- closed/missing peer 仍为 no-op。
- stop cleanup 语义保持不变。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- 新增 `ShutdownResponse` 与 `asShutdownResponse`。
- Host shutdown 以 unknown receive 并验证 acknowledgement。
- Python test 锁定 `{status: "shutting_down"}` 和 connection.stop 调用。
- Existing stop catch boundary 保持不变。

