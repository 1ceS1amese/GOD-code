# Phase490 TS JSON-RPC Notification Payload Consumer Isolation

## 状态

代码、测试与文档已完成。

## 审计结论

TS notification dispatcher虽然已snapshot method handler registry并隔离callback failure，但所有public notification observers和method handlers仍共享同一 `message.params` 对象。首个observer修改顶层或nested字段后，后续observer和handler会观察到修改值；handler mutation同样传递给之后的handler。fan-out isolation不应只覆盖异常，也应覆盖payload ownership。

## 目标

- public observers和method handlers各自获得独立params对象。
- nested object/array同样深度隔离。
- 所有consumer snapshots在首个callback前生成。
- observer顺序保持。
- method handler顺序保持。
- observers仍先于method handlers。
- async await和callback mutation不影响后续输入。
- failure isolation与registry snapshot保持。
- prototype-like key preservation复用Phase489语义。

## Pre-Dispatch Ownership

dispatcher先snapshot observers和method registrations，再从inbound params生成canonical plain object。随后按consumer总数预生成deep snapshots；只有全部snapshot成功后才开始callback。canonical对象从不暴露给consumer，因此任何callback mutation都只能作用于该consumer的副本。

## Ordering and Failure Semantics

consumerIndex把预生成snapshot按现有调用顺序分配：所有raw notification listeners在前，method registrations在后。每个callback仍独立try/catch并await；失败继续产生原有observer/handler diagnostic，不阻断后续consumer，也不改变其params。

## 验收标准

- observer1修改top-level和nested字段。
- observer2仍看到原始值。
- handler1仍看到原始值并可修改。
- handler2仍看到原始值。
- 四个top-level对象identity不同。
- 四个nested对象identity不同。
- 原有顺序、failure和registry snapshot tests保持。
- focused、TS全量、Python全量和integration通过。

## 实现结果

- dispatchNotification预取observer与handler registries。
- 新增canonical params snapshot和per-consumer预复制。
- callback改用对应owned params。
- focused test覆盖四consumer的top-level/nested mutation与identity隔离。
