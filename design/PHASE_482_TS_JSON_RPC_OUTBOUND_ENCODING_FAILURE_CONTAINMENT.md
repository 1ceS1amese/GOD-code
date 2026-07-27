# Phase482 TS JSON-RPC Outbound Encoding Failure Containment

## 状态

代码、测试与文档已完成。

## 审计结论

TS outbound payload在send中先通过JSON-safe validation，再调用 `JSON.stringify`。包含动态getter的plain object可以在validation读取时返回合法值、在serialization再次读取时抛错，使原始JavaScript exception越过JSON-RPC boundary。getter还可以在抛错前调用close，此时本地encoding error不能遮蔽first terminal cause。

## 目标

- JSON.stringify exception映射为JsonRpcError -32603。
- 对外message固定为 `JSON-RPC output encoding failed.`。
- 只暴露sanitized原始error message作为data cause。
- pre-write encoding failure不关闭peer。
- 不增加queued frame/byte accounting。
- 后续合法notification仍可发送。
- encoding期间close时返回同一terminal Error对象。
- terminalized frame不得进入Writable。

## Serialization Boundary

send在完整outbound validation后以try/catch执行JSON.stringify。失败且peer仍open时构造structured JsonRpcError；失败但peer已closed时直接读取terminal register。size validation、queue capacity和write chain只处理成功生成的JSON string。

## Recovery Semantics

serialization failure发生在queue accounting前，因此不调用close、不修改writeTail，也无需归还capacity。调用方修正payload后可以复用peer。structured -32603还可被双向request handler的既有error normalization保留。

## 验收标准

- getter在serialization阶段抛错时notify返回code -32603。
- message和sanitized cause data稳定。
- peer保持open且queue counters为零。
- output没有失败frame。
- 同一peer后续合法notification成功写入。
- getter先close再抛错时reject first terminal Error identity。
- focused、TS全量、Python全量和integration通过。

## 实现结果

- send增加JSON.stringify exception boundary。
- encoding failure映射为structured JsonRpcError。
- closed catch path复用terminalError identity。
- 新增可恢复encoding failure与concurrent close precedence测试。
