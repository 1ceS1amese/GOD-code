# Phase479 Python JSON-RPC Outbound Encoding Failure Containment

## 状态

代码、测试与文档已完成。

## 审计结论

`is_json_value` 接受任意Python string，但 `json.dumps(..., ensure_ascii=False)` 生成的字符串仍可能包含孤立UTF-16 surrogate。随后UTF-8 byte measurement会抛出原始 `UnicodeEncodeError`。该错误发生在transport write前，既不应泄漏语言实现细节，也不应terminalize仍可用的connection；同时编码期间发生的stop仍需保持terminal precedence。

## 目标

- JSON serialization和UTF-8 measurement进入统一exception boundary。
- pre-write encoding failure映射为JSON-RPC -32603。
- 对外错误消息固定为 `JSON-RPC output encoding failed.`。
- 保留原始exception作为Python exception cause以供调试。
- 未写入任何frame时connection保持running。
- 后续合法notification仍可发送。
- encoding期间并发stop优先返回canonical terminal cause。
- handler response继续复用既有JsonRpcRequestError fallback路径。

## Encoding Boundary

`json.dumps` 与 `encoded.encode("utf-8")` 在同一try block中完成。任何pre-write exception都在检查running-required terminal state后映射为-32603。该边界只处理frame materialization，不把调用方payload错误误判为transport failure。

## Recovery Semantics

编码失败前没有字节进入TextIO，因此不调用stop、不清理handlers/pending，也不改变request ID allocator。调用方可修正payload后继续使用connection。若stop在编码过程中提交，terminal gate替代-32603并保持first-cause一致性。

## 验收标准

- 包含孤立surrogate的notification返回-32603 encoding error。
- 原始cause为UnicodeEncodeError。
- output保持为空且connection未停止。
- 同一connection随后可发送合法notification。
- mocked encoder在触发stop后抛错时返回canonical terminal code/message/data。
- terminalized frame不写入output。
- Python、TS和integration全量通过。

## 实现结果

- outbound serialization和UTF-8 size calculation合并到exception boundary。
- encoding exception转换为稳定JsonRpcRequestError并保留cause chain。
- concurrent stop在转换前复用统一terminal gate。
- focused tests覆盖surrogate recovery和stop-during-encoding precedence。
