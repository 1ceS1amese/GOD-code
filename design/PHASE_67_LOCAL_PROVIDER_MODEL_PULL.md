# Phase 67: Local provider model pull command

Phase67 implements an explicit local model pull command for `local-openai-compatible` workflows. Phase57 added the local OpenAI-compatible provider family, Phase65 added local daemon lifecycle commands, and Phase66 added model discovery through OpenAI-compatible `GET /models`. This phase defines how GOD-code can run a user-configured local model pull/install command without adding provider-native APIs, changing provider selection, or adding JSON-RPC methods.

The first implementation is explicit, local-only, dry-run by default, and diagnostic-first.

## Goals

- Add an explicit CLI surface for local model pull/install actions.
- Keep model pull process execution in the TS Host CLI layer.
- Require opt-in config and explicit confirmation for real execution.
- Default to dry-run behavior.
- Support generic command templates instead of hardcoding Ollama / llama.cpp APIs.
- Keep Phase66 model discovery as the verification path after a pull.
- Keep diagnostics sanitized and avoid printing tokens, full command args, or raw logs.
- Keep default `god-code run`, `god-code repl`, `doctor`, fake provider, and provider HTTP behavior unchanged.
- Avoid Python Engine, provider client, transcript, MCP, plugin, or JSON-RPC changes.

## Non-goals

- No Ollama-native, llama.cpp-native, vLLM-native, LM Studio-native, or vendor-specific HTTP API in Phase67.
- No automatic model selection or mutation of `GOD_CODE_MODEL`.
- No automatic model pull from `run`, `repl`, default `doctor`, or Phase66 `local-models list`.
- No model deletion, pruning, cache management, or disk quota management.
- No system package installation, runtime installation, GPU/runtime setup, or service registration.
- No remote provider model installation.
- No background pull daemon or long-running job queue.
- No provider billing, model pricing, context-window discovery, or tokenizer download.
- No JSON-RPC method changes.

## Current state

Current local provider flow:

```text
GOD_CODE_PROVIDER=local-openai-compatible
  -> POST <base_url>/chat/completions
```

Previous local support:

```text
god-code provider local-daemon status/start/stop
god-code provider local-models list
god-code provider local-models list --require-configured-model
```

Previous limitation:

- Users can discover models exposed by a running local OpenAI-compatible server.
- If a model is missing, GOD-code cannot run a configured local pull/install command.
- Users must manually run runtime-specific commands outside GOD-code.

## Implemented CLI surface

Add a model pull subcommand under the existing local model namespace:

```bash
god-code provider local-models pull <model> --dry-run
god-code provider local-models pull <model> --dry-run --json
god-code provider local-models pull <model> --yes
god-code provider local-models pull <model> --yes --json
```

Rules:

- The command is only valid for `GOD_CODE_PROVIDER=local-openai-compatible`.
- `pull` defaults to dry-run unless `--yes` is present.
- `--dry-run` and `--yes` are mutually exclusive.
- `<model>` is passed as a single argument substitution value, never through shell interpolation.
- The command does not mutate `GOD_CODE_MODEL`.
- The command does not start or stop local daemons.
- The command does not call Phase66 discovery automatically in Phase67; users can run `local-models list` before or after.

Example dry-run output:

```text
GOD-code local provider model pull:
OK local_provider_model_pull: dry-run: local provider model pull would be executed
  provider: local-openai-compatible
  model: llama3.1
  command_configured: true
  command_basename: ollama
  args_count: 2
  log_file: .god-code/local-provider-model-pull.log
  timeout_ms: 600000
```

Example JSON output:

```json
{
  "ok": true,
  "checks": [
    {
      "name": "local_provider_model_pull",
      "status": "ok",
      "message": "dry-run: local provider model pull would be executed",
      "details": {
        "provider": "local-openai-compatible",
        "model": "llama3.1",
        "command_configured": true,
        "command_basename": "ollama",
        "args_count": 2,
        "log_file": ".god-code/local-provider-model-pull.log",
        "timeout_ms": 600000
      }
    }
  ]
}
```

## Implemented config surface

Environment variables:

```text
GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENABLED
GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND
GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE
GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_CWD
GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_TIMEOUT_MS
GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_LOG_FILE
GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENV_ALLOWLIST
```

Defaults:

- `GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENABLED=false`
- `GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND` unset
- `GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE` unset
- `GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_CWD` unset
- `GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_TIMEOUT_MS=600000`
- `GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_LOG_FILE=<cwd>/.god-code/local-provider-model-pull.log`
- `GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENV_ALLOWLIST` unset

Example:

```bash
export GOD_CODE_PROVIDER=local-openai-compatible
export GOD_CODE_MODEL=llama3.1
export GOD_CODE_BASE_URL=http://127.0.0.1:11434/v1

export GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENABLED=true
export GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND=ollama
export GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE='["pull","{model}"]'

god-code provider local-models pull llama3.1 --dry-run --json
god-code provider local-models pull llama3.1 --yes --json
god-code provider local-models list --require-configured-model --json
```

Validation rules:

- Pull config is ignored unless `GOD_CODE_PROVIDER=local-openai-compatible`.
- `MODEL_PULL_ENABLED=true` requires command and args template.
- `ARGS_TEMPLATE` must be a JSON array of strings.
- At least one args-template entry must contain `{model}`.
- Model names must be non-empty, bounded, and free of control characters.
- The command is spawned with `shell=false`; shell metacharacters are not interpreted by GOD-code.
- `CWD`, when set, must resolve under the current workspace unless a future explicit allowlist is added.
- `LOG_FILE` must resolve under the current workspace by default.
- `TIMEOUT_MS` must be a positive bounded integer.
- `ENV_ALLOWLIST` must contain environment variable names only.

## Runtime boundary

Model pull commands stay in TS Host:

```text
ts-host CLI provider local-models pull
  -> parse local provider env
  -> validate local provider family
  -> validate pull command config
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

No pull state enters:

- `initialize`
- `create_session`
- `submit_turn`
- `ModelRequest`
- transcript JSONL
- provider HTTP clients
- tool execution payloads
- MCP/plugin payloads

## Execution behavior

`pull <model> --dry-run`:

- validates local provider family and pull config;
- renders command shape and log path;
- does not spawn a process;
- does not create a log file;
- does not contact `/models`.

`pull <model> --yes`:

- validates local provider family and pull config;
- creates the log directory if needed;
- substitutes `{model}` into the args template;
- spawns the command with `shell=false`;
- passes only allowlisted environment variables when allowlist is configured;
- redirects stdout/stderr to the configured log file;
- waits up to `TIMEOUT_MS`;
- returns sanitized status, exit code, signal, duration, and log path.

Phase67 should not:

- stream raw pull logs to stdout by default;
- print raw command args if they may include secrets;
- infer success by parsing runtime-specific log text;
- stop or kill unrelated processes;
- auto-start a local daemon before or after pull.

## Interaction with Phase66 model discovery

Recommended manual flow:

```bash
god-code provider local-models list --json
god-code provider local-models pull llama3.1 --dry-run --json
god-code provider local-models pull llama3.1 --yes --json
god-code provider local-models list --require-configured-model --json
```

Phase67 keeps verification explicit:

- `pull` does not automatically call `local-models list`.
- `pull` does not change `GOD_CODE_MODEL`.
- `pull` can be used even if the local daemon is not currently running, because some runtimes pull models without serving HTTP.

## Error handling and sanitization

Errors should be structured and safe:

- Non-local provider: `local model pull requires GOD_CODE_PROVIDER=local-openai-compatible`.
- Disabled pull config: report that model pull is disabled.
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
- Report disabled pull config by default.
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

- `provider local-models pull <model> --dry-run --json` with fixture config.
- `provider local-models pull <model> --yes --json` with a deterministic local fixture command.
- Non-local provider error path.

## Documentation updates

Implementation updated:

- README provider status and Phase table.
- `PROJECT_PLAN.md` provider route.
- `INTERNAL_DESIGN.md` phase table and provider limitations.
- `ARCHITECTURE.md` provider diagnostics boundary.
- `EXTENSION_POINTS.md` provider extension guidance.
- `protocol/README.md` with an explicit note that Phase67 adds no JSON-RPC methods.
- `examples/config/provider.env.example` with optional model pull env vars.

## Boundaries

- Model pull is a TS Host CLI action, not a model runtime feature.
- Model pull does not affect `ModelRequest.model`.
- Provider selection remains env-driven and explicit.
- Fake provider remains the default.
- `doctor` remains offline by default.
- Phase66 model discovery remains separate and explicit.
- Local daemon lifecycle remains separate from model pull.
- JSON-RPC wire contract remains unchanged.

## Phase601 lifecycle integration

Phase601 preserves the Phase67 pull command, timeout/kill policy, log path, exit evidence, and report schema. Spawn/process errors remain primary across log descriptor close failure; successful pull plus cleanup uncertainty reuses the existing check with `local provider log cleanup failed`. A close throw in the child terminal callback can no longer escape or leave the pull promise pending.

## Validation target

- `npm test -- cliProviderContract.test.ts --run`
- `npm run build`
- `./tools/run-cli-smoke.sh`
- `./tools/check.sh`
