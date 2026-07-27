import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { GodCodeReplSession, runGodCodeRepl } from "../src/cli/repl.js";
import type {
  ToolApprovalDecision,
  ToolApprovalPrompt,
  ToolApprovalRequest
} from "../src/policy/approval.js";
import { TerminalRenderer } from "../src/rendering/terminalRenderer.js";

const tempDirs: string[] = [];

class RecordingOutput {
  public readonly chunks: string[] = [];

  public write(text: string): void {
    this.chunks.push(text);
  }

  public toString(): string {
    return this.chunks.join("");
  }
}

class FakeApprovalPrompt implements ToolApprovalPrompt {
  public readonly requests: ToolApprovalRequest[] = [];

  public constructor(private readonly decision: ToolApprovalDecision) {}

  public async requestApproval(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
    this.requests.push(request);
    return this.decision;
  }
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "god-code-repl-"));
  tempDirs.push(dir);
  return dir;
}

describe("GodCodeReplSession", () => {
  it("starts one reusable session and lists host tools", async () => {
    const dir = await createTempDir();
    const session = new GodCodeReplSession(dir);
    try {
      await session.start();

      expect(session.getStatus()).toBe("idle");
      expect(session.listTools().map((tool) => tool.name)).toEqual([
        "Read",
        "Edit",
        "Bash",
        "ListFiles",
        "Search",
        "Write"
      ]);
    } finally {
      await session.stop();
    }
  });

  it("submits consecutive turns through the same session", async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, "fixture.txt"), "fixture-body", "utf8");
    const output = new RecordingOutput();
    const session = new GodCodeReplSession(dir, {
      renderer: new TerminalRenderer(output),
      stream: true
    });

    try {
      await session.start();

      const readResult = await session.submit("read fixture.txt");
      const listResult = await session.submit("list .");

      expect(readResult.status).toBe("success");
      expect(JSON.stringify(readResult)).toContain("fixture-body");
      expect(listResult.status).toBe("success");
      expect(JSON.stringify(listResult)).toContain("entry/entries");
      expect(session.getStatus()).toBe("idle");
    } finally {
      await session.stop();
    }
  });

  it("uses approval prompt mode for mutating REPL tools", async () => {
    const dir = await createTempDir();
    const approvalPrompt = new FakeApprovalPrompt({ action: "allow", source: "interactive" });
    const session = new GodCodeReplSession(dir, {
      approvalMode: "prompt",
      approvalPrompt
    });

    try {
      await session.start();
      const result = await session.submit("write approved.txt ::: repl-approved");

      expect(result.status).toBe("success");
      expect(await fs.readFile(path.join(dir, "approved.txt"), "utf8")).toBe("repl-approved");
      expect(approvalPrompt.requests).toHaveLength(1);
      expect(approvalPrompt.requests[0]).toMatchObject({
        toolName: "Write",
        cwd: dir
      });
    } finally {
      await session.stop();
    }
  });

  it("returns permission_denied when REPL approval is denied", async () => {
    const dir = await createTempDir();
    const approvalPrompt = new FakeApprovalPrompt({
      action: "deny",
      source: "interactive",
      reason: "User denied tool execution."
    });
    const session = new GodCodeReplSession(dir, {
      approvalMode: "prompt",
      approvalPrompt
    });

    try {
      await session.start();
      const result = await session.submit("write denied.txt ::: repl-denied");

      expect(result.status).toBe("error");
      expect(result.error?.code).toBe("permission_denied");
      await expect(fs.access(path.join(dir, "denied.txt"))).rejects.toThrow();
      expect(approvalPrompt.requests).toHaveLength(1);
    } finally {
      await session.stop();
    }
  });

  it("rejects a second prompt while a turn is running", async () => {
    const dir = await createTempDir();
    const session = new GodCodeReplSession(dir);
    try {
      await session.start();

      const firstTurn = session.submit("hello");

      await expect(session.submit("second")).rejects.toThrow("A turn is already running.");
      await expect(firstTurn).resolves.toMatchObject({ status: "success" });
    } finally {
      await session.stop();
    }
  });
});

describe("runGodCodeRepl", () => {
  it("handles basic slash commands from stdin", async () => {
    const dir = await createTempDir();
    const input = new PassThrough();
    const output = new RecordingOutput();
    const repl = runGodCodeRepl(dir, {
      input,
      output
    });

    input.end("/status\n/tools\n/cancel\n/exit\n");
    await repl;

    const text = output.toString();
    expect(text).toContain("GOD-code REPL.");
    expect(text).toContain("Status: idle");
    expect(text).toContain("Read - Read a UTF-8 text file");
    expect(text).toContain("No running turn.");
  });
});
