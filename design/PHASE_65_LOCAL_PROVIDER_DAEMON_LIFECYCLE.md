# Phase 65: Local provider daemon lifecycle

Phase65 implements a local provider daemon lifecycle layer for `local-openai-compatible` endpoints. Phase57 added the local OpenAI-compatible provider family, and Phase64 added process-local provider request throttling. This phase defines how GOD-code inspects, optionally starts, and safely stops a user-configured local model server without pushing process management into the Python Engine or changing JSON-RPC.

The first implementation is explicit, local-only, opt-in, and diagnostic-first.

## Goals

- Add a clear lifecycle boundary for local provider daemons.
- Keep local daemon process management in the TS Host CLI layer.
- Keep Python `providers/` focused on provider HTTP request/response semantics.
- Support deterministic status diagnostics for local provider daemon config.
- Support explicit dry-run and explicit confirmed start behavior.
- Stop only daemons that GOD-code started and recorded.
- Keep default `god-code run`, `god-code repl`, `doctor`, and fake provider behavior unchanged.
- Keep diagnostics sanitized and avoid printing command secrets or bearer tokens.
- Avoid JSON-RPC method changes.

## Non-goals

- No automatic model installation or pull in Phase65.
- No Ollama-native, llama.cpp-native, vLLM-native, or LM Studio-specific API shape.
- No GPU/runtime management.
- No system service installation, launchd/systemd registration, or Windows service creation.
- No daemon auto-start from ordinary `run`, `repl`, or default `doctor`.
- No background daemon owned by Python Engine.
- No remote provider daemon lifecycle.
- No account billing, quota API, token pricing, or spend ledger.
- No JSON-RPC method changes.

## Current state

Current local-provider path:

```text
GOD_CODE_PROVIDER=local-openai-compatible
  -> ProviderConfig
  -> RealProviderModelAdapter
  -> OpenAICompatibleProviderClient
  -> http://127.0.0.1:11434/v1/chat/completions
```

Current diagnostics:

- `provider inspect-config` validates provider env shape offline.
- `doctor provider-health` explicitly sends a small provider request when config is complete.
- Default `doctor` does not probe real provider HTTP.

Current limitation:

- The user must start local model servers externally.
- The CLI cannot report whether a configured local daemon command is startable.
- There is no marker file proving whether a local daemon was started by GOD-code.
- There is no safe stop boundary for locally started provider daemons.

## Implemented CLI surface

Add a local daemon subcommand under the existing provider diagnostics namespace:

```bash
god-code provider local-daemon status
god-code provider local-daemon status --json
god-code provider local-daemon start --dry-run
god-code provider local-daemon start --yes
god-code provider local-daemon start --yes --json
god-code provider local-daemon stop --dry-run
god-code provider local-daemon stop --yes
god-code provider local-daemon stop --yes --json
```

Rules:

- `status` never starts or stops processes.
- `start` defaults to dry-run unless `--yes` is present.
- `stop` defaults to dry-run unless `--yes` is present.
- `stop --yes` only targets a PID recorded in a GOD-code marker file that matches the configured daemon identity.
- These commands are only valid for `GOD_CODE_PROVIDER=local-openai-compatible`.
- Remote providers return a clear local diagnostic error.

## Implemented config surface

Environment variables:

```text
GOD_CODE_LOCAL_PROVIDER_DAEMON_ENABLED
GOD_CODE_LOCAL_PROVIDER_DAEMON_COMMAND
GOD_CODE_LOCAL_PROVIDER_DAEMON_ARGS
GOD_CODE_LOCAL_PROVIDER_DAEMON_CWD
GOD_CODE_LOCAL_PROVIDER_DAEMON_READY_URL
GOD_CODE_LOCAL_PROVIDER_DAEMON_READY_TIMEOUT_MS
GOD_CODE_LOCAL_PROVIDER_DAEMON_PID_FILE
GOD_CODE_LOCAL_PROVIDER_DAEMON_LOG_FILE
GOD_CODE_LOCAL_PROVIDER_DAEMON_ENV_ALLOWLIST
```

Defaults:

- `GOD_CODE_LOCAL_PROVIDER_DAEMON_ENABLED=false`
- `GOD_CODE_LOCAL_PROVIDER_DAEMON_COMMAND` unset
- `GOD_CODE_LOCAL_PROVIDER_DAEMON_ARGS=[]`
- `GOD_CODE_LOCAL_PROVIDER_DAEMON_CWD` unset
- `GOD_CODE_LOCAL_PROVIDER_DAEMON_READY_URL` derived from `GOD_CODE_BASE_URL` only when safe, otherwise unset
- `GOD_CODE_LOCAL_PROVIDER_DAEMON_READY_TIMEOUT_MS=15000`
- `GOD_CODE_LOCAL_PROVIDER_DAEMON_PID_FILE=<cwd>/.god-code/local-provider-daemon.json`
- `GOD_CODE_LOCAL_PROVIDER_DAEMON_LOG_FILE=<cwd>/.god-code/local-provider-daemon.log`
- `GOD_CODE_LOCAL_PROVIDER_DAEMON_ENV_ALLOWLIST` unset

Validation rules:

- Daemon config is ignored unless `GOD_CODE_PROVIDER=local-openai-compatible`.
- `COMMAND` must be a non-empty executable string when daemon lifecycle is enabled.
- `ARGS` must be a JSON array of strings.
- `READY_TIMEOUT_MS` must be a positive integer.
- `READY_URL`, when set, must be an HTTP(S) URL pointing to localhost / loopback by default.
- `PID_FILE` and `LOG_FILE` must resolve under the current workspace or another explicitly allowed path.
- Diagnostics must show command shape and paths but not environment values.

## Runtime boundary

Lifecycle commands stay in TS Host:

```text
ts-host CLI provider local-daemon
  -> parse local daemon env
  -> validate local-only provider config
  -> inspect marker file / process status
  -> optionally spawn configured command
  -> optionally poll ready URL
  -> write marker file for GOD-code-started daemon
```

Python Engine remains unchanged:

```text
Python Engine
  -> PromptBuilder
  -> RealProviderModelAdapter
  -> OpenAI-compatible HTTP client
```

No lifecycle state enters:

- `initialize`
- `create_session`
- `submit_turn`
- `ModelRequest`
- transcript JSONL
- tool execution payloads
- MCP/plugin payloads

## Status behavior

`provider local-daemon status --json` returns sanitized details:

```json
{
  "ok": true,
  "checks": [
    {
      "name": "local_provider_daemon",
      "status": "ok",
      "message": "local daemon config is valid",
      "details": {
        "enabled": true,
        "provider": "local-openai-compatible",
        "command_configured": true,
        "args_count": 2,
        "pid_file": ".god-code/local-provider-daemon.json",
        "log_file": ".god-code/local-provider-daemon.log",
        "marker_present": false,
        "ready_url": "http://127.0.0.1:11434/v1/models"
      }
    }
  ]
}
```

Rules:

- Do not print command arguments if they may contain secrets; show counts and sanitized executable basename.
- Do not print env values.
- Do not infer a daemon as GOD-code-owned unless the marker file matches expected shape.
- Do not require a network probe for offline config status. Readiness probing can be a separate status detail when explicitly enabled.

## Start behavior

`provider local-daemon start --dry-run`:

- validates config;
- reports the command shape;
- reports marker/log paths;
- does not spawn anything.

`provider local-daemon start --yes`:

- validates local-only provider config;
- refuses to start if a matching marker file already points to a live process;
- spawns the configured command detached or as an explicitly managed child process, depending on platform support;
- redirects stdout/stderr to the configured log file;
- writes a marker file with PID, command hash, cwd, started_at, and provider base URL;
- optionally polls `READY_URL` until timeout;
- never sends provider prompts or tool schemas during readiness checks.

Marker file example:

```json
{
  "schema_version": 1,
  "provider": "local-openai-compatible",
  "pid": 12345,
  "command_hash": "sha256:...",
  "base_url": "http://127.0.0.1:11434/v1",
  "started_at": "2026-06-20T00:00:00.000Z"
}
```

## Stop behavior

`provider local-daemon stop --dry-run`:

- reads marker file;
- reports whether a GOD-code-started daemon appears stoppable;
- does not send a signal.

`provider local-daemon stop --yes`:

- requires a valid marker file;
- checks that the recorded PID still appears to match the recorded command identity where the platform allows it;
- sends a normal termination signal first;
- waits a short bounded period;
- only escalates to force kill if explicitly requested in a future phase;
- removes the marker file only after the process exits or is proven stale.

Phase65 should not stop arbitrary processes discovered by port scan or provider URL.

## Interaction with provider health

`doctor provider-health` remains the explicit provider request check. Local daemon lifecycle commands may optionally poll a readiness URL, but that readiness check is separate from model-level provider health.

Readiness should not:

- send user prompts;
- call `/chat/completions`;
- require model generation;
- expose API keys;
- mutate provider state.

## Interaction with rate limit / retry / fallback

Local daemon lifecycle is independent from provider request policy:

- Phase64 rate limiting applies only to provider requests.
- Phase53 retry applies only after an actual provider request attempt.
- Phase54 fallback should not start or stop local daemons automatically.
- A failed daemon readiness check is a TS Host diagnostic failure, not a Python provider error.

## Diagnostics and security

Diagnostics must avoid printing:

- API key values;
- bearer tokens;
- raw env values not explicitly allowlisted;
- full command lines when arguments may contain secrets;
- local daemon stdout/stderr by default;
- prompt text, completions, request bodies, or provider raw responses.

Diagnostics may print:

- executable basename;
- argument count;
- resolved marker/log path;
- timeout values;
- local-only ready URL host/path;
- whether a marker file exists;
- whether a marker PID appears live.

## Implementation summary

1. Added TS Host local daemon config parsing and sanitized diagnostics helpers.
2. Added `provider local-daemon status` and `status --json`.
3. Added `provider local-daemon start --dry-run` and `start --yes` with marker/log file handling.
4. Added `provider local-daemon stop --dry-run` and `stop --yes` with marker validation.
5. Added docs and examples for local daemon lifecycle config.
6. Added tests / smoke coverage for dry-run and JSON diagnostics without requiring real model servers.

## Implemented tests

TS tests:

- disabled config reports local daemon disabled.
- enabled config requires `local-openai-compatible`.
- command args JSON must be an array of strings.
- ready URL must be loopback/local by default.
- status JSON is sanitized.
- start dry-run does not spawn.
- start `--yes` writes a marker file using a fake short-lived command fixture.
- stop dry-run does not signal.
- stop `--yes` refuses stale or mismatched marker files.
- diagnostics do not leak env values or command secrets.

Integration / smoke:

- `provider local-daemon status --json` with disabled config.
- `provider local-daemon start --dry-run --json` with fixture config.
- `provider local-daemon stop --dry-run --json` with missing marker.
- `provider inspect-config` remains unchanged for normal provider config.
- `doctor` remains offline by default.

## Validation target

```bash
npm test -- cliProviderContract.test.ts --run
npm test -- cliDiagnostics.test.ts --run
npm run build
./tools/check.sh
```

## Boundaries

- No JSON-RPC method changes.
- No Python Engine process management.
- No provider client request/response changes.
- No transcript schema changes.
- No tool execution changes.
- No model installation / pull.
- No system service manager integration.
- No automatic daemon startup from ordinary model turns.

## Phase601 lifecycle integration

Phase601 preserves the Phase65 daemon command, marker, log, renderer, and environment contracts. The start operation now forms its spawn/marker outcome before finalizing the parent log descriptor: thrown primaries remain unchanged, successful start plus descriptor cleanup uncertainty uses the fixed existing-check error `local provider log cleanup failed`, and the raw close reason is never rendered.
