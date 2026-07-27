# Phase 73: Plugin / Skill local registry enable / disable command

Phase73 implements explicit local registry enable / disable commands for Plugin / Skill packages. Phase37 added local registry read/list/inspect support, Phase71 added a safe registry install writer, and Phase72 added a safe registry uninstall writer. This phase closes the local lifecycle gap where toggling the existing `enabled` field required hand-editing registry JSON.

The first implementation is local-only, dry-run by default, registry-validated, and TS Host CLI-only.

## Goals

- Add CLI commands that enable or disable one plugin / skill entry in a local registry file by id.
- Keep commands dry-run by default; real writes require `--yes`.
- Reuse the existing Phase37 registry shape and Phase71 / Phase72 registry file resolution semantics.
- Preserve unrelated registry entries, entry order, entry metadata, tags, paths, and unknown top-level registry fields.
- Treat missing `enabled` as effectively `true`, matching existing Phase37 runtime semantics.
- Provide deterministic text output for humans and JSON output for tooling.
- Keep enable / disable scoped to registry membership state only.
- Sanitize diagnostics and avoid printing raw registry JSON, environment values, package file contents, plugin stdout / stderr, or stack traces.
- Keep default `run`, `repl`, `tools list`, plugin runtime loading, and Python JSON-RPC behavior unchanged.
- Avoid executing plugin-owned runtime code during enable / disable.

## Non-goals

- No package install, uninstall, deletion, download, or update.
- No remote marketplace, catalog sync, or package search.
- No dependency installation or removal.
- No install scripts, uninstall scripts, enable scripts, disable scripts, or lifecycle hooks.
- No plugin runtime execution during enable / disable.
- No persistent plugin daemon or system-level sandbox runtime.
- No automatic scan of user directories, workspace directories, or project manifests.
- No shell rc modification or global environment mutation.
- No Python Engine, provider, transcript, MCP, or JSON-RPC method changes.

## Current state

Existing Plugin / Skill registry lifecycle surfaces:

```text
god-code plugins list
god-code plugins inspect <plugin_id>
god-code plugins install <plugin_or_skill_dir>
god-code plugins uninstall <plugin_id>
```

Existing configuration entry:

```text
GOD_CODE_PLUGIN_REGISTRY_FILE=<path-to-registry.json>
```

Current limitation:

- Registry entries already support `enabled`.
- Phase71 can choose initial enabled state during install.
- Phase72 can remove an entry.
- But changing enabled state after installation still requires manually editing JSON.

## Implemented CLI surface

Add enable / disable commands under the existing `plugins` namespace:

```bash
god-code plugins enable <plugin_id> --registry-file <path> --dry-run
god-code plugins enable <plugin_id> --registry-file <path> --yes
god-code plugins enable <plugin_id> --registry-file <path> --yes --json

god-code plugins disable <plugin_id> --registry-file <path> --dry-run
god-code plugins disable <plugin_id> --registry-file <path> --yes
god-code plugins disable <plugin_id> --registry-file <path> --yes --json
```

Implemented flags:

- `--registry-file <path>`: explicit registry JSON file to read and update.
- `--dry-run`: preview the planned state change without writing. This remains the default.
- `--yes`: confirm the registry write.
- `--json`: emit structured output.

Rules:

- `--dry-run` and `--yes` are mutually exclusive.
- `--registry-file` may be omitted only when `GOD_CODE_PLUGIN_REGISTRY_FILE` is set.
- No hidden default registry file is introduced in Phase73.
- The command accepts a plugin / skill id, not a path or remote identifier.
- Missing plugin id is an error.
- Missing registry file is an error.
- Missing registry entry is an error.
- The command reads and mutates only the registry file; it never loads or runs plugin runtime code.

## Implemented registry mutation semantics

The command should:

1. Resolve the registry file path from `--registry-file` or `GOD_CODE_PLUGIN_REGISTRY_FILE`.
2. Load the existing registry JSON.
3. Validate that the root is an object and `plugins` is an array.
4. Validate that entries are objects with non-empty string `id` and `path` fields.
5. Find the entry by exact plugin id.
6. Derive previous effective state:
   - `enabled === false` means disabled.
   - missing `enabled` or `enabled === true` means enabled.
7. Plan one deterministic action:
   - `enable_entry`
   - `disable_entry`
   - `no_op`
8. Preserve all unrelated entries, entry order, unknown entry fields, and unknown top-level registry fields.
9. Write formatted JSON only when `--yes` is present and the desired state differs from the effective current state.

State writing rules:

- Disabling writes `enabled: false`.
- Enabling writes `enabled: true` when the existing entry is disabled.
- Enabling an entry whose `enabled` field is missing is a no-op because it is already effectively enabled.
- Existing `tags`, `path`, and unknown entry fields are preserved.

Duplicate registry ids should remain an error, matching Phase37 / Phase71 / Phase72 registry validation.

## Output shape

Text output should be concise:

```text
GOD-code plugin registry state:
registry_file: .god-code/plugin-registry.json
id: demo-plugin
path: examples/plugins/demo-plugin
previous_enabled: false
enabled: true
action: enable_entry
dry_run: true
changed: true
```

JSON output should be stable:

```json
{
  "type": "plugin_local_registry_set_enabled",
  "registry_file": ".god-code/plugin-registry.json",
  "id": "demo-plugin",
  "path": "examples/plugins/demo-plugin",
  "previous_enabled": false,
  "enabled": true,
  "tags": ["local", "demo"],
  "action": "enable_entry",
  "changed": true,
  "dry_run": true
}
```

For no-op:

```json
{
  "type": "plugin_local_registry_set_enabled",
  "registry_file": ".god-code/plugin-registry.json",
  "id": "demo-plugin",
  "path": "examples/plugins/demo-plugin",
  "previous_enabled": true,
  "enabled": true,
  "tags": ["local", "demo"],
  "action": "no_op",
  "changed": false,
  "dry_run": true
}
```

The output should not include:

- raw registry JSON
- package file contents
- environment variable values
- plugin executable stdout / stderr
- stack traces

## Runtime boundary

The planned flow stays inside the TS Host CLI:

```text
ts-host CLI plugins enable/disable
  -> resolve registry file
  -> load and validate local registry JSON
  -> plan local registry enabled-state mutation
  -> render dry-run output or write registry file with --yes
```

No Phase73 state enters:

- Python Engine runtime
- `initialize`
- `create_session`
- `submit_turn`
- provider clients
- transcript JSONL
- MCP payloads
- plugin runtime execution
- `HostToolRegistry.executeRequest(...)`

## Interaction with existing commands

Expected user flow after implementation:

```bash
god-code plugins install examples/plugins/demo-plugin \
  --registry-file .god-code/plugin-registry.json \
  --yes

god-code plugins disable demo-plugin \
  --registry-file .god-code/plugin-registry.json \
  --dry-run

god-code plugins disable demo-plugin \
  --registry-file .god-code/plugin-registry.json \
  --yes

god-code plugins enable demo-plugin \
  --registry-file .god-code/plugin-registry.json \
  --yes

GOD_CODE_PLUGIN_REGISTRY_FILE=.god-code/plugin-registry.json \
  god-code plugins list --json
```

`plugins enable` / `plugins disable` only change the registry entry's enabled state. They do not load or unload runtime state in already-running processes.

## Error handling and sanitization

Local errors:

- Missing plugin id argument.
- Missing registry file flag and missing `GOD_CODE_PLUGIN_REGISTRY_FILE`.
- Registry file does not exist.
- Invalid registry JSON or unsupported registry shape.
- Duplicate plugin id in registry.
- Plugin id not found.
- Mutually exclusive flags used together.
- Registry write failure.

Diagnostics should include sanitized registry path and plugin id where useful, but should not dump full file contents.

## Implementation touch points

Implemented code areas:

- `ts-host/src/cli/plugins.ts`
- `ts-host/src/cli/main.ts`
- `ts-host/test/cliMcpPlugins.test.ts`
- `tools/run-cli-smoke.sh`

Docs kept in sync:

- `README.md`
- `PROJECT_PLAN.md`
- `INTERNAL_DESIGN.md`
- `ARCHITECTURE.md`
- `EXTENSION_POINTS.md`
- `protocol/README.md`

## Test coverage

- `plugins disable <id> --registry-file <path> --dry-run` reports planned disable without writing.
- `plugins disable <id> --registry-file <path> --yes` writes `enabled: false`.
- `plugins enable <id> --registry-file <path> --dry-run` reports planned enable without writing.
- `plugins enable <id> --registry-file <path> --yes` writes `enabled: true`.
- Enabling an already enabled entry is a no-op.
- Disabling an already disabled entry is a no-op.
- Missing `enabled` is treated as effectively enabled.
- Unknown top-level fields, unknown entry fields, tags, path, and unrelated entries are preserved.
- Missing id fails.
- Missing registry file fails.
- Duplicate ids fail before mutation.
- `--dry-run` and `--yes` are mutually exclusive.
- Invalid registry JSON produces sanitized errors.
- Plugin runtime code is not executed during enable / disable.
- Smoke test installs a demo plugin into a temporary registry, disables it, verifies `plugins list --json` reports disabled, enables it, then verifies it reports enabled.

## Verification

- `npm run build` passes.
- Plugin CLI tests cover dry-run, confirmed write, no-op, missing id, duplicate handling, and sanitized errors.
- `./tools/run-cli-smoke.sh` includes a local registry enable / disable flow.
- `./tools/check.sh` passes.
- README and route docs describe that this is a registry state toggle, not runtime hot-load / unload or lifecycle script execution.
