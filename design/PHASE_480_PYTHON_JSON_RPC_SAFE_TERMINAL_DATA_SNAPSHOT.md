# Phase480 Python JSON-RPC Safe Terminal Data Snapshot

## 状态

代码、测试与文档已完成。

## 审计结论

Phase476使用 `deepcopy` 隔离terminal structured data。`is_json_value` 接受list/dict子类，因此调用方可提供实现恶意或失败 `__deepcopy__` 的容器；first `stop()` 会在设置event、清理handlers和唤醒pending前抛错，使connection没有进入terminal state。诊断附加data不能拥有破坏核心lifecycle的执行权。

## 目标

- terminal snapshot不执行自定义 `__deepcopy__`。
- 递归输出plain JSON scalar/list/dict。
- 合法容器子类仍可保留其JSON内容。
- validation或snapshot异常时仅移除optional data。
- code/message和完整stop cleanup必须继续提交。
- pending envelope之间继续保持独立快照。
- post-stop public exception继续与canonical state隔离。

## Safe Tree Copy

`clone_json_value` 按JSON类型显式分派。exact scalar直接复用；scalar子类通过对应内建类型实现规范化；list使用 `list.__iter__`，dict使用 `dict.items`，递归结果只包含plain JSON values。该路径不调用通用对象复制协议。

## Failure Degradation

terminal normalization将data validation和snapshot包在隔离边界内。任何异常都把data降级为None，而不是让stop失败。code/message仍进入canonical `JsonRpcRequestError`，随后stop event、writer serialization、registry cleanup、pending wakeup和diagnostic release正常执行。

## 验收标准

- 自定义dict的失败 `__deepcopy__` 不被调用。
- stop成功设置terminal state并唤醒pending。
- canonical和post-stop data均为plain dict。
- 自定义items导致validation失败时data被省略。
- data失败不改变structured code/message。
- focused、Python全量、TS全量和integration通过。

## 实现结果

- 移除JSON-RPC terminal路径中的 `deepcopy`。
- 新增仅使用内建实现的JSON tree clone。
- normalization捕获data inspection/snapshot异常并降级。
- 新测试覆盖hostile deepcopy和hostile inspection两类输入。
