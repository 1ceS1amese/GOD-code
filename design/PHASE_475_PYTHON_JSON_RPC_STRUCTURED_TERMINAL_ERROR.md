# Phase475 Python JSON-RPC Structured Terminal Error

## 状态

代码、测试与文档已完成。

## 审计结论

Phase472-474让Python public APIs共享first terminal message，但terminal state只保存字符串并固定向pending/post-stop gates返回code -32000、无data。如果首因本身是 `JsonRpcRequestError`，其implementation-specific code和JSON-safe structured data被丢弃，调用方只能看到降级后的文本。JSON-RPC error contract应在terminal fan-out中保持完整。

## 目标

- terminal state保存canonical `JsonRpcRequestError`而非裸message。
- `JsonRpcRequestError`首因保留code、message和data。
- 非JSON-RPC exception继续映射为code -32000和其message。
- graceful stop继续映射为canonical -32000 stopped error。
- pending waiter response保留optional data字段。
- post-stop request/notify/handler registration保留结构化error。
- first-cause ownership和stop serialization保持。
- 空message继续回退generic stopped error。

## Canonical Terminal Error

connection field改为：

```python
_terminal_error: JsonRpcRequestError | None
```

first stop cause若为nonblank `JsonRpcRequestError`，创建一份canonical copy保存其code/message/data；其他Exception转为 `JsonRpcRequestError(-32000, message)`；无cause或blank message使用generic stopped error。

## Pending Wire Error

stop从canonical error构造JSON-RPC error object：

```text
code
message
data (only when not None)
```

每个pending waiter收到带自身ID的独立response envelope。既有`parse_json_rpc_error`会重建同code/message/data的JsonRpcRequestError。

## Post-Terminal Gates

request admission、public writer running gate、request handler registration和notification handler registration都从canonical field复制三项属性到新exception。每次调用拥有独立异常栈，但协议语义完全一致。

## Compatibility

reader/writer `OSError`仍映射为-32000；graceful stop tests仍看到canonical stopped message。只在明确以JsonRpcRequestError作为terminal cause时保留非默认code/data，不改变普通transport exception mapping。

## 验收标准

- stop接受code -32042、message和data的JsonRpcRequestError。
- pending waiter response完整包含三项属性。
- post-stop request返回相同code/message/data。
- post-stop notify返回相同结构。
- 两类handler registration返回相同结构。
- reader/writer message-only cause tests保持通过。
- repeated stop不能覆盖canonical error。
- TS、Python全量和integration保持通过。

## 实现结果

- Python terminal field从message升级为JsonRpcRequestError。
- stop规范化首因并构造optional-data wire error。
- 四类post-terminal public gates复制structured error。
- Existing reader tests更新terminal field assertion。
- 新测试覆盖pending和全部public gates的code/message/data一致性。
