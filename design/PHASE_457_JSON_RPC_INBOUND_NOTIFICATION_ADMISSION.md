# Phase457 JSON-RPC Inbound Notification Admission

## 状态

代码、测试与文档已完成。

## 审计结论

Phase456 限制了 TS async inbound request handlers，但 notification仍由每条 `handleLine`独立并发分发。慢 observer或method handler会让连续 notification无限积累 Promise、params和业务闭包；notification没有response，不能通过request error反馈过载。Python Engine inbound loop与notification handlers为同步串行执行，不存在同类并发累积面。

## 目标

- 限制正在执行 observer/handler chain的 inbound notifications数量。
- admission必须发生在任何 notification consumer调用之前。
- overflow不执行 observer或handler。
- notification协议保持无response语义。
- overflow产生隔离 diagnostic，不关闭健康 peer。
- observer/handler success或failure后统一释放容量。

## Admission Contract

```text
JSON_RPC_MAX_ACTIVE_INBOUND_NOTIFICATIONS = 256
```

当 active count达到256，新 notification被丢弃，并产生 `JSON-RPC active inbound notification limit exceeded.` diagnostic。该路径不写任何 JSON-RPC response，也不增加active count。

通过 admission的 notification先增加 counter，再执行公共 `notification` observers和method-specific handlers；整个 consumer chain结束后由 `finally`递减。既有逐consumer sync/async failure isolation保持不变。

## 验收标准

- 256 个阻塞 notification handlers可并发 admission。
- 第257个不调用handler并产生 diagnostic。
- overflow不产生任何 outbound frame。
- overflow不关闭peer。
- handlers settle后counter归零。
- 容量释放后replacement notification可正常执行。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- TS 导出 `JSON_RPC_MAX_ACTIVE_INBOUND_NOTIFICATIONS`。
- `JsonRpcPeer`增加 active notification counter。
- `handleNotification`负责 admission和finally release。
- 原 observer/handler isolation迁入 `dispatchNotification`。
- Tests覆盖capacity、drop/no-response、release和reuse。
