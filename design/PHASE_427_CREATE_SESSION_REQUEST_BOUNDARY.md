# Phase427 Create Session Request Schema Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase426 已验证 create_session response，但 request 仍只依赖 TypeScript compile-time shape。JavaScript caller、cast 或 runtime-derived resume history 可以绕过类型；Python Engine 对空白 identity、重复 tool names、非 JSON schema 和不匹配的 history role 也存在宽松接受路径。这些值可能在 session creation 或 session_started event 前才暴露问题。

## 目标

- Host 在发送 create_session RPC 前验证最终 request。
- Engine 在 provider lookup、session mutation 和 event emission 前重复验证。
- session_id、cwd 与 model_adapter 必须 non-blank。
- tool_catalog 必须是唯一名称的合法目录。
- initial_messages 必须符合 discriminated history union。
- 整个 request 及其扩展字段必须递归 JSON-safe。
- malformed request 不发送 Host RPC，也不创建 Engine session/event。

## Request Contract

- `session_id`: non-blank string。
- `cwd`: non-blank string。
- `model_adapter`: non-blank string。
- `tool_catalog`: array：
  - name/description non-blank。
  - name 在目录中唯一。
  - optional input_schema 为 JSON-safe object。
- optional `initial_messages`: array：
  - user: exact kind/role、non-empty content。
  - assistant: exact kind/role、non-empty content。
  - tool_call: JSON-safe object payload。
  - tool_result: non-blank tool identity、optional non-blank call id、JSON-safe result object。
- 顶层及开放扩展字段递归 JSON-safe。

## Validation Order

Host 在 initialization gate 后调用 `asCreateSessionRequest`，converter 失败时 RPC invocation count 为零。Engine 在 `_require_initialized` 后验证完整 transport shape，再解析 identities、catalog 与 history；只有所有校验和 provider resolution 成功后才调用 SessionManager 并发出 session_started。

## 验收标准

- 正常 bundled create_session 与 resume history 保持通过。
- 空白 session/cwd/adapter 被两端拒绝。
- 重复或 malformed tool catalog 被两端拒绝。
- role mismatch、invalid tool history 和 non-JSON values 被两端拒绝。
- Host malformed request 不发 RPC。
- Engine malformed request 不创建 session、不发 event。
- TS、Python 全量和真实 integration 保持通过。

## 实现结果

- 新增 `asCreateSessionRequest` runtime converter。
- Host createSession 增加 wire preflight。
- Engine create_session 增加完整 JSON-safe 与 identity guard。
- Python catalog/history parsers 收紧为与协议 union 一致。
- 两端测试覆盖 transport、identity、catalog、history 和 mutation ordering。

