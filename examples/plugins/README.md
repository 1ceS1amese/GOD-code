# GOD-code Plugin / Skill Examples

This directory contains examples for the current Plugin / Skill runtime.

Most examples are intentionally declarative:

- They include `plugin.json` or `skill.json`.
- They may include docs and fixtures.
- Tool execution still requires a host-provided handler and still goes through `HostToolRegistry.executeRequest(...)`.

Phase35 also includes one executable example that uses the sandbox runtime shape:

- The handler runs as a child process, not inside the TS Host process.
- The manifest entry path stays inside the plugin root.
- Only allowlisted env keys are forwarded.

## Examples

- [`demo-plugin/`](demo-plugin/): plugin package with a tool declaration, prompt fragment, permissions, README, and fixtures.
- [`demo-skill/`](demo-skill/): skill manifest using the same schema as plugins.
- [`executable-plugin/`](executable-plugin/): plugin package with a `node-subprocess` runtime handler.

## Useful checks

```bash
god-code plugins schema --json
god-code plugins validate examples/plugins/demo-plugin
god-code plugins validate examples/plugins/demo-skill
god-code plugins validate examples/plugins/executable-plugin --json
GOD_CODE_PLUGIN_CONFIG_FILE=examples/config/plugin-runtime.json god-code plugins inspect-config --json
GOD_CODE_PLUGIN_REGISTRY_FILE=examples/config/plugin-registry.json god-code plugins list --json
GOD_CODE_PLUGIN_REGISTRY_FILE=examples/config/plugin-registry.json god-code plugins inspect executable-plugin --json
```
