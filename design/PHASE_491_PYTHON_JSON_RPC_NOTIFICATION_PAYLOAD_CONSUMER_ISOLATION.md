# Phase491 Python JSON-RPC Notification Payload Consumer Isolation

## 状态

代码、测试与文档已完成。

## 审计结论

Python notification dispatcher虽然已经snapshot method handler registrations并隔离单个callback failure，但同一notification的所有handlers仍共享一个 `params` dict。首个handler修改顶层或nested字段后，后续handler会观察到修改值。registration ownership与failure isolation不能替代payload ownership。

## 目标

- 每个method handler获得独立params对象。
- nested object/array同样深度隔离。
- 所有consumer snapshots在首个handler前生成。
- handler注册顺序保持。
- handler failure isolation保持。
- unsubscribe不改变当前dispatch registration snapshot。
- snapshot失败不产生部分handler side effect。
- 输出只包含plain built-in JSON tree。

## Pre-Dispatch Ownership

dispatcher先在handler lock内冻结method registrations，然后从inbound params生成canonical plain object。随后按registration数量预生成完整consumer snapshot tuple；只有canonical和全部consumer snapshots均成功后才开始调用handler。canonical对象不暴露给handler，因此每次mutation只作用于对应handler拥有的副本。

## Failure and Ordering Semantics

`zip(registrations, consumer_params)`保持原注册顺序。每个handler仍独立执行并捕获异常，失败产生原有 `JSON-RPC notification handler failed` diagnostic后继续后续handler。任一snapshot失败则在首个handler前产生 `Invalid JSON-RPC notification params.` diagnostic并放弃整个notification，避免部分分发。

## 验收标准

- handler1修改top-level和nested字段。
- handler2仍看到原始值。
- 两个top-level对象identity不同。
- 两个nested对象identity不同。
- consumer snapshot生成失败时没有handler执行。
- 原有handler顺序、failure和registration snapshot tests保持。
- focused、Python全量、TS全量和integration通过。

## 实现结果

- 抽取通用 `snapshot_json_rpc_object` plain tree snapshot helper。
- handler result snapshot复用通用helper。
- notification dispatch新增canonical params与per-handler预复制。
- snapshot失败在任何handler callback前统一诊断并终止dispatch。
- focused tests覆盖顶层/nested mutation、identity隔离和pre-dispatch snapshot failure。
