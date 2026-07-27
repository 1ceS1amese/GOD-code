# Phase418 Engine Event Construction Invariant

## 状态

代码、测试与文档已完成。

## 审计结论

Phase417 已在 TypeScript Host wire boundary 校验逐类型事件 payload，但 Python `GodCodeEventEnvelope` 仍是无构造检查的 dataclass，`TurnResult` 也允许未知 status 或矛盾字段组合。Engine 内部新增 emitter、测试替身或未来 adapter 因此仍可能生成必然被 Host 拒绝的事件。

## 目标

- 在 Python 事件对象构造时强制封闭 event type。
- 对齐 Host 的 non-blank session/turn identity 和 session/turn scope 规则。
- 在序列化和 JSON-RPC notification 前强制 payload JSON safety。
- 对八类事件执行与 Host 相同的核心 payload schema 校验。
- 为 `TurnResult` 增加 success/error/cancelled 构造不变量。

## Engine Construction Contract

`GodCodeEventEnvelope.__post_init__` 依次检查：

1. event type 属于协议声明集合。
2. session identity non-blank。
3. session_started 不带 turn_id；其他事件携带 non-blank turn_id。
4. payload 是递归 JSON-safe object。
5. payload 与 event type 的核心 schema 匹配。

Tool result 与 error payload 复用现有 parser/constructor invariant；batch scheduler 等额外 metadata 保持 JSON-safe 即可继续透传。

## Turn Result Contract

- success：必须有 assistant message，不能有 error。
- error：必须有 error，不能有 assistant message。
- cancelled：两者都不能有。
- 其他 status：构造失败。

## 验收标准

- Engine 可构造八类当前协议事件。
- 未知 type、空白 identity、错误 turn scope、非 JSON payload 和逐类型 malformed payload 均在构造点失败。
- 非法 TurnResult 状态组合无法进入 `to_dict` 或 event emitter。
- 现有 TurnEngine、Engine server、Host converter 和 integration 行为保持通过。
- TypeScript/Python 全量测试及跨语言 integration 全部通过。

## 实现结果

- Python 增加共享 event type 集合和事件 payload 构造 validator。
- `GodCodeEventEnvelope` 增加 `__post_init__`。
- `TurnResult` 增加 discriminated state `__post_init__`。
- Python API model tests 覆盖合法事件全集和非法构造矩阵。
