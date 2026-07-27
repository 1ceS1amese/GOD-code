# Phase 21: Session Resume from Transcript

Phase21 为 session history 增加 transcript-based resume。

它不恢复 live process，不重新执行历史工具，而是从已有 JSONL transcript 重建模型上下文，再启动新的 Engine session 执行新 prompt。

## CLI 行为

```bash
god-code sessions resume <session_id> <prompt>
god-code sessions resume <session_id> --json <prompt>
god-code sessions resume <session_id> --json --raw-events <prompt>
```

`sessions replay` 仍然只是离线查看。`sessions resume` 会读取已有 JSONL transcript，把可恢复消息注入新的 Engine session，然后提交新 prompt。

## 契约边界

- 源 transcript 只读，不覆盖。
- resume 会创建新的 Engine session id。
- 恢复范围包括 `user`、`assistant`、`tool_call`、`tool_result`。
- Phase21 忽略 `provider_context`。
- 历史 tool call 不会重新执行，只作为模型上下文恢复。
- 缺 session id、缺 prompt、未知 flag、或 `--raw-events` 未配合 `--json` 都是 usage error。

JSON 输出沿用 `god-code run --json`，并额外包含：

```json
{
  "resumed_from_session_id": "<old-session-id>",
  "restored_message_count": 4
}
```

带 `--raw-events` 时 JSON 输出额外包含 `events`。

## 实现

- TS transcript helper 把标准化 transcript entry 转成 `ModelHistoryMessage[]`。
- TS headless runtime 暴露 `runGodCodeResumedSession(...)`。
- `create_session` 增加向后兼容的可选字段 `initial_messages`。
- Python Engine 校验 `initial_messages`，并在第一轮 resumed turn 前写入 `SessionState.messages`。
- 旧客户端不传 `initial_messages` 时保持原行为。

## 校验

- Python tests 覆盖 `initial_messages` 解析和 session seed。
- TS tests 覆盖 transcript 转消息、忽略 provider context、空 resume 拒绝和 resumed run。
- Integration 和 CLI smoke 覆盖 `sessions resume --json --raw-events`、usage error 和删除新 resumed session。
