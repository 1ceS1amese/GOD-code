# Phase465 Python JSON-RPC Reader Exit Terminalization

## 状态

代码、测试与文档已完成。

## 审计结论

Phase463-464让Python `stop()`拥有handler registries和pending requests，但 `serve_forever()`在stdin EOF时直接break/return，reader或dispatch抛异常时也直接展开栈。两条路径都未调用stop，因此dead input transport仍保留registries，跨线程outbound request继续等待timeout，且connection仍接受新request/registration。TS readable end/close/error已统一进入close。

## 目标

- `serve_forever`所有退出路径都必须进入terminal stop。
- EOF正常返回前清理registries并唤醒pending waiters。
- explicit stop导致loop退出时重复stop保持幂等。
- reader/dispatch异常在完成terminal cleanup后继续向调用方传播。
- pending thread获得Phase464 stopped error而非timeout。
- 既有oversized-line recovery与正常request dispatch保持不变。

## Reader Lifecycle

loop被统一包裹为：

```text
try:
  while not stopped:
    bounded read
    EOF -> break
    dispatch
finally:
  stop()
```

`finally`不吞异常，所以runtime或测试仍能看到原reader/dispatch failure；但在异常跨出 `serve_forever`前，handler registry disposal和pending wakeup已经完成。

## EOF Semantics

stdin EOF代表对端已无法继续发送response，因此与显式stop具有相同terminal resource ownership。EOF本身保持正常返回，不额外抛出错误；等待中的outbound requests通过Phase464统一获得 `-32000 JSON-RPC connection stopped.`。

## 验收标准

- 空输入EOF使stop event置位。
- EOF清空request/notification registries。
- EOF唤醒60秒pending request线程并清空pending map。
- waiter获得stopped error。
- dispatch异常仍向调用方抛出原异常。
- dispatch异常前完成registry disposal。
- oversized input recovery测试保持通过。
- TS、Python全量和integration保持通过。

## 实现结果

- Python `serve_forever`增加try/finally terminal stop。
- EOF、explicit stop和异常exit统一复用幂等 `stop()`。
- Tests覆盖EOF pending wakeup、registry disposal和exception propagation。
- TS reader lifecycle无需修改。
