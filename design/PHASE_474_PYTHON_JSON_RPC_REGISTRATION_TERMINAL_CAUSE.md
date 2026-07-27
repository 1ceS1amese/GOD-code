# Phase474 Python JSON-RPC Registration Terminal Cause

## 状态

代码、测试与文档已完成。

## 审计结论

Phase472让Python pending、request、notify共享first terminal cause，但request/notification handler registration gates仍固定抛 `RuntimeError("JSON-RPC connection is stopped.")`。reader/writer故障后，业务注册API既丢失真实cause，又使用与其他JSON-RPC public APIs不同的exception type/message。TS Phase473已经统一所有handler/observer registration gates。

## 目标

- post-stop request handler registration返回first terminal cause。
- post-stop notification handler registration返回first terminal cause。
- 两类registration使用 `JsonRpcRequestError` code -32000。
- reader failure后的registration保留reader cause。
- writer failure后的first-cause机制自动适用。
- graceful stop后的registration保持generic stopped reason。
- stopped check与registry mutation继续在handler lock内原子执行。
- 已返回cleanup handles在stop后仍幂等。

## Error Contract

两种register API的stopped gate统一抛：

```python
JsonRpcRequestError(
    -32000,
    terminal_error_message or "JSON-RPC connection stopped."
)
```

这与request/notify running gates使用相同field和code。registration属于connection public control API，其terminal failure现在可由统一JsonRpcRequestError handling捕获。

## Lock Boundary

terminal cause读取仍发生在 `_handler_lock`内，与stop-time registry clear共享临界区。Phase472 stop lock覆盖完整cleanup，故handler lock中的reader要么看到running registry，要么看到已保存cause和stopped event，不存在generic/empty中间状态。

## Compatibility

只改变post-stop registration exception类型与message来源。open connection的method validation、registration ownership、replacement、unsubscribe/unregister和dispatch snapshot语义均不变。graceful stop message采用Phase472 canonical `JSON-RPC connection stopped.`。

## 验收标准

- graceful stop后两类registration抛JsonRpcRequestError。
- error code均为-32000。
- graceful message为canonical stopped cause。
- reader failure后两类registration message均为`reader failed`。
- later stop不能改变registration观察到的首因。
- cleanup handles在stop后仍安全。
- TS、Python全量和integration保持通过。

## 实现结果

- Python两类handler registration stopped gates改用terminal cause field。
- exception type统一为JsonRpcRequestError(-32000)。
- Existing disposal test更新canonical generic assertion。
- Reader first-cause test扩展两类registration和error code断言。
- TS Phase473已有对称registration cause语义。
