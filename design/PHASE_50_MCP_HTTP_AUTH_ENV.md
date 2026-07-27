# Phase 50: MCP Streamable HTTP auth env diagnostics

Phase50 adds env-resolved HTTP authentication headers for Streamable HTTP MCP servers. It keeps credential values out of config files and diagnostics while still passing resolved headers to the MCP HTTP transport.

## Config surface

Streamable HTTP MCP configs now support:

```json
[
  {
    "id": "remote-auth",
    "transport": "streamable-http",
    "url": "https://mcp.example.test/mcp",
    "bearer_token_env": "REMOTE_MCP_TOKEN"
  }
]
```

This resolves to:

```text
Authorization: Bearer ${REMOTE_MCP_TOKEN}
```

For non-bearer headers, use:

```json
[
  {
    "id": "remote-auth",
    "transport": "streamable-http",
    "url": "https://mcp.example.test/mcp",
    "headers_env": {
      "X-API-Key": "REMOTE_MCP_API_KEY"
    }
  }
]
```

Existing literal `headers` are still supported, but env-backed headers are preferred for secret values.

## Diagnostics behavior

`mcp inspect-config --json` and text diagnostics expose only sanitized metadata:

- `header_keys`
- `header_env_keys`
- `bearer_token_env`

They do not print resolved token or header values. Missing env variables fail at MCP config load time with an error that names the missing env var but not any secret value.

## Runtime behavior

- `loadMcpServerConfigs()` resolves `headers_env` and `bearer_token_env` using the provided environment.
- Resolved headers are passed to `StreamableHTTPClientTransport`.
- Duplicate HTTP header names are rejected case-insensitively across `headers`, `headers_env`, and `bearer_token_env`.
- `bearer_token_env` and `bearerTokenEnv` are both accepted, but cannot be set together.

## Boundaries

- This is env-based HTTP auth configuration, not OAuth.
- It does not implement browser/device authorization flows.
- It does not refresh tokens.
- It does not persist credentials.
- It does not add JSON-RPC methods or change Python Engine behavior.

## Validation

- TS unit coverage verifies bearer token env resolution, redacted diagnostics, missing env errors, and HTTP fixture auth.
- Integration coverage runs built CLI `mcp inspect-config --connect --json` against an auth-checking Streamable HTTP fixture.
- CLI smoke covers the same auth-checking Streamable HTTP path.
- `./tools/check.sh` covers Python tests, TS tests, build, integration, and CLI smoke.
