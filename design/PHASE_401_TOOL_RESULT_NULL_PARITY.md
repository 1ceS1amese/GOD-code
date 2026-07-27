# Phase401 Tool Result Null Parity

## 状态

代码、测试与文档已完成。

## 审计结论

Phase400 完成了 TS result shape validator，但逐字段对照发现 Python parser 仍将显式 `null` output/error 当成字段缺失，并会静默忽略 null 或 primitive `error.details`。因此同一个 wire payload 在 TS 和 Python 两侧仍有不同结论。

## 目标

- 明确 optional 字段的 missing 与 explicit null 语义。
- 让 TS 和 Python 对 output/error/details 使用完全一致的 object contract。
- 不影响字段真正缺失时的兼容行为。
- 为跨语言边界增加直接 parser contract tests。

## Contract

以下字段均采用“可以缺失，存在时必须为 object”：

- `output`
- `error`
- `error.details`

显式 JSON `null` 不等价于缺失，因此与 array、string、number、boolean 一样属于非法 shape。合法 payload 可以只包含 `{ "ok": true }`，也可以包含完整 object output/error/details。

## 验收标准

- Python 接受 optional 字段缺失和 object 值。
- Python 拒绝 null output、null error、null details 和 primitive details。
- TS validator 增加对应 null cases 并保持拒绝。
- Scheduler/TurnEngine 对合法 Host result 行为不变。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- Python parser 从 value-based 判断改为 key-presence + object 判断。
- `error.details` 不再静默丢弃非法值。
- 新增 `test_api_models.py` 作为 Python result parser 的直接 contract suite。
- 扩展 TS protocol validator null matrix。
