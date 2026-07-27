# Phase 122: TUI live session command usage ranking adaptive layout

Phase122 makes the `god-code tui` live session command usage ranking summary width-aware. The user-selected Phase121 Top-N remains the configured upper bound, while the renderer reduces the effective number of entries on narrow terminals so the ranking summary fits on one line.

This phase is renderer-local adaptive presentation. It does not mutate the selected ranking limit, usage counts, visibility, command sorting, history, or command execution. It also does not add JSON-RPC methods or change Python Engine, transcript, provider, MCP, plugin, permission, or host tool boundaries.

## Implementation status

Implemented in this phase:

- Propagated the current content width through full and compact live-pane rendering.
- Added a width-aware ranking fitting step before formatting the summary row.
- The configured Top-1 / Top-3 / Top-5 value remains the maximum entry count.
- Ranking entries are appended in order until the complete summary would exceed the available content width.
- At least the highest-ranked entry remains visible when ranking data exists.
- Wide terminals continue to show the complete configured ranking.
- Narrow rendering does not mutate `liveSessionCommandUsageRankingLimit`.
- Focused narrow and wide terminal tests cover effective-limit behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Avoid clipping multi-entry ranking summaries on narrow terminals.
- Preserve the user's configured ranking size as an upper bound.
- Keep ranking order and usage semantics unchanged.
- Reuse the same behavior in full and compact render paths.

## Non-goals

- No automatic mutation of the configured ranking limit.
- No multi-line ranking wrapping.
- No hidden-entry overflow indicator in Phase122; Phase123 adds a width-aware `+N more` suffix.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Adaptive behavior

The renderer performs these steps:

1. derive the configured Top-N ranking;
2. format the first entry as the minimum visible summary;
3. append the next entry only when the complete formatted summary still fits the content width;
4. stop before adding the first entry that would overflow;
5. render the resulting stable ranking prefix.

This means a configured Top-5 may render as Top-1 on a narrow terminal and Top-5 on a wide terminal, while `liveSessionCommandUsageRankingLimit` remains `5` in both cases.

## Acceptance criteria

- Full and compact live-pane paths provide their content width to command palette rendering.
- Narrow terminals render a complete non-clipped ranking prefix.
- At least Top-1 is preserved when usage ranking data exists.
- Wide terminals render the full configured ranking when it fits.
- Adaptive rendering does not mutate TUI state.
- Ranking order remains identical to the shared ranking derivation.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
