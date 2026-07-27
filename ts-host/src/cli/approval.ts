import readline from "node:readline";
import type {
  ToolApprovalDecision,
  ToolApprovalPrompt,
  ToolApprovalRequest
} from "../policy/approval.js";

type TerminalApprovalOperationOutcome =
  | { status: "fulfilled"; value: ToolApprovalDecision }
  | { status: "rejected"; reason: unknown };

interface TerminalApprovalFinalizationOutcome {
  failed: boolean;
}

const TERMINAL_APPROVAL_CLEANUP_FAILURE_REASON =
  "Interactive approval input cleanup failed.";

export interface TerminalApprovalPromptOptions {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
}

export class TerminalApprovalPrompt implements ToolApprovalPrompt {
  private readonly input: NodeJS.ReadStream;
  private readonly output: NodeJS.WriteStream;

  public constructor(options: TerminalApprovalPromptOptions = {}) {
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stderr;
  }

  public async requestApproval(
    request: ToolApprovalRequest,
    signal?: AbortSignal
  ): Promise<ToolApprovalDecision> {
    if (!this.input.isTTY || !this.output.isTTY) {
      return {
        action: "deny",
        source: "non_interactive",
        reason: `Interactive approval requires a TTY: ${request.reason}`
      };
    }
    this.renderRequest(request);
    return await this.ask(signal);
  }

  private renderRequest(request: ToolApprovalRequest): void {
    this.output.write("GOD-code tool approval required\n");
    this.output.write(`tool: ${request.toolName}\n`);
    this.output.write(`reason: ${request.reason}\n`);
    this.output.write(`cwd: ${request.cwd}\n`);
    for (const line of request.inputSummary.lines) {
      this.output.write(`${line.label}: ${line.value}\n`);
    }
    if (request.inputSummary.truncated) {
      this.output.write("note: one or more values were truncated\n");
    }
    if (request.inputSummary.redacted) {
      this.output.write("note: one or more values were redacted\n");
    }
    this.output.write("\n");
  }

  private async ask(signal?: AbortSignal): Promise<ToolApprovalDecision> {
    if (signal?.aborted) {
      return {
        action: "deny",
        source: "unavailable",
        reason: "Tool approval was cancelled."
      };
    }

    const rl = readline.createInterface({
      input: this.input,
      output: this.output,
      terminal: true
    });

    let onAbort: () => void = () => undefined;
    const decisionPromise = new Promise<ToolApprovalDecision>((resolve, reject) => {
      let settled = false;
      const settleDecision = (decision: ToolApprovalDecision): void => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(decision);
      };
      const settleFailure = (reason: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        reject(reason);
      };
      onAbort = (): void => {
        settleDecision({
          action: "deny",
          source: "unavailable",
          reason: "Tool approval was cancelled."
        });
      };

      try {
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted) {
          onAbort();
        }
        if (settled) {
          return;
        }
        rl.question("Allow this tool execution? [y/N] ", (answer) => {
          if (settled) {
            return;
          }
          try {
            const normalized = answer.trim().toLowerCase();
            if (normalized === "y" || normalized === "yes") {
              settleDecision({ action: "allow", source: "interactive" });
              return;
            }
            settleDecision({
              action: "deny",
              source: "interactive",
              reason: "User denied tool execution."
            });
          } catch (error) {
            settleFailure(error);
          }
        });
      } catch (error) {
        settleFailure(error);
      }
    });

    let operation: TerminalApprovalOperationOutcome;
    try {
      operation = { status: "fulfilled", value: await decisionPromise };
    } catch (reason) {
      operation = { status: "rejected", reason };
    }
    const finalization = finalizeTerminalApprovalInput(rl, signal, onAbort);

    if (operation.status === "rejected") {
      throw operation.reason;
    }
    if (finalization.failed && operation.value.action === "allow") {
      return {
        action: "deny",
        source: "unavailable",
        reason: TERMINAL_APPROVAL_CLEANUP_FAILURE_REASON
      };
    }
    return operation.value;
  }
}

function finalizeTerminalApprovalInput(
  rl: readline.Interface,
  signal: AbortSignal | undefined,
  onAbort: () => void
): TerminalApprovalFinalizationOutcome {
  const listenerDetached = signal === undefined
    ? true
    : invokeTerminalApprovalFinalizer(() => signal.removeEventListener("abort", onAbort));
  const interfaceClosed = invokeTerminalApprovalFinalizer(() => rl.close());
  return { failed: !listenerDetached || !interfaceClosed };
}

function invokeTerminalApprovalFinalizer(finalizer: () => void): boolean {
  try {
    finalizer();
    return true;
  } catch {
    return false;
  }
}
