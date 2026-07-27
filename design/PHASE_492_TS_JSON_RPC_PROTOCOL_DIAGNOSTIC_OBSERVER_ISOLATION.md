# Phase492 TS JSON-RPC Protocol Diagnostic Observer Isolation

## 状态

代码、测试与文档已完成。

## 审计结论

`emitProtocolError`虽然隔离了observer throw和rejected promise，但所有observers仍共享原始Error对象。首个observer可以修改 `message`、`stack` 或JsonRpcError nested `data`，后续observer会看到污染值。对于invalid response settlement，同一Error还已交给pending rejection；observer同步mutation会在promise consumer观察前改写控制流错误。

## 目标

- 每个protocol diagnostic observer获得独立Error对象。
- observer不接触transport或pending settlement持有的原始Error。
- generic Error保留name、message和stack。
- JsonRpcError保留code及JSON-safe data。
- structured data为每个observer深度隔离。
- 全部diagnostic snapshots在首个observer前生成。
- observer同步顺序保持。
- observer throw和async rejection containment保持。
- snapshot过程不能改变transport控制流。

## Diagnostic Snapshot Boundary

`emitProtocolError`先冻结raw listener列表，再读取一次稳定的name、message和stack。JsonRpcError额外生成canonical JSON-safe data snapshot。随后按listener数量预建Error数组：generic diagnostics创建普通Error，structured diagnostics创建JsonRpcError，并从canonical data为每个observer再次深复制。

## Control-Flow Ownership

原始Error继续由reader、writer、pending rejection或terminal transition持有，从不传给public observer。observer只修改自己的diagnostic副本，因此同步EventEmitter callback也无法在promise rejection microtask执行前改写调用方看到的message。所有副本在首个callback前完成，前序observer mutation不会影响后续副本构造。

## 验收标准

- observer1修改diagnostic message。
- observer2仍看到原始message。
- pending request rejection仍看到原始message。
- 两个observers收到不同Error identity。
- JsonRpcError nested data mutation不跨observer传播。
- structured data对象identity不同。
- 原有observer throw和async rejection tests保持。
- focused、TS全量、Python全量和integration通过。

## 实现结果

- `emitProtocolError`改为listener snapshot加per-observer diagnostic snapshot。
- 新增 `snapshotProtocolErrors`，捕获稳定Error metadata。
- structured diagnostic复用JSON tree snapshot并为每个observer独立复制data。
- focused tests覆盖pending control-flow保护、message mutation、Error identity和nested data隔离。
