# Phase 46: MCP completion shell hook

Phase46 builds on Phase45 candidate output and adds a sourceable shell hook script generator for MCP completion commands.

## CLI surface

```text
god-code mcp completion-script bash [--program <command>]
god-code mcp completion-script zsh [--program <command>]
```

`--program` controls the command name registered by the generated shell hook. It defaults to `god-code`.

## Behavior

- `bash` output registers a readline completion function with `complete -F`.
- `zsh` output registers a completion function with `compdef`.
- The generated hook suggests `mcp` at the top-level command position.
- The generated hook suggests known MCP diagnostic subcommands at `god-code mcp <TAB>`.
- For `complete-prompt` argument value position, the hook calls:

```text
god-code mcp complete-prompt <name> <argument_name> <prefix> --values-only
```

- For `complete-resource-template` argument value position, the hook calls:

```text
god-code mcp complete-resource-template <uri_template> <argument_name> <prefix> --values-only
```

## Boundaries

- This phase does not edit shell rc files.
- This phase does not install system-wide shell completions.
- This phase does not add an interactive readline UI inside GOD-code.
- This phase does not change MCP runtime semantics or JSON-RPC protocol.
- This phase does not auto-complete prompt names or resource template names; it only wires dynamic candidate values through the Phase45 values-only output.

## Validation

- TS unit tests cover bash and zsh script rendering.
- Integration tests cover `mcp completion-script bash` and `mcp completion-script zsh` through the built CLI.
- CLI smoke covers bash script generation and verifies the candidate hook references `--values-only`.
