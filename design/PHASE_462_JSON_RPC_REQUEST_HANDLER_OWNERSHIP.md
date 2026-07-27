# Phase462 JSON-RPC Request Handler Ownership

## 状态

代码、测试与文档已完成。

## 审计结论

Phase461 为notification subscriptions建立了精确生命周期，但request registry仍直接以method覆盖裸handler且不返回cleanup handle。动态组件替换handler后，旧组件无法安全释放自身registration；如果只按method删除，旧cleanup会误删较新的replacement owner。Python registry mutation还未与Phase461共用handler lock。

## 目标

- 每次request handler registration返回其专属unregister handle。
- 同一method保持single current owner语义。
- replacement立即成为后续request的handler。
- stale unregister不得删除replacement registration。
- current owner unregister后method恢复method-not-found。
- repeated unregister幂等。
- dispatch开始时捕获registration，执行期间替换不改变当前request。
- Python registry lookup/mutation由handler lock保护，实际handler调用锁外完成。

## Ownership Contract

request registry存储registration object：

```text
method -> current RequestRegistration
```

新registration原子替换method entry。unregister closure只在map当前值仍与自身registration identity相同时删除；若该method已被replacement接管，stale closure只更新自己的本地幂等状态，不修改registry。

## Dispatch Snapshot

router在调用handler前读取当前registration到局部变量。之后即使registry被替换或解除，当前request仍由已捕获handler完成；下一条request使用最新owner。这与notification的dispatch-start ownership原则一致，但request每个method只允许一个owner。

## Python Synchronization

Python复用Phase461 `_handler_lock`：register/unregister和dispatch lookup位于短临界区，handler调用在锁外。这样动态replacement与reader thread之间具有明确可见性，同时允许handler内部安全修改registry。

## 验收标准

- first owner被second owner替换。
- first的stale unregister重复调用不影响second。
- request由second处理。
- second unregister重复调用幂等。
- 后续request获得 -32601 method-not-found。
- registry entry被清理。
- TS与Python具有对称测试。
- TS、Python全量和integration保持通过。

## 实现结果

- TS新增 `RequestRegistration`并让 `setRequestHandler`返回unregister。
- Python新增 `RequestRegistration`并让 `register_request_handler`返回unregister。
- 两端基于registration identity执行stale-safe removal。
- Python request registry接入handler lock和锁外调用。
- Tests覆盖replacement ownership、stale/idempotent unregister和method-not-found恢复。
