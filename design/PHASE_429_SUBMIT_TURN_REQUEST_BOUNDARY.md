# Phase429 Submit Turn Request Schema Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase428 已验证 submit_turn response，但 request 仍可通过 JavaScript caller、cast 或动态 options 绕过 TypeScript 类型。Python Engine 只解析基本字段，并把已知 option 类型检查留到 turn thread 内的 PromptBuilder；因此非法 option 可能先占用 active-turn slot、启动线程并以 accepted response 离开请求边界。

## 目标

- Host 在发送 submit_turn RPC 前验证最终 request。
- Engine 在 session lookup、begin_turn 和 thread start 前重复验证。
- session_id 必须 non-blank。
- prompt 必须是 exact user role 和 non-empty content。
- turn_options 必须是 JSON-safe object。
- 已知 options 在同步 ingress 阶段验证类型。
- 开放 option keys 保持可扩展，但必须 JSON-safe。
- malformed request 不发送 Host RPC、不创建 active turn、不发 event。

## Request Contract

- `session_id`: non-blank string。
- `prompt`:
  - `role === "user"`
  - `content` 是 non-empty string。
  - 扩展字段 JSON-safe。
- `turn_options`: JSON-safe object。
  - optional stream: boolean。
  - optional max_tokens: JSON safe integer。
  - optional temperature: finite number。
  - optional provider: string。
  - 其他 keys 保持开放。
- 整个 request 和扩展字段递归 JSON-safe。

## Validation Order

Host 在 initialization gate 后调用 `asSubmitTurnRequest`，失败时不调用 JSON-RPC。Engine 在 `_require_initialized` 后验证完整 request，再解析 prompt/options 和 session identity；只有校验完成后才查找 session、分配 turn_id、写入 active turn、创建并启动 thread。

## 验收标准

- 正常 prompt、streaming 和 provider options 保持通过。
- 空白 session、错误 role、空 content、non-object options 被两端拒绝。
- 已知 option 类型错误和非 JSON extension 被两端拒绝。
- Host malformed request invocation count 为零。
- Engine malformed request 不产生 active turn 或 event。
- TS、Python 全量和 integration 保持通过。

## 实现结果

- 新增 `asSubmitTurnRequest` converter 和 known option validator。
- Host submitTurn 增加 wire preflight。
- Engine 新增 `parse_turn_options`，并收紧 `parse_prompt_message`。
- Engine submit ingress 在 begin_turn/thread 前执行完整 JSON-safe 和 identity validation。
- Tests 覆盖 prompt、options、transport safety 和 mutation ordering。

