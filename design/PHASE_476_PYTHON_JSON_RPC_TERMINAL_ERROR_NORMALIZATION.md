# Phase476 Python JSON-RPC Terminal Error Normalization

## 状态

代码、测试与文档已完成。

## 审计结论

Phase475保留了结构化terminal error，但 `JsonRpcRequestError` 构造器本身不验证code/data。调用方可传入超出JSON safe integer范围的code、循环或非JSON-safe data，导致pending waiter收到无效wire error并在解析时降级为另一错误。合法可变data也由source、terminal register、pending response和post-stop exceptions共享，任一消费者都能修改后续首因。

## 目标

- terminal commit前规范化code、message和data。
- 非safe-integer code回退为-32000。
- 非JSON-safe data从canonical error中移除。
- blank或无法字符串化的message回退generic stopped message。
- 合法data与调用方source隔离。
- 每个pending response和post-stop exception获得独立data快照。
- first-cause、stop serialization及普通transport映射保持不变。

## Normalization Boundary

`normalize_json_rpc_terminal_error` 是stop lifecycle唯一的terminal cause提交入口。普通Exception仍映射为-32000；结构化error仅保留可在线协议中表示的字段。规范化后的canonical error始终可由既有 `is_json_rpc_error_object` / `parse_json_rpc_error` 接受。

## Snapshot Isolation

递归JSON-safe data由深复制建立所有权边界：

1. source error到canonical terminal register；
2. canonical register到每个pending response；
3. canonical register到每次post-stop public exception。

因此source mutation、某个waiter mutation或某次API调用捕获后修改error.data，都不会污染其他消费者或后续调用。

## 验收标准

- 合法code/message/data仍完整传播。
- source data在stop后修改不影响pending和post-stop error。
- pending response data修改不影响canonical state。
- 一次post-stop exception data修改不影响下一次调用。
- 超范围code回退-32000。
- 循环data被省略且pending response仍是合法JSON-RPC error。
- focused、Python全量、TS全量和integration保持通过。

## 实现结果

- 新增terminal normalization helper和JSON value clone boundary。
- stop只提交规范化后的canonical error。
- pending fan-out按request建立独立error data snapshot。
- 四类post-stop public gates返回独立data snapshot。
- 新增mutation isolation与invalid field normalization tests。
