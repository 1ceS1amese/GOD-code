# Phase 52: MCP legacy SSE transport

Phase52 adds an explicit compatibility path for legacy MCP servers that still expose the deprecated SSE transport. It keeps the existing TS Host MCP boundary: transport setup, auth headers, diagnostics, and lifecycle remain host-local, while discovered tools still enter the normal tool catalog.

## Config surface

MCP server configs now support:

```json
[
  {
    "id": "legacy-demo",
    "transport": "sse",
    "url": "https://mcp.example.test/sse",
    "bearer_token_env": "LEGACY_MCP_TOKEN"
  }
]
```

`transport: "sse"` uses the same HTTP-adjacent fields as Streamable HTTP:

- `url`
- `headers`
- `headers_env`
- `bearer_token_env`

The URL must use `http` or `https`. Env-backed headers are resolved at config load time, and duplicate header names are rejected case-insensitively across literal, env-backed, and bearer-token headers.

## Runtime behavior

- `loadMcpServerConfigs()` accepts `transport: "sse"` and returns a typed SSE config.
- `SdkMcpStdioRuntime` creates an MCP SDK `SSEClientTransport` for SSE configs.
- Stdio and Streamable HTTP behavior is unchanged.
- SSE-discovered tools are named `mcp.<server_id>.<tool_name>` and execute through the same host registry path as other MCP tools.
- Resources, resource templates, prompts, and completion diagnostics reuse the existing MCP runtime calls.

## Diagnostics behavior

`mcp inspect-config` renders `transport=sse` and sanitized metadata:

- `url`
- `header_keys`
- `header_env_keys`
- `bearer_token_env`

Resolved header values and bearer token values are never printed. Runtime errors still use the existing structured `mcp_connect.details` shape with sanitized server metadata.

## Boundaries

- This is a legacy compatibility path; Streamable HTTP remains the preferred HTTP MCP transport.
- This does not add automatic fallback between Streamable HTTP and SSE.
- This does not implement OAuth, token refresh, browser/device authorization, or credential storage.
- This does not add a daemon or cross-command persistent connection.
- This does not add JSON-RPC methods or change Python Engine payloads.
- This does not auto-discover resources/prompts for context injection.

## Validation

- TS unit coverage connects to a local SSE fixture with bearer-token auth, lists tools/resources/templates/prompts, and verifies token redaction.
- Integration coverage runs the built CLI against the same SSE fixture.
- CLI smoke covers `mcp inspect-config --connect --resources --resource-templates --prompts --json` for `transport: "sse"`.
- `./tools/check.sh` covers Python tests, TS tests, build, integration, and CLI smoke.
