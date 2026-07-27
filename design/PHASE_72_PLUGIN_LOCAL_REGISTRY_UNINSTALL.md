# Phase 72: Plugin / Skill local registry uninstall command

Phase72 implements an explicit local registry uninstall command for Plugin / Skill packages. Phase37 added local registry read/list/inspect support and Phase71 added a safe local registry install writer. This phase closes the local lifecycle gap where removing an installed registry entry required hand-editing JSON.

The first implementation is local-only, dry-run by default, registry-validated, and TS Host CLI-only.

## Goals

- Add a CLI command that removes one plugin / skill entry from a local registry file by id.
- Keep the command dry-run by default; real writes require `--yes`.
- Reuse the existing Phase37 registry shape and Phase71 registry file resolution semantics.
- Preserve unrelated registry entries and unknown top-level registry fields.
- Provide deterministic text output for humans and JSON output for tooling.
- Keep uninstall scoped to registry membership only: unregister the package without deleting package files.
- Sanitize diagnostics and avoid printing raw registry JSON, environment values, package file contents, plugin stdout / stderr, or stack traces.
- Keep default `run`, `repl`, `tools list`, plugin runtime loading, and Python JSON-RPC behavior unchanged.
- Avoid executing plugin-owned runtime code during uninstall.

## Non-goals

- No remote marketplace uninstall, catalog sync, or package update flow.
- No package directory deletion.
- No dependency removal, `npm uninstall`, install scripts, uninstall scripts, or lifecycle hooks.
- No plugin runtime execution during uninstall.
- No persistent plugin daemon or system-level sandbox runtime.
- No automatic scan of user directories, workspace directories, or project manifests.
- No shell rc modification or global environment mutation.
- No Python Engine, provider, transcript, MCP, or JSON-RPC method changes.

## Current state

Existing Plugin / Skill registry surfaces:

```text
god-code plugins list
god-code plugins inspect <plugin_id>
god-code plugins install <plugin_or_skill_dir>
```

Existing configuration entry:

```text
GOD_CODE_PLUGIN_REGISTRY_FILE=<path-to-registry.json>
```

Current limitation:

- The local registry can now be written by install, but removing an entry still requires manual JSON editing.
- Disabling a plugin can be approximated by hand-editing `enabled`, but there is no safe CLI for removing stale or replaced ids.
- There is no dry-run mutation preview for registry removal.

## Implemented CLI surface

Add a local uninstall command under the existing `plugins` namespace:

```bash
god-code plugins uninstall <plugin_id> --registry-file <path> --dry-run
god-code plugins uninstall <plugin_id> --registry-file <path> --yes
god-code plugins uninstall <plugin_id> --registry-file <path> --yes --json
```

Implemented flags:

- `--registry-file <path>`: explicit registry JSON file to read and update.
- `--dry-run`: preview the planned removal without writing. This remains the default.
- `--yes`: confirm the registry write.
- `--json`: emit structured output.
- `--missing-ok`: treat a missing id as a successful no-op.

Rules:

- `--dry-run` and `--yes` are mutually exclusive.
- `--registry-file` may be omitted only when `GOD_CODE_PLUGIN_REGISTRY_FILE` is set.
- No hidden default registry file is introduced in Phase72.
- The command accepts a plugin / skill id, not a path or remote identifier.
- The command reads and mutates only the registry file; it never loads or runs plugin runtime code.

## Implemented registry mutation semantics

The command should:

1. Resolve the registry file path from `--registry-file` or `GOD_CODE_PLUGIN_REGISTRY_FILE`.
2. Load the existing registry JSON.
3. Validate that the root is an object and `plugins` is an array.
4. Validate that entries are objects with non-empty string `id` and `path` fields.
5. Find the entry by exact plugin id.
6. Plan one deterministic action:
   - `remove_entry`
   - `not_found`
   - `no_op`
7. Preserve all unrelated entries, entry order, and unknown top-level registry fields.
8. Write formatted JSON only when `--yes` is present and the action changes the file.

Missing id behavior:

- Without `--missing-ok`, a missing id is an error.
- With `--missing-ok`, a missing id returns `action="no_op"`, `changed=false`, and success.

Registry file behavior:

- A missing registry file is an error, even with `--missing-ok`, because there is no authoritative registry to edit.
- Invalid JSON or unsupported registry shape is an error.
- Duplicate registry ids should remain an error, matching Phase37 / Phase71 registry validation.

## Output shape

Text output should be concise:

```text
GOD-code plugin registry uninstall:
registry_file: .god-code/plugin-registry.json
id: demo-plugin
removed_path: examples/plugins/demo-plugin
enabled: true
tags: local,demo
action: remove_entry
dry_run: true
changed: true
```

JSON output should be stable:

```json
{
  "type": "plugin_local_registry_uninstall",
  "registry_file": ".god-code/plugin-registry.json",
  "id": "demo-plugin",
  "removed_path": "examples/plugins/demo-plugin",
  "enabled": true,
  "tags": ["local", "demo"],
  "action": "remove_entry",
  "changed": true,
  "dry_run": true
}
```

For `--missing-ok` no-op:

```json
{
  "type": "plugin_local_registry_uninstall",
  "registry_file": ".god-code/plugin-registry.json",
  "id": "missing-plugin",
  "removed_path": null,
  "enabled": null,
  "tags": [],
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
ts-host CLI plugins uninstall
  -> resolve registry file
  -> load and validate local registry JSON
  -> plan local registry entry removal
  -> render dry-run output or write registry file with --yes
```

No Phase72 state enters:

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

god-code plugins uninstall demo-plugin \
  --registry-file .god-code/plugin-registry.json \
  --dry-run

god-code plugins uninstall demo-plugin \
  --registry-file .god-code/plugin-registry.json \
  --yes

GOD_CODE_PLUGIN_REGISTRY_FILE=.god-code/plugin-registry.json \
  god-code plugins list --json
```

`plugins uninstall` only removes the registry entry. It does not remove the package directory and does not change any runtime state that has already been loaded by another process.

## Error handling and sanitization

Local errors:

- Missing plugin id argument.
- Missing registry file flag and missing `GOD_CODE_PLUGIN_REGISTRY_FILE`.
- Registry file does not exist.
- Invalid registry JSON or unsupported registry shape.
- Duplicate plugin id in registry.
- Plugin id not found without `--missing-ok`.
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

- `plugins uninstall <id> --registry-file <path> --dry-run` reports planned removal without writing.
- `plugins uninstall <id> --registry-file <path> --yes` removes exactly one registry entry.
- Unknown top-level fields and unrelated entries are preserved.
- Missing id fails by default.
- Missing id with `--missing-ok` returns successful no-op.
- Missing registry file fails even with `--missing-ok`.
- Duplicate ids fail before mutation.
- `--dry-run` and `--yes` are mutually exclusive.
- Invalid registry JSON produces sanitized errors.
- Plugin runtime code is not executed during uninstall.
- Smoke test installs a demo plugin into a temporary registry, uninstalls it, then verifies `plugins list --json` no longer reports it.

## Verification

- `npm run build` passes.
- Plugin CLI tests cover dry-run, confirmed write, missing id, `--missing-ok`, duplicate handling, and sanitized errors.
- `./tools/run-cli-smoke.sh` includes a local registry uninstall flow.
- `./tools/check.sh` passes.
- README and route docs describe that this is a registry unregister command, not package deletion or lifecycle script execution.
