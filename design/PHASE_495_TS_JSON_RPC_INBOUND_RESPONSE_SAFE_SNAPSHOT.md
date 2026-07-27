# Phase495 TS JSON-RPC Inbound Response Safe Snapshot

## 状态

代码、测试与文档已完成。

## 审计结论

TS `handleResponse`原先先验证success result或error object，随后直接把原始result传给pending resolve，或把原始error.data保存到JsonRpcError。source nested mutation会在promise consumer执行前改变调用方看到的数据。动态getter还会在validation和后续字段读取之间重复执行，导致同一payload因读取时机产生漂移或异常。

## 目标

- success result在pending resolve前建立caller-owned deep plain snapshot。
- error object先整体snapshot，再验证code/message/data。
- JsonRpcError data与source完全隔离。
- dynamic getter只在single snapshot boundary读取一次。
- getter、cycle或invalid value失败稳定映射现有-32603 contract。
- snapshot异常不逃逸reader response control flow。
- pending timer、map cleanup和settled history语义保持。
- invalid response protocol diagnostics保持。

## Settlement Snapshot Boundary

`handleResponse`仍先按response ID完成pending lookup、timer清理和settled-history记录。success path调用 `snapshotJsonObject(message.result)`，只有成功才resolve owned result。error path先snapshot完整error object，再在plain snapshot上执行 `isJsonRpcErrorObject`，并以snapshot code/message/data构造JsonRpcError。

## Dynamic Payload Containment

snapshot helper通过一次property enumeration materialize getter-backed payload；后续validation和settlement只读取plain data properties。getter第二次读取会失败的合法payload仍可稳定结算，首次inspection失败则返回null并进入固定invalid response error，不会从 `handleResponse` 同步抛出或遗留pending entry。

## 验收标准

- source result nested mutation不改变resolved value。
- resolved result与source top-level/nested identity不同。
- source error data mutation不改变JsonRpcError data。
- JsonRpcError data与source identity不同。
- dynamic success getter只读取一次。
- dynamic error data getter只读取一次。
- snapshot getter失败返回固定invalid success response错误。
- pending map完成清理。
- focused、TS全量、Python全量和integration通过。

## 实现结果

- success settlement改用 `snapshotJsonObject` owned result。
- error settlement改为full error snapshot后validation。
- JsonRpcError使用snapshot-owned data。
- focused tests覆盖source mutation、identity isolation、single getter inspection、snapshot failure和pending cleanup。
