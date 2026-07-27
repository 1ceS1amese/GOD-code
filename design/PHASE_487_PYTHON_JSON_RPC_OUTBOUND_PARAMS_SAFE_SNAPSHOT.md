# Phase487 Python JSON-RPC Outbound Params Safe Snapshot

## 状态

代码、测试与文档已完成。

## 审计结论

`require_json_rpc_params` 原先返回浅dict副本，但request和notify忽略该返回值并继续发送原始params。dict子类可在第1-3次items读取时泄漏RuntimeError，第4次失败变为encoding -32603；嵌套容器即使使用浅副本也仍由调用方持有。public admission应建立完整payload ownership。

## 目标

- params validation与deep snapshot在同一边界完成。
- request和notify实际使用snapshot返回值。
- 输出只包含plain JSON tree。
- dynamic params只执行一次不可信inspection。
- inspection或snapshot异常统一映射-32602。
- invalid params不分配request ID或pending entry。
- writer不读取调用方原始容器。
- terminal precedence保持。
- connection可继续使用。

## Params Snapshot Boundary

`require_json_rpc_params` 先验证JSON-safe object，再调用内建 `clone_json_value` 递归复制。整个过程位于exception boundary；任何动态items、cycle、非JSON value或clone失败都转换为统一-32602。成功返回exact dict snapshot。

## Admission Integration

request在timeout validation和pending admission前替换本地params引用；notify同样在调用writer前替换。request ID、waiter、wire envelope和UTF-8 encoder只接触snapshot。connection已停止时入口terminal gate仍在params处理前执行。

## 验收标准

- request dynamic params只读取一次并发送plain dict。
- notify dynamic params只读取一次并成功编码。
- 原始容器第二次items会失败但不再被读取。
- request/notify inspection失败均返回-32602。
- invalid request不进入send/pending mutation。
- connection保持open。
- focused、Python全量、TS全量和integration通过。

## 实现结果

- `require_json_rpc_params` 升级为deep snapshot validator。
- request和notify接收并使用返回snapshot。
- validation异常统一包装为JsonRpcRequestError -32602。
- focused test覆盖request capture、notification wire、invalid inspection和recovery。
