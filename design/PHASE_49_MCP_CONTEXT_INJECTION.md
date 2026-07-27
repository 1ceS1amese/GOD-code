# Phase 49: MCP context injection

Phase49 adds an explicit MCP resource / prompt context path for model sessions. It builds on Phase39 resource read / prompt get diagnostics, but uses an opt-in context config to convert selected MCP outputs into `create_session.initial_messages`.

## Config surface

Context entries can be provided inline:

```text
GOD_CODE_MCP_CONTEXT='[
  {"type":"resource","uri":"memory://demo/readme"},
  {"type":"prompt","name":"summarize","arguments":{"text":"hello"}}
]'
```

Or from a JSON file:

```text
GOD_CODE_MCP_CONTEXT_FILE=examples/config/mcp-context.json
```

`GOD_CODE_MCP_CONTEXT` takes precedence over `GOD_CODE_MCP_CONTEXT_FILE`.

Supported entry shapes:

- Resource: `{ "type": "resource", "uri": "...", "server_id": "..." }`
- Prompt: `{ "type": "prompt", "name": "...", "arguments": { "...": "..." }, "server_id": "..." }`

`server_id` is optional unless multiple configured MCP servers expose the same resource URI or prompt name.

## CLI surface

```text
god-code mcp inspect-context [--json]
```

The diagnostic loads the context config, connects configured MCP servers when entries exist, builds model history messages, and reports:

- `entry_count`
- `message_count`
- sanitized context entries
- generated `messages[]`

## Runtime behavior

- `prepareGodCodeHost()` loads MCP server config as before.
- If context entries exist, the TS Host uses the connected MCP runtime to call `resources/read` or `prompts/get`.
- Resource contents become user `ModelHistoryMessage` entries.
- Prompt messages preserve their MCP role as user / assistant `ModelHistoryMessage` entries.
- Headless run, REPL, and RPC smoke pass these messages through existing `create_session.initial_messages`.
- Transcript resume still appends restored transcript messages after host-prepared context messages.

## Boundaries

- This is explicit context injection, not automatic MCP resource / prompt discovery.
- It does not subscribe to resources or stream future updates into model context.
- It does not implement a background daemon.
- It does not add JSON-RPC methods.
- It reuses the existing optional `create_session.initial_messages` field from Phase21.
- It does not implement MCP auth / OAuth or legacy SSE transport.

## Validation

- TS unit coverage verifies context diagnostics and host-prepared initial messages.
- Integration coverage calls built CLI `mcp inspect-context --json`.
- CLI smoke verifies config-file context injection with the demo MCP fixture.
- `./tools/check.sh` covers Python tests, TS tests, build, integration, and CLI smoke.
