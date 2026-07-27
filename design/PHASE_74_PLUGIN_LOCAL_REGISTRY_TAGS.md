# Phase 74: Plugin / Skill local registry tags command

Phase74 implements an explicit local registry tags command for Plugin / Skill packages. Phase37 added local registry read/list/inspect support with a `tags` field, Phase71 added install-time tags, Phase72 added uninstall, and Phase73 added enable / disable. Phase74 closes the remaining local lifecycle gap by allowing registry tags to change after installation without hand-editing JSON.

This phase is a TS Host CLI implementation. It only edits local registry metadata and does not execute plugin runtime code.

## Goals

- Add a CLI command that updates tags for one plugin / skill entry in a local registry file by id.
- Keep the command dry-run by default; real writes require `--yes`.
- Reuse the existing Phase37 registry shape and Phase71 / Phase72 / Phase73 registry file resolution semantics.
- Preserve unrelated registry entries, entry order, paths, enabled state, and unknown top-level / entry fields.
- Use the same tag validation as Phase71 install tags.
- Provide deterministic text output for humans and JSON output for tooling.
- Keep tag changes scoped to registry metadata only.
- Sanitize diagnostics and avoid printing raw registry JSON, environment values, package file contents, plugin stdout / stderr, or stack traces.
- Keep default `run`, `repl`, `tools list`, plugin runtime loading, and Python JSON-RPC behavior unchanged.
- Avoid executing plugin-owned runtime code during tag updates.

## Non-goals

- No package install, uninstall, deletion, download, or update.
- No remote marketplace, catalog sync, tag search, package search, or remote metadata sync.
- No dependency installation or removal.
- No install scripts, uninstall scripts, tag hooks, or lifecycle hooks.
- No plugin runtime execution during tag updates.
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
god-code plugins enable <plugin_id>
god-code plugins disable <plugin_id>
god-code plugins tags <plugin_id>
```

Existing configuration entry:

```text
GOD_CODE_PLUGIN_REGISTRY_FILE=<path-to-registry.json>
```

Implemented capability:

- Registry entries already support `tags`.
- Phase71 can set initial tags during install.
- `plugins list` / `plugins inspect` display tags.
- Phase74 adds `plugins tags` to add, remove, replace, or clear tags after installation.

## CLI surface

The tags command is available under the existing `plugins` namespace:

```bash
god-code plugins tags <plugin_id> --registry-file <path> --add <tag> --dry-run
god-code plugins tags <plugin_id> --registry-file <path> --remove <tag> --yes
god-code plugins tags <plugin_id> --registry-file <path> --set <tag1,tag2> --yes --json
god-code plugins tags <plugin_id> --registry-file <path> --clear --yes
```

Implemented flags:

- `--registry-file <path>`: explicit registry JSON file to read and update.
- `--add <tag>`: add one tag; may be repeated.
- `--remove <tag>`: remove one tag; may be repeated.
- `--set <tag1,tag2>`: replace the complete tag list with a comma-separated list.
- `--clear`: replace the complete tag list with an empty list.
- `--dry-run`: preview the planned tag mutation without writing. This remains the default.
- `--yes`: confirm the registry write.
- `--json`: emit structured output.

Rules:

- `--dry-run` and `--yes` are mutually exclusive.
- `--set` and `--clear` are mutually exclusive.
- `--set` / `--clear` cannot be combined with `--add` / `--remove`.
- At least one of `--add`, `--remove`, `--set`, or `--clear` is required.
- `--registry-file` may be omitted only when `GOD_CODE_PLUGIN_REGISTRY_FILE` is set.
- No hidden default registry file is introduced in Phase74.
- The command accepts a plugin / skill id, not a path or remote identifier.
- Missing plugin id is an error.
- Missing registry file is an error.
- Missing registry entry is an error.
- The command reads and mutates only the registry file; it never loads or runs plugin runtime code.

## Registry mutation semantics

The command:

1. Resolve the registry file path from `--registry-file` or `GOD_CODE_PLUGIN_REGISTRY_FILE`.
2. Load the existing registry JSON.
3. Validate that the root is an object and `plugins` is an array.
4. Validate that entries are objects with non-empty string `id` and `path` fields.
5. Validate existing and requested tags with the Phase71 tag regex:
   - `[A-Za-z0-9][A-Za-z0-9._:-]*`
6. Find the entry by exact plugin id.
7. Derive previous tags:
   - missing `tags` means `[]`.
8. Plan one deterministic action:
   - `set_tags`
   - `add_tags`
   - `remove_tags`
   - `clear_tags`
   - `no_op`
9. Preserve all unrelated entries, entry order, unknown entry fields, and unknown top-level registry fields.
10. Write formatted JSON only when `--yes` is present and the desired tag list differs from the current list.

Tag list rules:

- Tags remain ordered.
- `--add` appends tags that are not already present.
- `--remove` removes matching tags and ignores absent tags as no-op for that tag.
- `--set` normalizes duplicate requested tags while preserving first occurrence order.
- `--clear` writes an empty tag list.
- If the resulting list is unchanged, action is `no_op` and `changed=false`.

Duplicate registry ids should remain an error, matching Phase37 / Phase71 / Phase72 / Phase73 registry validation.

## Output shape

Text output is concise:

```text
GOD-code plugin registry tags:
registry_file: .god-code/plugin-registry.json
id: demo-plugin
path: examples/plugins/demo-plugin
previous_tags: local,demo
tags: local,demo,enabled
action: add_tags
dry_run: true
changed: true
```

JSON output is stable:

```json
{
  "type": "plugin_local_registry_tags",
  "registry_file": ".god-code/plugin-registry.json",
  "id": "demo-plugin",
  "path": "examples/plugins/demo-plugin",
  "previous_tags": ["local", "demo"],
  "tags": ["local", "demo", "enabled"],
  "added_tags": ["enabled"],
  "removed_tags": [],
  "action": "add_tags",
  "changed": true,
  "dry_run": true
}
```

For no-op:

```json
{
  "type": "plugin_local_registry_tags",
  "registry_file": ".god-code/plugin-registry.json",
  "id": "demo-plugin",
  "path": "examples/plugins/demo-plugin",
  "previous_tags": ["local"],
  "tags": ["local"],
  "added_tags": [],
  "removed_tags": [],
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
ts-host CLI plugins tags
  -> resolve registry file
  -> load and validate local registry JSON
  -> plan local registry tag mutation
  -> render dry-run output or write registry file with --yes
```

No Phase74 state enters:

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
  --yes --tag local

god-code plugins tags demo-plugin \
  --registry-file .god-code/plugin-registry.json \
  --add demo --dry-run

god-code plugins tags demo-plugin \
  --registry-file .god-code/plugin-registry.json \
  --add demo --yes

god-code plugins tags demo-plugin \
  --registry-file .god-code/plugin-registry.json \
  --remove local --yes

GOD_CODE_PLUGIN_REGISTRY_FILE=.god-code/plugin-registry.json \
  god-code plugins inspect demo-plugin --json
```

`plugins tags` only changes registry metadata. It does not load or unload runtime state in already-running processes.

## Error handling and sanitization

Implemented local errors:

- Missing plugin id argument.
- Missing registry file flag and missing `GOD_CODE_PLUGIN_REGISTRY_FILE`.
- Registry file does not exist.
- Invalid registry JSON or unsupported registry shape.
- Duplicate plugin id in registry.
- Plugin id not found.
- Missing tag operation.
- Mutually exclusive tag operations used together.
- Invalid tag value.
- Mutually exclusive `--dry-run` / `--yes` flags used together.
- Registry write failure.

Diagnostics should include sanitized registry path, plugin id, and tag names where useful, but should not dump full file contents.

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

- `plugins tags <id> --add <tag> --dry-run` reports planned add without writing.
- `plugins tags <id> --add <tag> --yes` appends a new tag.
- Adding an existing tag is a no-op.
- `plugins tags <id> --remove <tag> --yes` removes an existing tag.
- Removing an absent tag is a no-op.
- `plugins tags <id> --set <tags> --yes` replaces the tag list.
- `plugins tags <id> --clear --yes` writes an empty tag list.
- Missing `tags` is treated as `[]`.
- Unknown top-level fields, unknown entry fields, path, enabled state, and unrelated entries are preserved.
- Missing id fails.
- Missing registry file fails.
- Duplicate ids fail before mutation.
- `--dry-run` and `--yes` are mutually exclusive.
- Invalid tag values fail.
- Invalid registry JSON produces sanitized errors.
- Plugin runtime code is not executed during tag updates.
- Smoke test installs a demo plugin into a temporary registry, adds/removes tags, then verifies `plugins inspect --json` reports the expected tags.

## Verification

- `npm run build` passes in `ts-host/`.
- Plugin CLI tests cover dry-run, confirmed write, no-op, set, clear, missing id, duplicate handling, invalid tags, and sanitized errors.
- `./tools/run-cli-smoke.sh` includes a local registry tags flow.
- `./tools/check.sh` passes as the full project gate.
- README and route docs describe that this is registry metadata editing, not marketplace metadata sync or lifecycle script execution.
