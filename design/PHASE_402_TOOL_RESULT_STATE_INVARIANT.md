# Phase402 Tool Result State Invariant

## 状态

代码、测试与文档已完成。

## 审计结论

Phase400-Phase401 统一了字段 shape 与 null 语义，但 `ok` 和 `error` 仍彼此独立：`ok: true` 可以携带 error，`ok: false` 也可以完全没有 error。TurnEngine 因而需要为失败缺失 error 临时合成 `tool_failed`，而成功携带 error 又会被静默视为成功。

## 目标

- 将 ToolExecutionResult 固化为可判别状态。
- 成功结果不得携带矛盾 error。
- 失败结果必须提供可诊断 error。
- TS/Python 使用相同状态不变量。
- 保留 optional output，包括失败时的 partial output。

## Contract

- `ok: true`：`error` 必须缺失，`output` 可缺失或为 object。
- `ok: false`：`error` 必须存在并满足 code/message/details schema，`output` 可缺失或为 object。

这使 `ok` 成为唯一状态判别字段，同时确保每个失败都能进入稳定的错误传播、取消判断和 transcript/event 展示路径。

## 验收标准

- TS/Python 都拒绝 `ok:true + error`。
- TS/Python 都拒绝 `ok:false` 且 error 缺失。
- 合法成功、合法失败和失败 partial output 保持通过。
- Host malformed batch result 继续按 slot 隔离。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- TS validator 增加 success/failure error presence invariant。
- Python parser 在完成 shape parsing 后执行相同状态检查。
- 两侧 direct validator matrices 增加矛盾状态 cases。
