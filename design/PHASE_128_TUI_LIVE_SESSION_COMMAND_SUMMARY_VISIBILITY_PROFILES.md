# Phase 128: TUI live session command summary visibility profiles

Phase128 adds explicit summary visibility profiles to the `god-code tui` live session command palette. Users can press `\` while the palette is open to cycle which optional summary families participate in the Phase126 row budget: all summaries, history summaries only, usage ranking only, or no optional summaries.

This phase extends Phase127 priority controls. Priority still determines allocation order when the `all` profile exposes both summary families. Profiles filter eligible summaries before allocation and do not delete command history, usage counts, pinned history, ranking configuration, or any protocol state.

## Implementation status

Implemented in this phase:

- Added `TuiLiveSessionCommandSummaryVisibilityProfile` with `all | history | ranking | minimal` values.
- Added `liveSessionCommandSummaryVisibilityProfile` to `TuiState`, defaulting to `all`.
- Added `cycle_live_session_command_summary_visibility_profile` to the reducer.
- Added `\` as the palette-local summary-profile shortcut.
- The action is ignored while the command palette is closed.
- Profile order is deterministic: `all -> history -> ranking -> minimal -> all`.
- The selected profile persists across palette close and reopen.
- `all` exposes pinned/recent and ranking summaries, using the Phase127 priority.
- `history` exposes pinned/recent summaries and suppresses ranking output.
- `ranking` exposes usage ranking and suppresses pinned/recent output.
- `minimal` suppresses all optional summaries.
- Every profile preserves the Phase126 command group and executable-command row reservation.
- Header and debug diagnostics expose `profile:all` / `profile:minimal` and `profile=all` / `profile=minimal`.
- Focused input, help, debug, four-profile rendering, no-op, wraparound, command-visibility, and persistence tests cover the behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Let users explicitly choose which optional summaries consume palette rows.
- Provide a minimal presentation that maximizes visible command rows.
- Preserve Phase127 allocation priority when both summary families are visible.
- Keep profile changes local, deterministic, and reversible.

## Non-goals

- No deletion or clearing of hidden summary source data.
- No independent pinned and recent visibility switches.
- No custom profile editor or arbitrary profile combinations.
- No command palette scrolling in Phase128; Phase129 adds command-aware selection following and paging.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Profile behavior

| Profile | Pinned/recent | Usage ranking | Priority used |
| --- | --- | --- | --- |
| `all` | visible when data exists | visible when enabled and data exists | yes |
| `history` | visible when data exists | hidden | no |
| `ranking` | hidden | visible when enabled and data exists | no |
| `minimal` | hidden | hidden | no |

Profiles only control eligibility. Eligible summaries still share the Phase126 optional summary row budget, and command interaction rows remain reserved before summaries are rendered.

## Acceptance criteria

- `\` maps to the summary-profile action while the palette is open.
- The action is ignored while the palette is closed.
- Only `all`, `history`, `ranking`, and `minimal` are representable.
- Cycle order and wraparound are deterministic.
- Profile persists across palette close and reopen.
- Each profile renders exactly its eligible summary families.
- Hidden profile summaries retain their source state and return when eligible again.
- Every profile preserves an executable command under constrained full-layout rows.
- Header, help, renderer, and debug diagnostics expose or consume the profile.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
