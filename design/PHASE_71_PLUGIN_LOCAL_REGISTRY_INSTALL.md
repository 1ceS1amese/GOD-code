# Phase 71: Plugin / Skill local registry install command

Phase71 implements an explicit local registry install command for Plugin / Skill packages. Phase36 added explicit plugin configuration entries and Phase37 added a local registry file with `plugins list` / `plugins inspect`; this phase closes the gap where users needed to hand-edit registry JSON to add a local package.

The first implementation is local-only, dry-run by default, manifest-validated, and TS Host CLI-only.

## Goals

- Add a CLI command that adds or updates one local plugin / skill package entry in a local registry file.
- Validate the target package manifest before planning or writing a registry mutation.
- Keep the command dry-run by default; real writes require `--yes`.
- Reuse the existing Phase37 registry shape and loader semantics.
- Store package paths relative to the registry file directory by default.
- Preserve unrelated registry entries and any existing enabled / disabled state unless flags explicitly change it.
- Support deterministic text output for humans and JSON output for tooling.
- Sanitize diagnostics and avoid printing raw manifest JSON, environment values, plugin stdout / stderr, or stack traces.
- Keep default `run`, `repl`, `tools list`, plugin runtime loading, and Python JSON-RPC behavior unchanged.
- Avoid executing plugin-owned runtime code during install.

## Non-goals

- No remote marketplace, catalog sync, package search, or package update flow.
- No `git clone`, download, `npm install`, dependency installation, or install scripts.
- No plugin lifecycle hooks.
- No plugin runtime execution during install.
- No persistent plugin daemon or system-level sandbox runtime.
- No automatic scan of user directories, workspace directories, or project manifests.
- No shell rc modification or global environment mutation.
- No Python Engine, provider, transcript, MCP, or JSON-RPC method changes.

## Current state

Existing Plugin / Skill CLI surfaces:

```text
god-code plugins schema
god-code plugins validate <manifest_or_dir>
god-code plugins inspect-config
god-code plugins list
god-code plugins inspect <plugin_id>
```

Existing configuration entry:

```text
GOD_CODE_PLUGIN_REGISTRY_FILE=<path-to-registry.json>
```

Current limitation:

- The local registry exists, but adding a local package requires manually editing JSON.
- `plugins list` and `plugins inspect` can read the registry, but there is no safe write path.
- There is no dry-run mutation preview for registry changes.

## Implemented CLI surface

Add a local install command under the existing `plugins` namespace:

```bash
god-code plugins install <plugin_or_skill_dir> --registry-file <path> --dry-run
god-code plugins install <plugin_or_skill_dir> --registry-file <path> --yes
god-code plugins install <plugin_or_skill_dir> --registry-file <path> --yes --json
```

Implemented flags:

- `--registry-file <path>`: explicit registry JSON file to read or create.
- `--dry-run`: preview the planned mutation without writing. This remains the default.
- `--yes`: confirm the registry write.
- `--json`: emit structured output.
- `--enable`: set the installed entry enabled. Default for a new entry.
- `--disable`: set the installed entry disabled.
- `--tag <tag>`: add a tag to the registry entry; may be repeated.
- `--replace`: allow an existing plugin id to move to a different package path.

Rules:

- `--dry-run` and `--yes` are mutually exclusive.
- `--enable` and `--disable` are mutually exclusive.
- `--registry-file` may be omitted only when `GOD_CODE_PLUGIN_REGISTRY_FILE` is set.
- No hidden default registry file is introduced in Phase71.
- The command accepts a plugin / skill package directory, not a remote identifier.
- The command only validates manifest shape and registry mutation rules; it never runs plugin code.

## Implemented registry mutation semantics

The command should:

1. Resolve the package directory from the current working directory.
2. Find `plugin.json` or `skill.json` using the existing manifest resolver semantics.
3. Parse and validate the manifest.
4. Resolve the registry file path from `--registry-file` or `GOD_CODE_PLUGIN_REGISTRY_FILE`.
5. Load an existing registry or create a new in-memory shape:

   ```json
   {
     "plugins": []
   }
   ```

6. Compute the stored package path relative to the registry file directory.
7. Match existing entries by manifest id.
8. Preserve unrelated entries and unknown top-level registry fields.
9. Plan one deterministic action:
   - `create_registry`
   - `add_entry`
   - `update_entry`
   - `replace_entry`
   - `no_op`
10. Write formatted JSON only when `--yes` is present.

Duplicate handling:

- Same manifest id and same resolved path: update enabled / tags if flags changed them, otherwise report `no_op`.
- Same manifest id and different resolved path: fail unless `--replace` is present.
- Different ids may point to different package paths; registry-level duplicate path warnings can be added later.

Path boundary:

- Phase71 should keep package install workspace-bound by default: the target package directory must resolve under the current workspace root.
- A later phase can add an explicit allowlist if non-workspace plugin package roots are needed.

## Output shape

Text output should be concise:

```text
GOD-code plugin registry install:
registry_file: .god-code/plugin-registry.json
package_dir: examples/plugins/demo-plugin
manifest: plugin.json
id: demo-plugin
name: Demo Plugin
version: 0.1.0
enabled: true
tags: local,demo
action: add_entry
dry_run: true
changed: true
```

JSON output should be stable:

```json
{
  "type": "plugin_local_registry_install",
  "registry_file": ".god-code/plugin-registry.json",
  "package_dir": "examples/plugins/demo-plugin",
  "manifest_path": "examples/plugins/demo-plugin/plugin.json",
  "manifest_kind": "plugin",
  "id": "demo-plugin",
  "name": "Demo Plugin",
  "version": "0.1.0",
  "enabled": true,
  "tags": ["local", "demo"],
  "path_value": "../../examples/plugins/demo-plugin",
  "action": "add_entry",
  "changed": true,
  "dry_run": true
}
```

The output should not include:

- raw manifest JSON
- raw registry JSON
- environment variable values
- plugin executable stdout / stderr
- stack traces

## Runtime boundary

The planned flow stays inside the TS Host CLI:

```text
ts-host CLI plugins install
  -> resolve registry file
  -> resolve local package directory
  -> load and validate plugin / skill manifest
  -> plan local registry JSON mutation
  -> render dry-run output or write registry file with --yes
```

No Phase71 state enters:

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
  --dry-run

god-code plugins install examples/plugins/demo-plugin \
  --registry-file .god-code/plugin-registry.json \
  --yes

GOD_CODE_PLUGIN_REGISTRY_FILE=.god-code/plugin-registry.json \
  god-code plugins list --json

GOD_CODE_PLUGIN_REGISTRY_FILE=.god-code/plugin-registry.json \
  god-code plugins inspect demo-plugin --json
```

`plugins install` only writes the registry file. Runtime loading still requires the user to explicitly point `GOD_CODE_PLUGIN_REGISTRY_FILE` at that registry, matching Phase37 behavior.

## Error handling and sanitization

Local errors:

- Missing package directory argument.
- Missing registry file flag and missing `GOD_CODE_PLUGIN_REGISTRY_FILE`.
- Package directory does not exist.
- Package directory resolves outside the current workspace.
- No `plugin.json` or `skill.json` found.
- Invalid manifest shape.
- Invalid registry JSON or unsupported registry shape.
- Duplicate plugin id with different path and no `--replace`.
- Invalid tag value.
- Mutually exclusive flags used together.
- Registry write failure.

Diagnostics should include sanitized paths and ids where useful, but should not dump full file contents.

## Implementation touch points

Implemented code areas:

- `ts-host/src/cli/plugins.ts`
- `ts-host/src/cli/main.ts`
- `ts-host/src/plugins/config.ts`
- `ts-host/src/plugins/loader.ts`
- `ts-host/test/cliMcpPlugins.test.ts` or a dedicated plugin CLI test file
- `tools/run-cli-smoke.sh`

Docs kept in sync:

- `README.md`
- `PROJECT_PLAN.md`
- `INTERNAL_DESIGN.md`
- `ARCHITECTURE.md`
- `EXTENSION_POINTS.md`
- `protocol/README.md`

## Test coverage

- `plugins install <dir> --registry-file <path> --dry-run` validates and reports a planned add without writing.
- `plugins install <dir> --registry-file <path> --yes` creates a missing registry file.
- The written entry stores a path relative to the registry file directory.
- Existing same-id / same-path entry is a deterministic `no_op` unless enabled / tags change.
- Existing same-id / different-path entry fails without `--replace`.
- `--replace` updates the path for an existing id.
- `--enable` and `--disable` are mutually exclusive at the CLI parser boundary.
- Invalid tags are rejected.
- Invalid manifest and invalid registry JSON produce sanitized errors.
- Plugin runtime code is not executed during install.
- Smoke test installs the demo plugin into a temporary registry, then verifies `plugins list --json` can read it.

## Verification

- `npm run build` passes.
- `npm test -- cliMcpPlugins.test.ts --run` passes.
- Plugin CLI tests cover dry-run, confirmed write, duplicate handling, replace, tags, and sanitized errors.
- `./tools/run-cli-smoke.sh` includes a local registry install flow.
- `./tools/check.sh` should remain the full release gate.
- README and route docs describe that this is a local registry writer, not a remote marketplace or script installer.
