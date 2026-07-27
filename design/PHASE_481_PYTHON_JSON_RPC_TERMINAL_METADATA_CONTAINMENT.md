# Phase481 Python JSON-RPC Terminal Metadata Containment

## 状态

代码、测试与文档已完成。

## 审计结论

Phase480隔离了structured data的复制行为，但normalization仍直接读取 `error.code` 和 `error.data`。`JsonRpcRequestError` 子类可以通过descriptor或 `__getattribute__` 让这些访问抛错，导致first stop在设置terminal state前失败。int子类还可覆盖 `__abs__`，介入code range validation。异常对象本身不能拥有破坏connection lifecycle的能力。

## 目标

- code属性访问失败时回退-32000。
- code类型或范围规范化失败时回退-32000。
- int子类归一为plain int后再检查范围。
- 不执行int子类的自定义abs钩子。
- data属性访问失败时省略data。
- message和stop cleanup继续提交。
- pending waiter仍收到合法terminal response。
- canonical state不保留异常子类元数据对象。

## Metadata Extraction

code和data使用独立try boundary。code候选必须是非bool int；非exact int通过 `int.__int__` 转换为plain int，再使用内建整数范围判断。任何getter、conversion或range异常都只使code降级为-32000。data getter与既有JSON validation/snapshot放在同一隔离边界，失败时降级为None。

## Lifecycle Guarantee

metadata extraction完成后才构造base `JsonRpcRequestError` canonical copy。后续stop event、write serialization、handler registry disposal、pending wakeup和diagnostic release只读取可信base对象，不再接触原始异常子类。

## 验收标准

- code/data getter均抛错的异常仍能完成stop。
- pending response保留message，code为-32000且无data。
- canonical terminal error为可安全读取的base metadata。
- hostile int的自定义abs不执行。
- hostile int code仍规范化并保留数值。
- focused、Python全量、TS全量和integration通过。

## 实现结果

- code extraction和normalization进入failure-isolated boundary。
- data getter并入既有validation/snapshot boundary。
- int子类通过内建实现转换为plain int。
- 新测试覆盖失败getter和hostile integer subclass。
