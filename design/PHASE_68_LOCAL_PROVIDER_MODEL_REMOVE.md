# Phase 68: Local provider model remove command

Phase68 implements an explicit local model remove command for `local-openai-compatible` workflows. Phase66 added model discovery through OpenAI-compatible `GET /models`, and Phase67 added a generic local model pull command. This phase defines how GOD-code can run a user-configured local model remove/delete command without adding runtime-native APIs, automatic cache pruning, provider selection changes, or JSON-RPC methods.

The first implementation is explicit, local-only, dry-run by default, and diagnostic-first.

## Goals

- Add an explicit CLI surface for local model remove/delete actions.
- Keep model remove process execution in the TS Host CLI layer.
- Require opt-in config and explicit confirmation for real deletion.
- Default to dry-run behavior.
- Support generic command templates instead of hardcoding Ollama / llama.cpp APIs.
- Keep Phase66 model discovery as the verification path before or after removal.
- Keep diagnostics sanitized and avoid printing tokens, full command args, or raw logs.
- Keep default `god-code run`, `god-code repl`, `doctor`, fake provider, and provider HTTP behavior unchanged.
- Avoid Python Engine, provider client, transcript, MCP, plugin, or JSON-RPC changes.

## Non-goals

- No Ollama-native, llama.cpp-native, vLLM-native, LM Studio-native, or vendor-specific HTTP API in Phase68.
- No automatic model selection or mutation of `GOD_CODE_MODEL`.
- No automatic model removal from `run`, `repl`, default `doctor`, `local-models list`, or `local-models pull`.
- No broad cache pruning, disk quota management, LRU policies, or background cleanup daemon.
- No system package removal, runtime uninstall, GPU/runtime teardown, or service deregistration.
- No remote provider model deletion.
- No raw model-file path deletion by GOD-code unless a future phase adds explicit path allowlists.
- No JSON-RPC method changes.

## Current state

Previous local model support:

```text
god-code provider local-daemon status/start/stop
god-code provider local-models list
god-code provider local-models list --require-configured-model
god-code provider local-models pull <model> --dry-run
god-code provider local-models pull <model> --yes
```

Previous limitation:

- Users can discover and pull models through explicit local-provider workflows.
- If a local model should be removed, users must run runtime-specific commands outside GOD-code.
- GOD-code currently has no dry-run / confirmed boundary for local model deletion.

## Implemented CLI surface

Add a model remove subcommand under the existing local model namespace:

```bash
god-code provider local-models remove <model> --dry-run
god-code provider local-models remove <model> --dry-run --json
god-code provider local-models remove <model> --yes
god-code provider local-models remove <model> --yes --json
```

Rules:

- The command is only valid for `GOD_CODE_PROVIDER=local-openai-compatible`.
- `remove` defaults to dry-run unless `--yes` is present.
- `--dry-run` and `--yes` are mutually exclusive.
- `<model>` is passed as a single argument substitution value, never through shell interpolation.
- The command does not mutate `GOD_CODE_MODEL`, even when removing the configured model.
- The command does not start or stop local daemons.
- The command does not call Phase66 discovery automatically in Phase68; users can run `local-models list` before or after.

Example dry-run output:

```text
GOD-code local provider model remove:
OK local_provider_model_remove: dry-run: local provider model remove would be executed
  provider: local-openai-compatible
  model: llama3.1
  command_configured: true
  command_basename: ollama
  args_count: 2
  log_file: .god-code/local-provider-model-remove.log
  timeout_ms: 600000
```

Example JSON output:

```json
{
  "ok": true,
  "checks": [
    {
      "name": "local_provider_model_remove",
      "status": "ok",
      "message": "dry-run: local provider model remove would be executed",
      "details": {
        "provider": "local-openai-compatible",
        "model": "llama3.1",
        "command_configured": true,
        "command_basename": "ollama",
        "args_count": 2,
        "log_file": ".god-code/local-provider-model-remove.log",
        "timeout_ms": 600000
      }
    }
  ]
}
```

## Implemented config surface

Environment variables:

```text
GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENABLED
GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND
GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE
GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_CWD
GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_TIMEOUT_MS
GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_LOG_FILE
GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENV_ALLOWLIST
```

Defaults:

- `GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENABLED=false`
- `GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND` unset
- `GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE` unset
- `GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_CWD` unset
- `GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_TIMEOUT_MS=600000`
- `GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_LOG_FILE=<cwd>/.god-code/local-provider-model-remove.log`
- `GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENV_ALLOWLIST` unset

Example:

```bash
export GOD_CODE_PROVIDER=local-openai-compatible
export GOD_CODE_MODEL=llama3.1
export GOD_CODE_BASE_URL=http://127.0.0.1:11434/v1

export GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENABLED=true
export GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND=ollama
export GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE='["rm","{model}"]'

god-code provider local-models remove llama3.1 --dry-run --json
god-code provider local-models remove llama3.1 --yes --json
god-code provider local-models list --json
```

Validation rules:

- Remove config is ignored unless `GOD_CODE_PROVIDER=local-openai-compatible`.
- `MODEL_REMOVE_ENABLED=true` requires command and args template.
- `ARGS_TEMPLATE` must be a JSON array of strings.
- At least one args-template entry must contain `{model}`.
- Model names must be non-empty, bounded, and free of control characters.
- The command is spawned with `shell=false`; shell metacharacters are not interpreted by GOD-code.
- `CWD`, when set, must resolve under the current workspace unless a future explicit allowlist is added.
- `LOG_FILE` must resolve under the current workspace by default.
- `TIMEOUT_MS` must be a positive bounded integer.
- `ENV_ALLOWLIST` must contain environment variable names only.

## Runtime boundary

Model remove commands stay in TS Host:

```text
ts-host CLI provider local-models remove
  -> parse local provider env
  -> validate local provider family
  -> validate remove command config
  -> render dry-run diagnostics, or spawn configured command with shell=false
  -> redirect stdout/stderr to bounded log file
  -> return sanitized exit diagnostics
```

Python Engine remains unchanged:

```text
Python Engine
  -> PromptBuilder
  -> RealProviderModelAdapter
  -> OpenAI-compatible HTTP client
```

No remove state enters:

- `initialize`
- `create_session`
- `submit_turn`
- `ModelRequest`
- transcript JSONL
- provider HTTP clients
- tool execution payloads
- MCP/plugin payloads

## Execution behavior

`remove <model> --dry-run`:

- validates local provider family and remove config;
- renders command shape and log path;
- does not spawn a process;
- does not create a log file;
- does not contact `/models`.

`remove <model> --yes`:

- validates local provider family and remove config;
- creates the log directory if needed;
- substitutes `{model}` into the args template;
- spawns the command with `shell=false`;
- passes only allowlisted environment variables when allowlist is configured;
- redirects stdout/stderr to the configured log file;
- waits up to `TIMEOUT_MS`;
- returns sanitized status, exit code, signal, duration, and log path.

Phase68 should not:

- stream raw remove logs to stdout by default;
- print raw command args if they may contain secrets;
- infer success by parsing runtime-specific log text;
- delete filesystem model paths directly;
- remove multiple models or prune caches by pattern;
- auto-start or stop a local daemon before or after removal.

## Interaction with Phase66 model discovery and Phase67 pull

Recommended manual flow:

```bash
god-code provider local-models list --json
god-code provider local-models remove llama3.1 --dry-run --json
god-code provider local-models remove llama3.1 --yes --json
god-code provider local-models list --json
```

Phase68 keeps verification explicit:

- `remove` does not automatically call `local-models list`.
- `remove` does not change `GOD_CODE_MODEL`.
- `remove` can be used even if the local daemon is not currently running, because some runtimes remove models without serving HTTP.
- If users remove the configured model, a later `local-models list --require-configured-model` or provider health check should surface the mismatch.

## Error handling and sanitization

Errors should be structured and safe:

- Non-local provider: `local model remove requires GOD_CODE_PROVIDER=local-openai-compatible`.
- Disabled remove config: report that model remove is disabled.
- Missing command/template: report missing env names.
- Invalid template: report shape error without raw template content.
- Invalid model name: report validation reason.
- Timeout: report timeout and log path.
- Non-zero exit: report exit code and log path.

Diagnostics should not print:

- API key values.
- Authorization headers.
- Full command args.
- Raw process logs.
- Full inherited environment.
- Runtime stack traces.

## Implementation touch points

Expected implementation files:

- `ts-host/src/cli/provider.ts`
- `ts-host/src/cli/main.ts`
- `ts-host/test/cliProviderContract.test.ts`
- `tools/run-cli-smoke.sh`
- `examples/config/provider.env.example`
- `README.md`
- `PROJECT_PLAN.md`
- `INTERNAL_DESIGN.md`
- `ARCHITECTURE.md`
- `EXTENSION_POINTS.md`
- `protocol/README.md`

Python files should not need changes for the first implementation.

## Test plan

Unit / contract tests:

- Reject non-local provider families.
- Report disabled remove config by default.
- Require command and args template when enabled.
- Reject invalid args template JSON.
- Reject template without `{model}`.
- Validate model name bounds and control-character rejection.
- Dry-run does not spawn or create logs.
- Dry-run renders command basename and args count without raw args.
- `--yes` executes a deterministic fixture command with the model substituted.
- Success returns exit code, duration, and log path without raw log content.
- Non-zero exit returns error status with log path.
- Timeout returns error status and does not hang.
- Env allowlist passes only allowed variables plus minimal PATH when needed.
- JSON/text output does not leak secret-looking args or env values.

Smoke tests:

- `provider local-models remove <model> --dry-run --json` with fixture config.
- `provider local-models remove <model> --yes --json` with a deterministic local fixture command.
- Non-local provider error path.

## Documentation updates

Implementation updated:

- README provider status and Phase table.
- `PROJECT_PLAN.md` provider route.
- `INTERNAL_DESIGN.md` phase table and provider limitations.
- `ARCHITECTURE.md` provider diagnostics boundary.
- `EXTENSION_POINTS.md` provider extension guidance.
- `protocol/README.md` with an explicit note that Phase68 adds no JSON-RPC methods.
- `examples/config/provider.env.example` with optional model remove env vars.

## Boundaries

- Model remove is a TS Host CLI action, not a model runtime feature.
- Model remove does not affect `ModelRequest.model`.
- Provider selection remains env-driven and explicit.
- Fake provider remains the default.
- `doctor` remains offline by default.
- Phase66 model discovery remains separate and explicit.
- Phase67 model pull remains separate from model remove.
- Local daemon lifecycle remains separate from model remove.
- JSON-RPC wire contract remains unchanged.

## Phase601 lifecycle integration

Phase601 preserves the Phase68 remove command, timeout/kill policy, log path, exit evidence, and report schema. Spawn/process errors remain primary across log descriptor close failure; successful remove plus cleanup uncertainty reuses the existing check with `local provider log cleanup failed`. A close throw in the child terminal callback can no longer escape or leave the remove promise pending.

## Validation target

- `npm test -- cliProviderContract.test.ts --run`
- `npm run build`
- `./tools/run-cli-smoke.sh`
- `./tools/check.sh`
