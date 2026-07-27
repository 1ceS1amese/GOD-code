# Phase 69: Local provider model prune command

Phase69 implements an explicit local model/cache prune command for `local-openai-compatible` workflows. Phase66 added model discovery, Phase67 added model pull/install, and Phase68 added model remove/delete. This phase defines a safer, target-scoped prune boundary without adding runtime-native APIs, automatic cache quota management, background cleanup, or JSON-RPC methods.

The first implementation is explicit, local-only, dry-run by default, target-gated for confirmed execution, and diagnostic-first.

## Goals

- Add an explicit CLI surface for local model/cache prune actions.
- Keep prune process execution in the TS Host CLI layer.
- Require opt-in config and explicit confirmation for real prune execution.
- Default to dry-run behavior.
- Require an explicit prune target so broad cleanup is never implicit.
- Support generic command templates instead of hardcoding Ollama / llama.cpp APIs.
- Keep Phase66 model discovery as the explicit verification path before or after pruning.
- Keep diagnostics sanitized and avoid printing tokens, full command args, raw logs, or full env values.
- Keep default `god-code run`, `god-code repl`, `doctor`, fake provider, and provider HTTP behavior unchanged.
- Avoid Python Engine, provider client, transcript, MCP, plugin, or JSON-RPC changes.

## Non-goals

- No Ollama-native, llama.cpp-native, vLLM-native, LM Studio-native, Hugging Face-native, or vendor-specific prune API in Phase69.
- No automatic model selection or mutation of `GOD_CODE_MODEL`.
- No automatic prune from `run`, `repl`, default `doctor`, `local-models list`, `local-models pull`, or `local-models remove`.
- No disk quota manager, LRU cache policy, scheduled cleanup, or background cleanup daemon.
- No direct filesystem deletion by GOD-code.
- No remote provider model/cache deletion.
- No system package removal, runtime uninstall, GPU/runtime teardown, or service deregistration.
- No JSON-RPC method changes.

## Current state

Existing local provider workflow:

```text
god-code provider local-daemon status/start/stop
god-code provider local-models list
god-code provider local-models list --require-configured-model
god-code provider local-models pull <model> --dry-run
god-code provider local-models pull <model> --yes
god-code provider local-models remove <model> --dry-run
god-code provider local-models remove <model> --yes
```

Current limitation:

- Users can discover, pull, and remove individual local models through explicit local-provider workflows.
- Users cannot run a GOD-code mediated local cache/model prune step.
- If a runtime has a prune command, users must run it outside GOD-code without the same dry-run / confirmed execution boundary.

## Implemented CLI surface

Add a prune subcommand under the existing local model namespace:

```bash
god-code provider local-models prune --target unused --dry-run
god-code provider local-models prune --target unused --dry-run --json
god-code provider local-models prune --target unused --yes
god-code provider local-models prune --target unused --yes --json
```

Rules:

- The command is only valid for `GOD_CODE_PROVIDER=local-openai-compatible`.
- `prune` defaults to dry-run unless `--yes` is present.
- `--dry-run` and `--yes` are mutually exclusive.
- `--target <target>` is required.
- `<target>` is a bounded identifier, not a filesystem path.
- Real execution with `--yes` requires `GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS` to include the requested target.
- The command does not mutate `GOD_CODE_MODEL`.
- The command does not start or stop local daemons.
- The command does not call Phase66 discovery automatically in Phase69; users can run `local-models list` before or after.

Example dry-run output:

```text
GOD-code local provider model prune:
OK local_provider_model_prune: dry-run: local provider model prune would be executed
  provider: local-openai-compatible
  target: unused
  target_allowed: true
  command_configured: true
  command_basename: ollama
  args_count: 2
  log_file: .god-code/local-provider-model-prune.log
  timeout_ms: 600000
```

Example JSON output:

```json
{
  "ok": true,
  "checks": [
    {
      "name": "local_provider_model_prune",
      "status": "ok",
      "message": "dry-run: local provider model prune would be executed",
      "details": {
        "provider": "local-openai-compatible",
        "target": "unused",
        "target_allowed": true,
        "command_configured": true,
        "command_basename": "ollama",
        "args_count": 2,
        "log_file": ".god-code/local-provider-model-prune.log",
        "timeout_ms": 600000
      }
    }
  ]
}
```

## Implemented config surface

Environment variables:

```text
GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED
GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND
GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE
GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_CWD
GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_TIMEOUT_MS
GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_LOG_FILE
GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENV_ALLOWLIST
GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS
```

Defaults:

- `GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED=false`
- `GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND` unset
- `GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE` unset
- `GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_CWD` unset
- `GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_TIMEOUT_MS=600000`
- `GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_LOG_FILE=<cwd>/.god-code/local-provider-model-prune.log`
- `GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENV_ALLOWLIST` unset
- `GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS` unset

Example:

```bash
export GOD_CODE_PROVIDER=local-openai-compatible
export GOD_CODE_MODEL=llama3.1
export GOD_CODE_BASE_URL=http://127.0.0.1:11434/v1

export GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED=true
export GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND=ollama
export GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE='["prune","--target","{target}"]'
export GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS=unused

god-code provider local-models prune --target unused --dry-run --json
god-code provider local-models prune --target unused --yes --json
god-code provider local-models list --json
```

Validation rules:

- Prune config is ignored unless `GOD_CODE_PROVIDER=local-openai-compatible`.
- `MODEL_PRUNE_ENABLED=true` requires command and args template.
- `ARGS_TEMPLATE` must be a JSON array of strings.
- At least one args-template entry must contain `{target}`.
- Target names must be non-empty, bounded, free of control characters, and not look like paths.
- `--yes` requires `GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS` to include the target.
- The command is spawned with `shell=false`; shell metacharacters are not interpreted by GOD-code.
- `CWD`, when set, must resolve under the current workspace unless a future explicit allowlist is added.
- `LOG_FILE` must resolve under the current workspace by default.
- `TIMEOUT_MS` must be a positive bounded integer.
- `ENV_ALLOWLIST` must contain environment variable names only.

## Runtime boundary

Model prune commands stay in TS Host:

```text
ts-host CLI provider local-models prune
  -> parse local provider env
  -> validate local provider family
  -> validate prune command config
  -> validate target and allowed-target gate
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

No prune state enters:

- `initialize`
- `create_session`
- `submit_turn`
- `ModelRequest`
- transcript JSONL
- provider HTTP clients
- tool execution payloads
- MCP/plugin payloads

## Execution behavior

`prune --target <target> --dry-run`:

- validates local provider family and prune config;
- validates target shape and reports whether the target is allowed for real execution;
- renders command shape and log path;
- does not spawn a process;
- does not create a log file;
- does not contact `/models`.

`prune --target <target> --yes`:

- validates local provider family and prune config;
- requires the target to be listed in `GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS`;
- creates the log directory if needed;
- substitutes `{target}` into the args template;
- spawns the command with `shell=false`;
- passes only allowlisted environment variables when allowlist is configured;
- redirects stdout/stderr to the configured log file;
- waits up to `TIMEOUT_MS`;
- returns sanitized status, exit code, signal, duration, and log path.

Phase69 should not:

- stream raw prune logs to stdout by default;
- print raw command args if they may contain secrets;
- infer success by parsing runtime-specific log text;
- delete filesystem model paths directly;
- remove named models directly; Phase68 remains the individual model remove path;
- auto-start or stop a local daemon before or after pruning.

## Interaction with Phase66 discovery, Phase67 pull, and Phase68 remove

Recommended manual flow:

```bash
god-code provider local-models list --json
god-code provider local-models prune --target unused --dry-run --json
god-code provider local-models prune --target unused --yes --json
god-code provider local-models list --json
```

Phase69 keeps verification explicit:

- `prune` does not automatically call `local-models list`.
- `prune` does not change `GOD_CODE_MODEL`.
- `prune` can be used even if the local daemon is not currently running, because some runtimes prune caches without serving HTTP.
- If pruning removes a configured model indirectly, a later `local-models list --require-configured-model` or provider health check should surface the mismatch.

## Error handling and sanitization

Errors should be structured and safe:

- Non-local provider: `local model prune requires GOD_CODE_PROVIDER=local-openai-compatible`.
- Disabled prune config: report that model prune is disabled.
- Missing command/template: report missing env names.
- Invalid template: report shape error without raw template content.
- Missing target: report that `--target` is required.
- Invalid target name: report validation reason.
- Disallowed target with `--yes`: report that the target is not in `GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS`.
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
- Report disabled prune config by default.
- Require command and args template when enabled.
- Reject invalid args template JSON.
- Reject template without `{target}`.
- Require `--target`.
- Validate target bounds, control-character rejection, and path-like value rejection.
- Allow dry-run to render command shape without spawning.
- Require allowed target config for `--yes`.
- Reject `--yes` when the requested target is not allowlisted.
- Dry-run renders command basename, target, target-allowed status, and args count without raw args.
- `--yes` executes a deterministic fixture command with the target substituted.
- Success returns exit code, duration, and log path without raw log content.
- Non-zero exit returns error status with log path.
- Timeout returns error status and does not hang.
- Env allowlist passes only allowed variables plus minimal PATH when needed.
- JSON/text output does not leak secret-looking args or env values.

Smoke tests:

- `provider local-models prune --target unused --dry-run --json` with fixture config.
- `provider local-models prune --target unused --yes --json` with a deterministic local fixture command.
- Non-local provider error path.

## Documentation updates

Implementation updated:

- README provider status and Phase table.
- `PROJECT_PLAN.md` provider route.
- `INTERNAL_DESIGN.md` phase table and provider limitations.
- `ARCHITECTURE.md` provider diagnostics boundary.
- `EXTENSION_POINTS.md` provider extension guidance.
- `protocol/README.md` with an explicit note that Phase69 adds no JSON-RPC methods.
- `examples/config/provider.env.example` with optional model prune env vars.

## Boundaries

- Model prune is a TS Host CLI action, not a model runtime feature.
- Model prune does not affect `ModelRequest.model`.
- Provider selection remains env-driven and explicit.
- Fake provider remains the default.
- `doctor` remains offline by default.
- Phase66 model discovery remains separate and explicit.
- Phase67 model pull remains separate from prune.
- Phase68 model remove remains separate from prune.
- Local daemon lifecycle remains separate from prune.
- JSON-RPC wire contract remains unchanged.

## Phase601 lifecycle integration

Phase601 preserves the Phase69 prune command, target authority, timeout/kill policy, log path, exit evidence, and report schema. Spawn/process errors remain primary across log descriptor close failure; successful prune plus cleanup uncertainty reuses the existing check with `local provider log cleanup failed`. A close throw in the child terminal callback can no longer escape or leave the prune promise pending.

## Validation target

- `npm test -- cliProviderContract.test.ts --run`
- `npm run build`
- `./tools/run-cli-smoke.sh`
- `./tools/check.sh`
