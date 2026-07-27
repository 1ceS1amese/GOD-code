import { describe, expect, it } from "vitest";
import { buildTuiHelpLines } from "../src/cli/tuiHelp.js";
import { createInitialTuiState, reduceTuiState } from "../src/cli/tuiState.js";

const now = () => "2026-07-06T00:00:00.000Z";

describe("buildTuiHelpLines", () => {
  it("shows prompt and idle global shortcuts", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "s1" });

    expect(buildTuiHelpLines(state)).toEqual([
      "Global: Tab pane | Ctrl-N new live session | Ctrl-P previous live session | Ctrl-W close selected live | ? help | Ctrl-G debug",
      "Turn: Enter submit prompt or switch selected history session | Ctrl-C quit",
      "Prompt pane: type text, Backspace edit, Enter submit."
    ]);
  });

  it("shows pane-specific scroll shortcuts", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "s1" });
    state = reduceTuiState(state, { type: "switch_pane" });

    expect(buildTuiHelpLines(state)).toContain(
      "Live pane: Up/Down select | 1 activate | 2 pin | 3 close | 4 sort | 5 filter | 0 unfilter | r rename."
    );
    expect(buildTuiHelpLines(state)).toContain(
      "Bulk live: x close inactive | P unpin all | A mark read."
    );
    expect(buildTuiHelpLines(state)).toContain(
      "Command palette: : open commands."
    );
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(buildTuiHelpLines(state)).toContain(
      "Command palette actions: type search | Enter run | / clear | Esc close"
    );
    expect(buildTuiHelpLines(state)).toContain(
      "Command palette navigation: Tab category | Up/Down select | PageUp/PageDown page | Home/End bounds"
    );
    expect(buildTuiHelpLines(state).some((line) => line.startsWith("Command palette advanced:"))).toBe(true);
    expect(buildTuiHelpLines(state).some((line) => line.includes("latest_width_bucket_label:shown@F2"))).toBe(true);
    for (const maxWidth of [80, 120, 160]) {
      const widthAwareLines = buildTuiHelpLines(state, { maxWidth });
      expect(widthAwareLines.every((line) => line.length <= maxWidth)).toBe(true);
      expect(widthAwareLines.join("\n")).toContain("Enter run");
      expect(widthAwareLines.join("\n")).toContain("Esc close");
      expect(widthAwareLines.join("\n")).toContain("latest_width_bucket_label");
    }
    state = reduceTuiState(state, { type: "switch_pane" });
    expect(buildTuiHelpLines(state)).toContain(
      "Events pane: Up older | Down newer | PageUp/PageDown larger scroll."
    );
    expect(buildTuiHelpLines(state)).toContain(
      "Prompt: Tab back to prompt pane before editing/submitting text."
    );
  });

  it("shows history session switch shortcut", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "s1" });
    state = reduceTuiState(state, { type: "switch_pane" });
    state = reduceTuiState(state, { type: "switch_pane" });
    state = reduceTuiState(state, { type: "switch_pane" });

    expect(buildTuiHelpLines(state)).toContain(
      "History pane: Up/Down select session | Enter switch view | PageUp/PageDown scroll list."
    );
  });


  it("shows running cancel shortcut", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "s1" });
    state = reduceTuiState(state, { type: "append_prompt", text: "hello" });
    state = reduceTuiState(state, { type: "submit_prompt" });

    expect(buildTuiHelpLines(state)).toContain("Turn: Ctrl-C cancel current turn");
  });

  it("prioritizes approval modal help", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, {
      type: "show_approval_modal",
      modal: {
        toolName: "Write",
        reason: "Write modifies files.",
        cwd: "/workspace",
        sessionId: "s1",
        turnId: "t1",
        toolCallId: "tc1",
        inputLines: [],
        truncated: false,
        redacted: false
      }
    });

    expect(buildTuiHelpLines(state)).toEqual([
      "Approval modal: y allow | n deny | Esc deny",
      "Normal prompt input is paused until the approval decision completes.",
      "Approval decisions keep using the existing host ToolApprovalPrompt boundary."
    ]);
  });
});
