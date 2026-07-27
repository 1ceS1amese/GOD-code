# Phase424 Initialize Response Schema Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase422-423 已保证 protocol version 和 initialization state，但 Host 只读取 `engine_info.protocol_version`，其余 response 仍被泛型 RPC cast 为 `InitializeResponse`。Malformed `supported_model_adapters` 会在 doctor `.join()` 时失败；非法/重复 tool catalog 会将不可靠 capability 数据带入后续诊断和 session setup。

## 目标

- 在 initialized transition 前验证完整 InitializeResponse。
- engine metadata 必须可展示且 protocol version 可确认。
- tool catalog entry 必须符合稳定 wire shape。
- tool 和 adapter identity 必须 non-blank 且各自唯一。
- response 及扩展字段必须递归 JSON-safe。
- malformed response 失败后 Host 回到 uninitialized，可安全重试。

## Response Contract

`engine_info`：

- JSON-safe object。
- `name` non-blank string。
- `version` non-blank string。
- `protocol_version` non-blank string，随后由 Host exact-check 为 2.0。

`supported_tools`：

- array。
- 每项 `name`、`description` non-blank。
- 可选 `input_schema` 必须是 JSON-safe object。
- tool name 在 response 中唯一。

`supported_model_adapters`：

- string array。
- 每项 non-blank。
- adapter name 唯一。

额外 engine/response 字段允许，但必须满足整个 response 的递归 JSON safety。

## Host Transaction

Host initialize 现在执行：

1. Host version/state preflight。
2. RPC request。
3. `asInitializeResponse(rawResponse)`。
4. exact Engine version check。
5. 设置 initialized。

任一步失败都通过 `finally` 清除 initializing；只有步骤 5 才提交 initialized state。

## 验收标准

- 合法 metadata、tool schema 和 adapter list 通过 converter。
- 缺/空白 engine fields 被拒绝。
- 非 object tool schema、重复工具名被拒绝。
- 空白/重复 adapter 被拒绝。
- non-JSON 扩展字段被拒绝。
- malformed response 后可以重新 initialize。
- doctor、headless、REPL 和 integration 正常路径保持通过。
- 全量 TS/Python/integration 通过。

## 实现结果

- 新增 `asInitializeResponse` protocol converter。
- InitializeResponse engine_info 类型从 generic record 收紧为稳定字段结构。
- Host RPC 先接收 unknown，再转换、确认版本和提交状态。
- Protocol tests 覆盖 schema/uniqueness/JSON safety。
- Process test 覆盖 malformed response rollback 和 retry。
