# Phase493 TS JSON-RPC Close Observer Error Isolation

## 状态

代码、测试与文档已完成。

## 审计结论

`close()`已维持first terminal Error identity，并在清理pending requests后隔离close observer throw/rejection。但 `emitClose(error)` 会把调用方提供的原始Error传给全部close observers。同步observer可以修改message或JsonRpcError nested data，污染后续observer、pending rejection以及所有post-close API复用的terminal cause。

## 目标

- 每个close observer获得独立Error对象。
- observer不接触connection保存的原始terminal Error。
- pending rejection继续获得原始first terminal Error identity。
- post-close API继续复用原始first terminal Error identity。
- generic Error保留name、message和stack。
- JsonRpcError保留code并深复制JSON-safe data。
- 全部observer snapshots在首个callback前生成。
- 未显式传入close cause时仍向observer传递undefined。
- observer顺序、throw containment与async rejection containment保持。

## Close Ownership Boundary

`close()`仍先把显式cause或默认Error保存为 `terminalError`，并用该原始对象终止active writes与pending requests。`emitClose()`单独冻结raw close listeners；若调用提供显式cause，则复用Phase492 snapshot helper为完整listener list预生成Error副本，否则构造等长undefined列表。

## First-Cause Preservation

close observer只拥有副本，无法修改 `terminalError`。因此pending promise仍以原始对象reject，后续request、notify、handler registration和observer registration gates也继续抛出同一first cause identity。第二次close仍保持幂等，不生成新事件或替换cause。

## 验收标准

- close observer1修改message和nested data。
- close observer2仍看到原始message和data。
- 两个observer获得不同Error和data identity。
- 原始terminal Error保持未修改。
- pending rejection保持原始Error identity。
- post-close request保持原始Error identity。
- 原有close observer failure、cleanup和idempotency tests保持。
- focused、TS全量、Python全量和integration通过。

## 实现结果

- `emitClose`冻结listener列表并预生成per-observer Error snapshots。
- 显式cause复用 `snapshotProtocolErrors` structured clone语义。
- 无cause close保持undefined observer payload兼容性。
- focused test覆盖message/data mutation、identity隔离、pending settlement与post-close gate。
