# Phase466 Python JSON-RPC Post-Stop Outbound Gate

## 状态

代码、测试与文档已完成。

## 审计结论

Phase464禁止stop后新request admission，但public `notify()`仍直接调用writer；此外request可在pending admission后、真正写frame前与stop竞态，stop已唤醒并清空pending后request仍可能写出过期frame。不能简单禁止全部post-stop writes，因为inbound `shutdown` handler先调用stop，随后router仍必须发送最终success response。

## 目标

- public outbound request/notification在stop后不得写frame。
- request admission后若stop先于wire write取得生命周期所有权，也不得写frame。
- stop返回时，所有已开始的public write已完成，后续不会再出现public frame。
- stopped gate与write动作在同一write lock临界区内。
- internal request responses在stop后仍可写，以保留shutdown acknowledgement。
- post-stop rejection使用现有 `JsonRpcRequestError(-32000)`。

## Writer Contract

`_send_message`增加内部keyword：

```python
require_running: bool = False
```

public `request()`和`notify()`传入true；response helpers保持默认false。writer完成validation/encoding后获取write lock，并在真正write之前检查stop event。由此check与write不可被stop穿插。

## Stop Barrier

`stop()`设置stop event后获取并释放write lock作为barrier：

- 已持有write lock的public frame会先完成，然后stop继续；
- 尚未进入write lock的public frame在之后取得锁时看到stopped并失败；
- stop返回后不会再有public write完成。

该barrier在handler/pending registry locks之前释放，不形成跨registry lock nesting。

## Response Exception

内部responses不要求running，因为shutdown request执行顺序为：

```text
handle_shutdown -> stop -> return result -> router writes success response
```

只对public outbound initiation设gate，可以阻止dead connection上的新工作，同时保留协议级graceful shutdown ack及其他已捕获inbound request的terminal response尝试。

## 验收标准

- stop后notify返回code -32000且outfile为空。
- stop后request返回code -32000且outfile为空。
- response writer在stop后仍可写合法success frame。
- stopped request不分配ID或pending entry。
- write gate位于write lock内部。
- stop包含write-lock barrier。
- shutdown/integration保持通过。
- TS、Python全量和integration保持通过。

## 实现结果

- Python `_send_message`支持running-required writer mode。
- request/notify接入running gate。
- stop增加write-lock completion barrier。
- response helpers保持ungated内部writer语义。
- Tests覆盖post-stop no-write和response preservation。
