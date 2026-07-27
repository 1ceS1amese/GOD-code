# Phase484 Python JSON-RPC Handler Error Safe Snapshot

## 状态

代码、测试与文档已完成。

## 审计结论

Python handler catch path在调用builder前直接读取 `exc.code` 和 `exc.data`，builder又把原始data引用放入candidate并多次验证。dict子类可在任意items读取阶段抛错，使 `_handle_request` 逃逸异常；在serve loop中这会terminalize connection，直接dispatch也无法产生response。handler exception metadata必须在单一边界可信化。

## 目标

- call site不直接读取JsonRpcRequestError metadata。
- builder内部隔离code/data getter。
- code归一为plain JSON safe int。
- data只进行一次不可信validation。
- 合法data复制为plain JSON tree。
- 无效或检查失败data回退固定-32603。
- getter失败时保留安全generic message/code语义。
- writer不再接触原始动态容器。
- connection可继续处理后续request。

## Safe Builder

`build_json_rpc_handler_error` 接收异常对象和可信default code。若异常是JsonRpcRequestError，分别尝试读取code/data；code执行非bool int、plain-int转换和safe-range检查，data通过JSON validation后立即调用内建tree clone。最终返回对象只包含plain code/message/data。

## Degradation Rules

invalid code、blank message、invalid data或data inspection/snapshot异常会返回固定handler contract -32603。code getter失败保留default -32000，data getter失败按无data处理，只要message有效即可形成generic structured error。普通ValidationError和SessionError继续使用各自default code。

## 验收标准

- 动态data第二次items调用会失败，但实际只读取一次。
- 合法动态data响应保留code/message/plain data。
- 首次data inspection失败返回固定-32603。
- hostile code/data getter不逃逸，返回-32000无data。
- 同一connection后续request成功。
- focused、Python全量、TS全量和integration通过。

## 实现结果

- call site移除 `exc.code` / `exc.data` 预读取。
- builder增加metadata getter、plain-int和JSON snapshot boundary。
- invalid structured metadata统一返回安全contract error。
- focused test覆盖snapshot、invalid data、hostile getters和recovery。
