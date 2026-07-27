# Phase464 Python JSON-RPC Stop Pending Rejection

## 状态

代码、测试与文档已完成。

## 审计结论

TS `close()`会立即reject全部pending requests，Python `stop()`此前只设置event并清理handler registries。其他线程正在执行的 `JsonRpcConnection.request()`仍阻塞在waiter，直到原始timeout（最大可超过24天）；stop后新request还可分配ID、写frame并再次进入pending。terminal lifecycle因此未拥有outbound correlation资源。

## 目标

- stop立即摘除并唤醒全部pending request waiters。
- 每个waiter获得确定的terminal JSON-RPC error。
- pending map在stop返回前为空。
- stop后request在ID分配和wire write之前失败。
- repeated stop保持幂等。
- stop与response/timeout/request admission通过pending lock序列化。
- shutdown request自身的response path保持可写，不在通用writer层禁止stop后内部response。

## Terminal Error Contract

每个被stop终止的pending waiter收到：

```json
{
  "jsonrpc": "2.0",
  "id": "原请求ID",
  "error": {
    "code": -32000,
    "message": "JSON-RPC connection stopped."
  }
}
```

waiter沿既有response parser转换为 `JsonRpcRequestError(-32000, ...)`，无需新增side channel或waiter类型。

## Lock Ordering

`stop()`先设置stop event并处理handler registry lock，随后获取pending lock，snapshot并清空pending map，再向各单槽waiter投递terminal response。`request()`在同一pending lock内先检查stop event，再执行capacity、ID allocation和pending insertion。因此：

- stop先获得生命周期所有权时，新request无法admission；
- request先admission时，stop会在返回前摘除并唤醒它；
- `_handle_response`与stop不能同时拥有同一个pending entry。

## Shutdown Response Boundary

不在 `_send_message`增加全局stopped gate。`shutdown` inbound handler会调用 `stop()`，但其JSON-RPC success response仍需在handler返回后写出；只禁止新的outbound `request()` admission即可同时满足graceful shutdown response和terminal pending cleanup。

## 验收标准

- worker thread进入60秒pending request。
- stop在1秒内唤醒worker。
- worker获得code -32000 stopped error而非timeout。
- pending map归零。
- post-stop request在分配ID前失败。
- next ID不因post-stop调用变化。
- handler registry disposal与shutdown integration保持通过。
- TS、Python全量和integration保持通过。

## 实现结果

- Python stop snapshot/clear全部pending并投递terminal error response。
- request pending lock临界区增加stopped admission gate。
- Tests通过真实thread验证即时wakeup、error mapping、cleanup和ID preservation。
- TS现有close pending rejection无需修改。
