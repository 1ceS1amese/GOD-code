# Phase 48: MCP resource update loop diagnostics

Phase48 adds an in-process MCP resource update event loop diagnostic. It builds on Phase43 single-update wait and Phase44 short watch by keeping one connected runtime alive while subscribing to one or more resources and collecting update notifications through a shared handler.

## CLI surface

```text
god-code mcp loop-resource-updates <uri...> [--server <server_id>] [--timeout-ms <n>] [--max-events <n>] [--json]
```

Defaults:

- `--timeout-ms` defaults to the runtime resource update timeout.
- `--max-events` defaults to the runtime resource update max events.

## Behavior

- Resolves each resource URI to a configured MCP server.
- Registers one `notifications/resources/updated` handler per participating server.
- Subscribes to all requested resources within one connected runtime.
- Collects matching notifications until `--max-events` is reached or `--timeout-ms` expires.
- Best-effort unsubscribes all resources before closing the runtime.

The JSON details include:

- `server_ids`
- `uris`
- `subscription_count`
- `event_count`
- `max_events`
- `timed_out`
- `timeout_ms`
- `subscriptions`
- `updates`

## Boundaries

- This is an in-process diagnostic loop, not a daemon.
- It does not persist subscriptions across CLI commands.
- It does not auto-inject resource updates into PromptBuilder.
- It does not change JSON-RPC wire payloads or Python Engine behavior.
- It does not force Streamable HTTP fixtures to simulate long-lived SSE notifications.

## Validation

- TS unit coverage verifies the loop collects fixture notifications and renders loop details.
- Integration coverage calls the built CLI with `loop-resource-updates`.
- CLI smoke covers stdio config-file loop behavior.
