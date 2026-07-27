# Phase460 JSON-RPC Notification Registry Snapshot

## 状态

代码、测试与文档已完成。

## 审计结论

TS `onNotification`会原地push已有handler数组，`dispatchNotification`又直接遍历同一数组。handler在处理notification期间注册新handler时，JavaScript iterator会看到追加项并在当前dispatch中立即调用；自注册可让同一notification consumer chain持续增长，绕过Phase457以notification条数为单位的admission。Python已通过 `tuple(...)`在dispatch前固定快照。

## 目标

- 每条notification只调用dispatch开始时已注册的method handlers。
- dispatch期间新增handler从下一条notification开始生效。
- registration不得原地修改正在被其他dispatch读取的数组。
- handler顺序保持registration order。
- observer/handler failure isolation和active notification accounting保持不变。

## Registry Contract

TS registration改为copy-on-write：

```text
current handlers
-> create [...current, newHandler]
-> replace map entry
```

dispatch同时显式复制当前map value，形成该notification独占的consumer snapshot。即使未来registry写入策略变化，dispatch mutation isolation仍有本地保障。

## Dispatch Semantics

公共EventEmitter `notification` observers继续使用 `rawListeners()`返回的快照。method-specific handlers现在与其一致：consumer membership在dispatch开始时冻结，但每个handler仍按顺序await；单个handler的sync throw或async rejection继续只产生diagnostic并允许后续snapshot consumer执行。

## 验收标准

- 第一个handler在执行中注册late handler。
- late handler不处理当前notification。
- late handler从下一条notification开始执行。
- 原handler仍先于late handler执行。
- active notification counter在两次dispatch后归零。
- TS、Python全量和integration保持通过。

## 实现结果

- TS `onNotification`改为immutable array replacement。
- `dispatchNotification`显式创建handler snapshot。
- Tests覆盖mid-dispatch registration visibility和ordering。
- Python现有tuple snapshot无需修改。
