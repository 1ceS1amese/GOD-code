# Phase461 JSON-RPC Notification Subscription Lifecycle

## 状态

代码、测试与文档已完成。

## 审计结论

Phase460 固定了每次dispatch的handler snapshot，但两端method notification registry仍只有add API。长生命周期peer、动态插件重载或session组件销毁后无法释放handler closure；同一function可被重复注册，又不能精确移除其中一次registration。简单按function equality删除还会让重复unsubscribe误删另一份registration。

## 目标

- 每次notification registration返回其专属unsubscribe handle。
- unsubscribe只移除对应registration identity。
- repeated unsubscribe幂等。
- 相同function多次注册仍可独立解除。
- dispatch snapshot中已接纳的registration完成当前notification。
- unsubscribe对后续notification立即生效。
- registry为空时删除method entry。
- Python跨线程register/unsubscribe/dispatch snapshot保持原子。

## Registration Identity

两端registry不再直接保存裸handler，而是保存独立registration对象：

```text
registration identity -> handler
```

即使两个registration引用同一function，它们仍具有不同对象identity。unsubscribe closure捕获registration token和本地subscribed flag，第一次调用执行copy-on-write removal，后续调用直接返回。

## Snapshot Interaction

dispatch开始时复制registration列表。当前snapshot拥有本次consumer membership，因此某个handler在执行中unsubscribe后续handler时，后续handler仍完成当前notification，但不会出现在下一条notification中。这与Phase460的dispatch-start snapshot contract一致。

## Python Synchronization

Python `JsonRpcConnection`新增 `_handler_lock`。registration、unsubscribe和dispatch snapshot均在该锁内执行短临界区；实际handler调用发生在锁外，允许handler安全注册或解除订阅且避免死锁。registry mutation继续使用copy-on-write。

## 验收标准

- 同一function可注册两次并分别解除。
- unsubscribe重复调用不影响其他registration。
- dispatch中解除另一个snapshot member不阻止其当前执行。
- 下一条notification只调用仍订阅的handler。
- 最后一个registration解除后method entry被删除。
- TS与Python定向测试覆盖相同生命周期。
- TS、Python全量和integration保持通过。

## 实现结果

- TS `onNotification`返回 `() => void`并使用registration object identity。
- Python `register_notification_handler`返回unsubscribe closure。
- Python增加handler registry lock和锁外consumer调用。
- 两端保持copy-on-write registry与per-dispatch snapshot。
- Tests覆盖duplicate function、mid-dispatch unsubscribe、idempotence和entry cleanup。
