# Demo Plugin Package

This is a manifest-only GOD-code plugin package.

It demonstrates the current package shape without executing plugin-owned code:

- `plugin.json` declares metadata, tools, permissions, and prompt fragments.
- `fixtures/echo-input.json` shows a valid input for `plugin.demo.echo`.
- `fixtures/echo-output.json` shows the output shape a host-provided handler could return.

## Tool contract

`plugin.demo.echo` expects:

```json
{
  "value": "hello"
}
```

The declared `input_schema` in `plugin.json` requires `value` as a string.

## Validate

```bash
god-code plugins validate examples/plugins/demo-plugin
god-code plugins validate examples/plugins/demo-plugin/plugin.json --json
```

## Runtime boundary

This package does not provide executable plugin code. A host must bind a handler for `plugin.demo.echo`; execution still goes through the host permission, audit, and cancel flow.
