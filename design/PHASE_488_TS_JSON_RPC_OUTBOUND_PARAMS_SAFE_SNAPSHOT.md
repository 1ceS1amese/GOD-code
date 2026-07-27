# Phase488 TS JSON-RPC Outbound Params Safe Snapshot

## 状态

代码、测试与文档已完成。

## 审计结论

TS request/notify原先只调用 `requireJsonRpcParams` 验证原始对象，随后writer再次验证并序列化同一引用。动态getter第1次失败返回params error，第2-3次变为Invalid outbound，第4次变为encoding -32603。getter还可在snapshot期间close peer，使params或timeout error遮蔽first terminal cause。

## 目标

- params validation和copy使用Phase486 single-pass snapshot。
- request/notify使用snapshot构造payload。
- 每个动态property只读取一次。
- invalid params不分配ID、timer或pending entry。
- writer不引用调用方原始对象。
- open peer上的snapshot failure保持params validation error。
- snapshot期间close优先返回terminal Error identity。
- snapshot成功后重查closed，再执行timeout/admission。

## Params Ownership

`requireJsonRpcParams` 从assertion helper改为返回plain `Record<string, unknown>`。它委托 `snapshotJsonObject` 同时验证和复制。request与notify用返回值填充wire envelope；原始params在函数调用后不再被JSON-RPC peer持有。

## Terminal Recheck

request/notify捕获snapshot validation error时先检查closed；若getter副作用已经close，则抛terminal register。snapshot成功后再次检查closed，覆盖getter close但返回合法值的情况。request timeout validation和pending admission因此不会遮蔽terminal cause。

## 验收标准

- request dynamic params只读取一次并正确往返。
- notification dynamic params只读取一次并正确dispatch。
- invalid getter返回params validation error。
- invalid request不推进nextId或pending size。
- getter close后无论是否抛错都返回同一terminal Error。
- Phase482 encoding tests继续直接覆盖writer boundary。
- focused、TS全量、Python全量和integration通过。

## 实现结果

- `requireJsonRpcParams` 返回single-pass snapshot。
- request/notify使用owned params。
- 两条public路径增加snapshot catch和post-snapshot closed recheck。
- 新测试覆盖request、notification、invalid admission和两种close side effect。
- writer encoding tests改为private send direct coverage，保持层级职责清晰。
