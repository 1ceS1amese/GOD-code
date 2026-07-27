# Phase 51: MCP context limits

Phase51 adds explicit size controls for MCP context injection. It keeps Phase49's opt-in context path, but makes the generated `create_session.initial_messages` safer and more predictable for large resources or repeated entries.

## Config surface

Supported environment variables:

```text
GOD_CODE_MCP_CONTEXT_MAX_ENTRY_CHARS
GOD_CODE_MCP_CONTEXT_MAX_TOTAL_CHARS
GOD_CODE_MCP_CONTEXT_DEDUP
```

Rules:

- `GOD_CODE_MCP_CONTEXT_MAX_ENTRY_CHARS` limits each generated context message.
- `GOD_CODE_MCP_CONTEXT_MAX_TOTAL_CHARS` limits total generated context message content.
- `GOD_CODE_MCP_CONTEXT_DEDUP` defaults to true and accepts `true/false`, `yes/no`, `on/off`, or `1/0`.
- Limit values must be positive integers.

## Behavior

- Context entries preserve configured order.
- Duplicate entries are removed by default with stable keys:
  - resource: type + server id + URI
  - prompt: type + server id + name + sorted arguments
- Entry truncation happens before total truncation.
- Truncated messages include a marker naming the applied limit.
- Messages beyond the total limit are skipped.

## Diagnostics

`god-code mcp inspect-context --json` now reports:

- `requested_entry_count`
- `entry_count`
- `message_count`
- `skipped_duplicate_count`
- `skipped_message_count`
- `truncated_message_count`
- `content_chars`
- `limits`
- per-message `content_chars`, `truncated`, and `truncated_by`

Text diagnostics render the same aggregate stats in compact form.

## Boundaries

- This does not auto-discover MCP resources or prompts.
- This does not summarize content semantically; truncation is character based.
- This does not implement token counting.
- This does not change JSON-RPC methods.
- This reuses existing `create_session.initial_messages`.

## Validation

- TS unit coverage verifies dedupe, truncation, invalid limit config, and diagnostics output.
- Integration coverage verifies built CLI dedupe stats.
- CLI smoke verifies default dedupe on the demo MCP fixture.
- `./tools/check.sh` covers Python tests, TS tests, build, integration, and CLI smoke.
