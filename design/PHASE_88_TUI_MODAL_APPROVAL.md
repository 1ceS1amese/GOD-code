# Phase 88: TUI modal approval

Phase88 implements a TUI-native approval modal for `god-code tui`. It replaces the Phase87 suspend/redraw bridge with an in-frame approval prompt while preserving the existing `ToolApprovalPrompt` interface and host tool execution boundary.

This phase is a focused TUI approval implementation, not a broader permission policy rewrite.

## Implementation status

Implemented in this phase:

- `TuiModalApprovalPrompt` in `ts-host/src/cli/tuiApproval.ts`.
- TUI approval modal state in `ts-host/src/cli/tuiState.ts`.
- Approval modal rendering in `ts-host/src/cli/tuiRenderer.ts`.
- Raw key routing for pending modal approvals in `ts-host/src/cli/tuiSession.ts`.
- Modal approval unit tests in `ts-host/test/tuiApproval.test.ts`.
- Renderer/state coverage in `ts-host/test/tui.test.ts`.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Keep approval decisions inside the TUI frame when `god-code tui` owns the terminal.
- Preserve the existing `ToolApprovalPrompt` contract used by host tool execution.
- Support simple keyboard decisions:
  - `y` / `Y` allow;
  - `n` / `N` deny;
  - `Esc` deny.
- Show bounded and already-summarized tool approval request details.
- Prevent normal prompt editing while an approval modal is active.
- Keep non-TUI approval behavior unchanged.
- Keep Python Engine unaware of the TUI approval UI.

## Non-goals

- No permission policy rewrite.
- No new approval decision type.
- No JSON-RPC method addition.
- No Python Engine TUI awareness.
- No transcript schema change.
- No provider API, MCP protocol, plugin manifest, or host tool execution boundary change.
- No mouse interaction.
- No multi-modal approval queue.
- No full-screen form editor for tool input.

## Runtime behavior

When `god-code tui` runs in raw-mode TTY:

```text
Tool execution requests approval
  -> HostToolRegistry asks ToolApprovalPrompt
  -> TuiModalApprovalPrompt shows approvalModal in TuiState
  -> TuiController routes raw keypresses to pending modal first
  -> y/n/Esc resolves ToolApprovalDecision
  -> existing host tool execution continues with allow/deny
```

When TUI is not using a `TuiScreen`, the controller keeps using the provided approval prompt. This preserves compatibility for tests and non-raw fallback paths.

## State model

Added:

```ts
interface TuiApprovalModal {
  toolName: string;
  reason: string;
  cwd: string;
  sessionId: string;
  turnId: string;
  toolCallId: string;
  inputLines: TuiApprovalInputLine[];
  truncated: boolean;
  redacted: boolean;
}

interface TuiState {
  approvalModal?: TuiApprovalModal;
}
```

The reducer supports:

- `show_approval_modal`
- `hide_approval_modal`

Prompt editing and prompt submission are blocked while `approvalModal` is present.

## Rendering

The modal is rendered as an `Approval` section in the current frame:

- tool name;
- reason;
- cwd;
- bounded input summary lines;
- truncated / redacted flags;
- `Press y to allow, n or Esc to deny.`

The modal uses the existing tool input summary produced by the permission layer. It does not render raw provider payloads, secrets, headers, or full tool input values beyond the existing summarized preview.

## Input handling

`TuiController.handleKey(...)` checks pending modal approval before normal key mapping.

If a modal is pending:

- `y` / `Y` resolves `{ action: "allow", source: "interactive" }`;
- `n` / `N` resolves deny;
- `Esc` resolves deny;
- other keys are consumed by the modal and do not mutate prompt state.

This avoids accidental prompt edits while a tool approval request is active.

## Failure and abort behavior

- Concurrent approval requests fail closed with `{ action: "deny", source: "unavailable" }`.
- Abort signals deny with source `unavailable`.
- The modal is always hidden after allow, deny, or abort.

## Testing

Covered:

- modal allow via `y`;
- modal deny via `n`;
- modal deny via `Esc`;
- abort handling;
- overlapping request fail-closed behavior;
- approval modal rendering;
- prompt input blocked while modal is active;
- focused TUI / REPL regression.

## Acceptance criteria

- TUI approval prompt no longer needs to leave alternate screen for normal decisions.
- Approval decisions still flow through the existing `ToolApprovalPrompt` contract.
- Modal input is deterministic and unit-testable without a real terminal.
- Non-TUI approval prompt behavior remains unchanged.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
