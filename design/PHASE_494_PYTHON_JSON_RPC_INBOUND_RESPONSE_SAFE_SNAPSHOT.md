# Phase494 Python JSON-RPC Inbound Response Safe Snapshot

## 状态

代码、测试与文档已完成。

## 审计结论

Python `_handle_response`原先只执行 `dict(message)` 浅复制，nested result/error containers仍由source message持有。`parse_json_rpc_result`同样只浅复制result，`parse_json_rpc_error`直接保存原始data。source或动态mapping在settlement和caller消费之间修改后，可改变waiter及request caller观察到的数据；动态dict还可能在重复inspection阶段漂移或抛错。

## 目标

- response进入waiter前建立完整connection-owned plain snapshot。
- success result返回前建立caller-owned deep snapshot。
- error object先整体snapshot，再构造JsonRpcRequestError。
- error nested data与source完全隔离。
- 动态dict validation只执行一次不可信items读取。
- snapshot或inspection失败稳定映射-32603。
- pending settlement不会因source clone异常而遗失wakeup。
- settled-history和response ID分类语义保持。

## Settlement Ownership

`_handle_response`在获取合法request ID后、进入pending lock前调用 `snapshot_json_rpc_object`。成功时完整wire response被materialize为plain built-in tree；失败时写入保留jsonrpc和id的invalid sentinel，使waiter仍能被唤醒并在request parser边界稳定返回-32603，而不是在reader线程中抛错或永久等待。

## Caller Ownership

`parse_json_rpc_result`对result调用通用object snapshot并直接返回owned plain dict。`parse_json_rpc_error`先snapshot完整error object，再在plain snapshot上执行schema validation并把owned data交给JsonRpcRequestError。settlement snapshot和caller snapshot形成两层边界，request caller不会持有reader或queue内部容器。

## 验收标准

- source response nested mutation不改变waiter payload。
- waiter result与source result/nested identity不同。
- success parser返回值不受source nested mutation影响。
- error data不受source nested mutation影响。
- success/error动态dict各只读取一次items。
- invalid success/error仍返回固定-32603 contract。
- pending settlement与settled history保持。
- focused、Python全量、TS全量和integration通过。

## 实现结果

- `_handle_response`新增完整response snapshot与invalid sentinel fallback。
- `parse_json_rpc_result`改为deep plain result snapshot。
- `parse_json_rpc_error`改为full error snapshot后验证。
- focused tests覆盖settlement nested ownership、parser ownership、identity隔离和single dynamic inspection。
