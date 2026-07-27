# Phase459 JSON-RPC Queued Request Cancellation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase447 timeout会删除pending correlation，Phase453 writer则允许frame在backpressure后排队。两者组合后，request可能在尚未进入 `Writable.write` 前超时，但其frame仍留在 `writeTail`，待前序frame完成后继续发送。调用方已经收到timeout，远端却会执行过期请求并返回late response，造成无意义副作用和协议噪声。

## 目标

- request frame在真正进入Writable前重新确认pending仍有效。
- timeout或提前settlement已删除pending时取消尚未写入的frame。
- cancellation不关闭健康peer。
- canceled frame仍按正常settlement归还outbound frame/byte容量。
- writer chain在cancellation后继续处理后续frame。
- 已经进入Writable的request保持既有不可撤回语义。

## Write Gate

`send`增加可选 `shouldWrite` callback。request admission后传入当前ID是否仍存在于pending map的检查：

```text
queued write turn begins
-> peer closed gate
-> pending membership gate
-> Writable.write
```

timeout callback先删除pending并记录timed_out；当queued write turn最终到达时，membership gate失败并抛出内部 `JsonRpcSendCanceledError`。该错误只表示本地frame不再需要，不是transport failure。

## Cancellation Isolation

内部cancellation仍会settle该send Promise并触发统一capacity release，但terminal write failure observer会识别并忽略它，不调用 `close()`。`writeTail`沿既有catch recovery继续为后续frame提供串行顺序。

如果frame已调用 `Writable.write`，timeout无法撤回已交给transport的字节；此时仍可能产生late response，并继续由Phase449 lifecycle diagnostics分类。

## 验收标准

- 前序frame阻塞Writable时，后续request可在queue中超时。
- timeout后pending map为空。
- backpressure解除后只写前序frame，不写过期request。
- canceled request释放queued frame/byte accounting。
- cancellation不关闭peer。
- writer chain保持可继续使用。
- TS、Python全量和integration保持通过。

## 实现结果

- TS新增内部 `JsonRpcSendCanceledError`。
- `send`支持可选pre-write gate。
- request以pending membership作为gate。
- terminal close catch隔离本地cancellation。
- Tests覆盖timeout-before-write、no-wire-side-effect、capacity release和peer health。
