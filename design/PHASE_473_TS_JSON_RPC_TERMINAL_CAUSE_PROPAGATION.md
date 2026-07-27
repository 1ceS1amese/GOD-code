# Phase473 TS JSON-RPC Terminal Cause Propagation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase472让Python保存first terminal cause，TS仍只保存`closed`布尔值。close时pending request和active write可能收到具体stream/manual error，但queued write及后续request、notify、handler registration、EventEmitter registration全部重新创建generic `JSON-RPC peer is closed.`。同一terminal transition对不同调用方暴露不一致reason，重复close也没有显式cause ownership field。

## 目标

- first close transition保存唯一terminal Error。
- provided close error按对象identity保留。
- graceful close创建统一generic terminal Error。
- pending requests共享terminal cause。
- active与queued writes共享terminal cause。
- post-close request/notify共享terminal cause。
- post-close handler/observer registration共享terminal cause。
- repeated close不能覆盖首因。
- close observers继续接收原optional error参数，保持既有graceful observer API。

## Terminal Error Register

peer新增：

```ts
terminalError: Error | null
```

first `close(error?)`在设置closed前写入provided error或新建generic `JSON-RPC peer is closed.`。closed幂等gate确保后续close不会修改field。统一 `getTerminalError()`供所有closed gates读取。

## Correlation and Writer Propagation

close不再为每个pending ID创建不同错误，而是reject同一terminal Error对象。active write abort使用该对象；writeTail中queued frames展开后也从closed gate抛出同一对象。因此当前与后续transport consumers可按identity关联同一terminal transition。

## Public API Consistency

以下closed paths统一throw/reject terminalError：

- request
- notify
- private send及queued writer gate
- setRequestHandler
- onNotification
- EventEmitter五种registration methods

stream close、write callback failure或manual close的具体message因此在所有后续public calls中保持。

## Observer Compatibility

`emitClose`仍接收调用 `close()`时的原optional error。graceful close observers继续看到undefined，而closed public APIs使用内部generic Error；这样不改变observer API中“是否有外部cause”的既有含义。

## 验收标准

- pending request在manual close后reject first Error对象。
- repeated close携带later Error不覆盖首因。
- post-close request/notify reject相同对象。
- handler和EventEmitter registration throw相同对象。
- queued write在manual close后获得manual cause而非generic。
- idle output close后的notify保留output close cause。
- callback failure后的notify保留callback cause。
- TS、Python全量和integration保持通过。

## 实现结果

- TS新增terminalError和统一getter。
- close建立first-cause register并用于pending/active writer。
- 全部closed gates改为复用terminal cause。
- Tests覆盖对象identity、repeat-close稳定性及stream/write具体cause。
- Python Phase472已有对称first-cause语义。
