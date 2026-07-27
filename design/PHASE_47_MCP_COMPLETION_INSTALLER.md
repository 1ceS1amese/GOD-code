# Phase 47: MCP completion installer

Phase47 builds on Phase46 shell hook generation and adds a guarded installer that writes the generated hook into a managed shell rc block.

## CLI surface

```text
god-code mcp completion-install bash [--program <command>] [--rc-file <path>] [--dry-run|--yes] [--json]
god-code mcp completion-install zsh [--program <command>] [--rc-file <path>] [--dry-run|--yes] [--json]
```

Defaults:

- `--program` defaults to `god-code`.
- `--rc-file` defaults to `~/.bashrc` for bash and `~/.zshrc` for zsh.
- Without `--yes`, the command is a dry-run and does not write files.

## Behavior

- The installer renders the same script as `mcp completion-script`.
- The script is wrapped in a stable managed block:

```text
# >>> GOD-code MCP completion >>>
...
# <<< GOD-code MCP completion <<<
```

- If no managed block exists, the command appends one.
- If a managed block exists, the command replaces only that block.
- If the existing block already matches the requested shell/program, the command reports `noop`.
- `--json` returns the resolved rc file, action, dry-run status, markers, and change metadata.

## Safety boundary

- The default mode is dry-run.
- Real writes require explicit `--yes`.
- `--dry-run` and `--yes` are mutually exclusive.
- The installer does not source the rc file.
- The installer does not modify global completion directories.
- The installer does not start a daemon or background process.

## Validation

- TS unit tests cover dry-run, append, update, noop, text rendering, and JSON rendering.
- Integration tests cover dry-run and real install through the built CLI.
- CLI smoke covers real install into a temporary rc file.
