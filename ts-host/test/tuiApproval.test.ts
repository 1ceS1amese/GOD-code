import { describe, expect, it } from "vitest";
import { TuiModalApprovalPrompt } from "../src/cli/tuiApproval.js";
import type { TuiApprovalModal } from "../src/cli/tuiState.js";
import type { ToolApprovalRequest } from "../src/policy/approval.js";

const approvalRequest: ToolApprovalRequest = {
  toolName: "Write",
  reason: "Write modifies files.",
  cwd: "/workspace",
  sessionId: "session-1",
  turnId: "turn-1",
  toolCallId: "tool-1",
  inputSummary: {
    lines: [
      {
        label: "path",
        value: "demo.txt"
      }
    ],
    truncated: false,
    redacted: false
  }
};

describe("TuiModalApprovalPrompt", () => {
  it("resolves allow from y and clears modal state", async () => {
    let shown: TuiApprovalModal | undefined;
    let hidden = false;
    const prompt = new TuiModalApprovalPrompt({
      show: (modal) => {
        shown = modal;
      },
      hide: () => {
        hidden = true;
      }
    });

    const decisionPromise = prompt.requestApproval(approvalRequest);
    expect(prompt.isPending()).toBe(true);
    expect(shown).toMatchObject({
      toolName: "Write",
      reason: "Write modifies files.",
      cwd: "/workspace"
    });

    expect(prompt.handleKey("y", undefined)).toBe(true);
    await expect(decisionPromise).resolves.toEqual({
      action: "allow",
      source: "interactive"
    });
    expect(hidden).toBe(true);
    expect(prompt.isPending()).toBe(false);
  });

  it("resolves deny from n or escape", async () => {
    const prompt = new TuiModalApprovalPrompt({
      show: () => undefined,
      hide: () => undefined
    });

    const denyByN = prompt.requestApproval(approvalRequest);
    expect(prompt.handleKey("n", undefined)).toBe(true);
    await expect(denyByN).resolves.toMatchObject({
      action: "deny",
      source: "interactive"
    });

    const denyByEscape = prompt.requestApproval(approvalRequest);
    expect(prompt.handleKey(undefined, { name: "escape" })).toBe(true);
    await expect(denyByEscape).resolves.toMatchObject({
      action: "deny",
      source: "interactive"
    });
  });

  it("denies on abort and rejects overlapping requests", async () => {
    const prompt = new TuiModalApprovalPrompt({
      show: () => undefined,
      hide: () => undefined
    });
    const controller = new AbortController();

    const pending = prompt.requestApproval(approvalRequest, controller.signal);
    await expect(prompt.requestApproval(approvalRequest)).resolves.toMatchObject({
      action: "deny",
      source: "unavailable"
    });

    controller.abort();
    await expect(pending).resolves.toMatchObject({
      action: "deny",
      source: "unavailable"
    });
  });
});
