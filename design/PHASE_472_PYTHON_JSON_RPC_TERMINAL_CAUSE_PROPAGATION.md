# Phase472 Python JSON-RPC Terminal Cause Propagation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase464-471统一了Python stop、reader exit和writer failure terminalization，但pending waiters始终只收到固定 `JSON-RPC connection stopped.`。reader `OSError("reader failed")`或writer `OSError("writer failed")`的真实transport cause只对当前栈可见，其他并发request与后续public outbound失去根因。并发stop调用还缺少first-cause ownership，后续generic stop可能覆盖或先于故障cleanup。

## 目标

- terminal stop可接收optional exception cause。
- 第一个terminal transition永久拥有cause。
- reader/dispatch exception作为terminal cause传播。
- writer write/flush exception作为terminal cause传播。
- 全部pending waiters获得相同cause message和code -32000。
- post-terminal request/notify返回同一cause。
- explicit graceful stop保持既有generic stopped message。
- repeated/concurrent stop不覆盖首因或重复cleanup。
- 原始reader/writer exception仍向直接调用方传播。

## First-Cause Ownership

connection新增：

```python
_stop_lock
_terminal_error_message
```

`stop(error=None)`在stop lock内检查terminal message。第一位调用者将nonblank `str(error)`或generic stopped message写入field并完成完整cleanup；后续调用获取lock后直接返回。stop lock覆盖event、write barrier、registries、pending和diagnostic disposal，使其他stop调用只能观察已完成terminal state。

## Reader Propagation

`serve_forever`记录except exception到局部failure，继续re-raise，并在finally调用 `stop(failure)`。因此直接reader调用方看到原OSError；pending waiters在异常离开reader loop前已收到相同message的JSON-RPC error。

## Writer Propagation

Phase471 captured write_error现在调用 `stop(write_error)`。当前notify/request仍重抛原writer exception；其他pending和后续public outbound读取 `_terminal_error_message`，得到同一根因而非generic stop。

## Graceful Stop

没有error的shutdown/explicit stop仍保存 `JSON-RPC connection stopped.`。post-stop public APIs继续返回该消息。空白exception message也回退到generic，避免产生非法空JSON-RPC error message。

## 验收标准

- reader failure直接调用方获得原OSError。
- pending request获得code -32000和`reader failed`。
- writer write/flush失败的pending waiter获得`writer failed`。
- writer failure后的notify返回`writer failed`且不触碰writer。
- terminal message field保存首因。
- later stop携带不同error不能覆盖首因。
- explicit stop现有generic tests保持通过。
- TS、Python全量和integration保持通过。

## 实现结果

- Python stop支持optional cause并由stop lock序列化首因与cleanup。
- serve_forever exception传入terminal stop后继续传播。
- writer failure传入terminal stop。
- request/write running gates返回已保存terminal cause。
- Tests覆盖reader cause、writer cause、pending propagation和first-cause stability。
- TS close原本已向pending传播close error，无需修改。
