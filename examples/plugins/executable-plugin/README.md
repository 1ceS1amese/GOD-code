# Executable Plugin Example

This example demonstrates the Phase35 plugin sandbox runtime shape.

The plugin declares a `node-subprocess` runtime in `plugin.json`. GOD-code runs `handler.mjs` as a child process for plugin-owned tool calls and exchanges a single JSON request / response over stdio.

Current boundary:

- The handler is not imported into the TS Host process.
- The entry path is relative to the plugin root.
- Only allowlisted env keys are forwarded.
- Tool execution still goes through `HostToolRegistry.executeRequest(...)`.

Validate the manifest:

```bash
node ts-host/dist/cli/main.js plugins validate examples/plugins/executable-plugin --json
```
