# Phase463 JSON-RPC Handler Registry Close Disposal

## 状态

代码、测试与文档已完成。

## 审计结论

Phase461-462 为handler registrations增加了ownership handles，但peer close/connection stop只解除transport或停止reader，registry仍保留所有request/notification handler closures。已终止连接因此继续持有业务组件、server/session对象；同时API仍允许在closed transport上注册永远不会dispatch的新handler。Python registration gate若不与stop clear共用锁，还会出现check后stop、clear后add的竞态。

## 目标

- close/stop transition清空request和notification registries。
- registry disposal发生在close observers或后续生命周期代码之前。
- close/stop后拒绝所有新handler registration。
- 已返回的旧unregister/unsubscribe handles在disposal后仍可安全幂等调用。
- repeated close/stop保持幂等。
- Python registration gate与stop-time clear在同一lock边界内原子化。
- 当前已捕获的dispatch registration可完成既有handler调用，但不会重新进入registry。

## Disposal Contract

TS `close()`在closed gate、transport detach和reader-state clear之后清空两个maps，再进行pending cleanup与observer dispatch。post-close `setRequestHandler`/`onNotification`立即抛出 `JSON-RPC peer is closed.`。

Python `stop()`先设置stop event，再在 `_handler_lock`内清空两个dict。register API在同一lock内检查stop event后才写registry，因此不存在stop clear之后重新插入handler的窗口；失败信息为 `JSON-RPC connection is stopped.`。

## Existing Handle Semantics

旧cleanup closure仍保留registration token，但registry已不再引用handler。首次调用只会确认当前entry不匹配/不存在并更新本地幂等flag；重复调用直接返回，不会恢复entry或影响其他method。

## 验收标准

- close/stop前两个registries各含entry。
- close/stop后两个registries为空。
- 旧cleanup handles可重复调用且不抛错。
- post-close request registration被拒绝。
- post-close notification registration被拒绝。
- repeated lifecycle transition保持稳定。
- TS和Python具有对称测试。
- TS、Python全量和integration保持通过。

## 实现结果

- TS close transition清空handler maps并增加registration closed gates。
- Python stop transition在handler lock内清空registries。
- Python registration在同一lock内执行stopped gate与写入。
- Tests覆盖closure release、post-close rejection和旧handle幂等。
