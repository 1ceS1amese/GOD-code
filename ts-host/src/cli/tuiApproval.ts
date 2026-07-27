import type {
  ToolApprovalDecision,
  ToolApprovalPrompt,
  ToolApprovalRequest
} from "../policy/approval.js";
import type { TuiKeyInfo } from "./tuiInput.js";
import type { TuiApprovalModal } from "./tuiTypes.js";

export interface TuiApprovalPromptHooks {
  show(modal: TuiApprovalModal): void;
  hide(): void;
}

interface PendingApproval {
  resolve(decision: ToolApprovalDecision): void;
  abort?: () => void;
}

export class TuiModalApprovalPrompt implements ToolApprovalPrompt {
  private pending?: PendingApproval;

  public constructor(private readonly hooks: TuiApprovalPromptHooks) {}

  public isPending(): boolean {
    return this.pending !== undefined;
  }

  public async requestApproval(
    request: ToolApprovalRequest,
    signal?: AbortSignal
  ): Promise<ToolApprovalDecision> {
    if (this.pending) {
      return {
        action: "deny",
        source: "unavailable",
        reason: "Another TUI approval request is already pending."
      };
    }

    this.hooks.show(toTuiApprovalModal(request));
    return await new Promise<ToolApprovalDecision>((resolve) => {
      const finish = (decision: ToolApprovalDecision): void => {
        signal?.removeEventListener("abort", abort);
        this.pending = undefined;
        this.hooks.hide();
        resolve(decision);
      };
      const abort = (): void => {
        finish({
          action: "deny",
          source: "unavailable",
          reason: "Approval request aborted."
        });
      };
      this.pending = {
        resolve: finish,
        abort
      };
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });
    });
  }

  public handleKey(text: string | undefined, key: TuiKeyInfo | undefined): boolean {
    const pending = this.pending;
    if (!pending) {
      return false;
    }
    if (text === "y" || text === "Y") {
      pending.resolve({
        action: "allow",
        source: "interactive"
      });
      return true;
    }
    if (text === "n" || text === "N" || key?.name === "escape") {
      pending.resolve({
        action: "deny",
        source: "interactive",
        reason: "User denied tool execution."
      });
      return true;
    }
    return true;
  }
}

function toTuiApprovalModal(request: ToolApprovalRequest): TuiApprovalModal {
  return {
    toolName: request.toolName,
    reason: request.reason,
    cwd: request.cwd,
    sessionId: request.sessionId,
    turnId: request.turnId,
    toolCallId: request.toolCallId,
    inputLines: request.inputSummary.lines.map((line) => ({
      label: line.label,
      value: line.value
    })),
    truncated: request.inputSummary.truncated,
    redacted: request.inputSummary.redacted
  };
}
