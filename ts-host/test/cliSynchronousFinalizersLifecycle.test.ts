import { beforeEach, describe, expect, it, vi } from "vitest";

const readlineFixture = vi.hoisted(() => ({
  createInterface: vi.fn()
}));

vi.mock("node:readline", () => ({
  default: {
    createInterface: readlineFixture.createInterface
  }
}));

import { TerminalApprovalPrompt } from "../src/cli/approval.js";
import { runTuiPtySmoke } from "../src/cli/tuiPtySmoke.js";
import type { ToolApprovalRequest } from "../src/policy/approval.js";

interface FakeReadlineInterface {
  question(query: string, callback: (answer: string) => void): void;
  close(): void;
}

class ApprovalInput {
  public readonly isTTY = true;
}

class ApprovalOutput {
  public readonly isTTY = true;
  public readonly chunks: string[] = [];

  public write(text: string): boolean {
    this.chunks.push(text);
    return true;
  }
}

class FaultInjectingTuiOutput {
  public readonly isTTY = true;
  public readonly columns = 72;
  public readonly rows = 20;
  public readonly chunks: string[] = [];
  public writeCalls = 0;

  public constructor(private readonly failures: ReadonlyMap<number, unknown>) {}

  public write(text: string): void {
    this.writeCalls += 1;
    this.chunks.push(text);
    if (this.failures.has(this.writeCalls)) {
      throw this.failures.get(this.writeCalls);
    }
  }
}

const approvalRequest: ToolApprovalRequest = {
  toolName: "Bash",
  reason: "Bash requires interactive approval in prompt mode.",
  cwd: "/workspace",
  sessionId: "session-phase598",
  turnId: "turn-phase598",
  toolCallId: "tool-phase598",
  inputSummary: {
    lines: [{ label: "command", value: "printf phase598" }],
    truncated: false,
    redacted: false
  }
};

describe("synchronous CLI finalizer primary continuity", () => {
  beforeEach(() => {
    readlineFixture.createInterface.mockReset();
  });

  it("closes a normally answered terminal approval interface exactly once", async () => {
    const close = vi.fn();
    installReadlineInterface({
      question: (_query, callback) => callback("yes"),
      close
    });

    const decision = await createTerminalApprovalPrompt().requestApproval(approvalRequest);

    expect(decision).toEqual({ action: "allow", source: "interactive" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("fails closed with a fixed denial when approval succeeds but input cleanup fails", async () => {
    const cleanupError = new Error("approval-close-secret-phase598");
    let questionReturned = false;
    const close = vi.fn(() => {
      if (questionReturned) {
        throw cleanupError;
      }
    });
    installReadlineInterface({
      question: (_query, callback) => {
        callback("yes");
        questionReturned = true;
      },
      close
    });

    const decision = await createTerminalApprovalPrompt().requestApproval(approvalRequest);

    expect(decision).toEqual({
      action: "deny",
      source: "unavailable",
      reason: "Interactive approval input cleanup failed."
    });
    expect(JSON.stringify(decision)).not.toContain(cleanupError.message);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("preserves an interactive denial across input cleanup failure", async () => {
    let questionReturned = false;
    const close = vi.fn(() => {
      if (questionReturned) {
        throw new Error("deny-close-secondary-phase598");
      }
    });
    installReadlineInterface({
      question: (_query, callback) => {
        callback("no");
        questionReturned = true;
      },
      close
    });

    await expect(createTerminalApprovalPrompt().requestApproval(approvalRequest)).resolves.toEqual({
      action: "deny",
      source: "interactive",
      reason: "User denied tool execution."
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("preserves cancellation across input cleanup failure", async () => {
    const controller = new AbortController();
    let abortReturned = false;
    const close = vi.fn(() => {
      if (abortReturned) {
        throw new Error("abort-close-secondary-phase598");
      }
    });
    installReadlineInterface({
      question: vi.fn(),
      close
    });
    const pending = createTerminalApprovalPrompt().requestApproval(
      approvalRequest,
      controller.signal
    );

    controller.abort();
    abortReturned = true;

    await expect(pending).resolves.toEqual({
      action: "deny",
      source: "unavailable",
      reason: "Tool approval was cancelled."
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("observes cancellation that occurs while the readline interface is being created", async () => {
    const controller = new AbortController();
    const question = vi.fn();
    const close = vi.fn();
    readlineFixture.createInterface.mockImplementation(() => {
      controller.abort();
      return { question, close };
    });

    await expect(createTerminalApprovalPrompt().requestApproval(
      approvalRequest,
      controller.signal
    )).resolves.toEqual({
      action: "deny",
      source: "unavailable",
      reason: "Tool approval was cancelled."
    });
    expect(question).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("preserves a question primary when input cleanup also throws", async () => {
    const questionPrimary = { kind: "question-primary-phase598" };
    const close = vi.fn(() => {
      throw new Error("question-close-secondary-phase598");
    });
    installReadlineInterface({
      question: () => {
        throw questionPrimary;
      },
      close
    });

    await expect(createTerminalApprovalPrompt().requestApproval(approvalRequest)).rejects.toBe(
      questionPrimary
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("projects successful TUI cleanup failure through a fixed error", () => {
    const cleanupError = new Error("tui-stop-secret-phase598");
    const output = new FaultInjectingTuiOutput(new Map([[3, cleanupError]]));

    const caught = captureSynchronousError(() => runTuiPtySmoke({
      output,
      now: () => "2026-07-26T00:00:00.000Z"
    }));

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("TUI PTY smoke cleanup failed");
    expect((caught as Error).message).not.toContain(cleanupError.message);
    expect(output.writeCalls).toBe(3);
  });

  it("preserves a TUI render primary when screen cleanup also throws", () => {
    const renderPrimary = { kind: "tui-render-primary-phase598" };
    const output = new FaultInjectingTuiOutput(new Map([
      [2, renderPrimary],
      [3, new Error("tui-stop-secondary-phase598")]
    ]));

    const caught = captureSynchronousError(() => runTuiPtySmoke({
      output,
      now: () => "2026-07-26T00:00:00.000Z"
    }));

    expect(caught).toBe(renderPrimary);
    expect(output.writeCalls).toBe(3);
  });
});

function installReadlineInterface(value: FakeReadlineInterface): void {
  readlineFixture.createInterface.mockReturnValue(value);
}

function createTerminalApprovalPrompt(): TerminalApprovalPrompt {
  return new TerminalApprovalPrompt({
    input: new ApprovalInput() as unknown as NodeJS.ReadStream,
    output: new ApprovalOutput() as unknown as NodeJS.WriteStream
  });
}

function captureSynchronousError(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to throw.");
}
