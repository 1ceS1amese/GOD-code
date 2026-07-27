import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AuditEvent, AuditSink } from "../src/audit/auditSink.js";
import { MemoryAuditSink } from "../src/audit/memoryAuditSink.js";
import type { HostToolContext } from "../src/host_tools/common.js";
import { createDefaultHostToolRegistry } from "../src/host_tools/registry.js";
import { DefaultPermissionPolicy } from "../src/policy/defaultPolicy.js";
import type { PermissionPolicy, PolicyDecision } from "../src/policy/base.js";
import {
  PromptingPermissionPolicy,
  type ToolApprovalDecision,
  type ToolApprovalPrompt,
  type ToolApprovalRequest
} from "../src/policy/approval.js";
import type { ExecuteToolRequest } from "../src/types/godCodeProtocol.js";

const registry = createDefaultHostToolRegistry();
const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "god-code-"));
  tempDirs.push(dir);
  return dir;
}

function toolRequest(
  toolName: ExecuteToolRequest["tool_name"],
  input: Record<string, unknown>
): ExecuteToolRequest {
  return {
    session_id: "session-1",
    turn_id: "turn-1",
    tool_call_id: `${toolName.toLowerCase()}-1`,
    tool_name: toolName,
    input
  };
}

class FakeApprovalPrompt implements ToolApprovalPrompt {
  public readonly requests: ToolApprovalRequest[] = [];

  public constructor(private readonly decision: ToolApprovalDecision) {}

  public async requestApproval(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
    this.requests.push(request);
    return this.decision;
  }
}

class FailingAuditSink implements AuditSink {
  public async record(event: AuditEvent): Promise<void> {
    throw new Error(`audit failed: ${event.type}`);
  }
}

async function executeWithDefaultRegistry(
  toolName: ExecuteToolRequest["tool_name"],
  input: Record<string, unknown>,
  context: HostToolContext
) {
  return await registry.executeRequest(toolRequest(toolName, input), context);
}

describe("Host tools", () => {
  it("reads utf-8 files", async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, "note.txt"), "hello world", "utf8");

    const result = await executeWithDefaultRegistry("Read", { path: "note.txt" }, { cwd: dir });
    expect(result.ok).toBe(true);
    expect(result.output?.content).toBe("hello world");
  });

  it("returns file_not_found for missing reads", async () => {
    const dir = await createTempDir();

    const result = await executeWithDefaultRegistry("Read", { path: "missing.txt" }, { cwd: dir });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("file_not_found");
  });

  it("edits files with literal replacement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "edit.txt");
    await fs.writeFile(filePath, "hello hello", "utf8");

    const result = await executeWithDefaultRegistry(
      "Edit",
      { path: "edit.txt", find: "hello", replace: "world" },
      { cwd: dir }
    );

    expect(result.ok).toBe(true);
    expect(result.output?.replacements).toBe(2);
    expect(await fs.readFile(filePath, "utf8")).toBe("world world");
  });

  it("returns no_match when edit target is absent", async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, "edit.txt"), "hello", "utf8");

    const result = await executeWithDefaultRegistry(
      "Edit",
      { path: "edit.txt", find: "missing", replace: "world" },
      { cwd: dir }
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("no_match");
  });

  it("runs bash commands", async () => {
    const dir = await createTempDir();

    const result = await executeWithDefaultRegistry("Bash", { command: "printf ok" }, { cwd: dir });
    expect(result.ok).toBe(true);
    expect(result.output?.stdout).toBe("ok");
  });

  it("denies bash cwd outside the session cwd without spawning", async () => {
    const root = await createTempDir();
    const cwd = path.join(root, "workspace");
    await fs.mkdir(cwd);

    const result = await executeWithDefaultRegistry(
      "Bash",
      { command: "touch should-not-run.txt", cwd: ".." },
      { cwd }
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("permission_denied");
    expect(result.error?.message).toBe("Bash cwd is limited to the session cwd.");
    await expect(fs.access(path.join(root, "should-not-run.txt"))).rejects.toThrow();
  });

  it("allows bash cwd inside the session cwd", async () => {
    const dir = await createTempDir();
    const subdir = path.join(dir, "subdir");
    await fs.mkdir(subdir);

    const result = await executeWithDefaultRegistry(
      "Bash",
      { command: "pwd", cwd: "subdir" },
      { cwd: dir }
    );

    expect(result.ok).toBe(true);
    expect(String(result.output?.stdout).trim()).toBe(subdir);
  });

  it("lists directory entries", async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, "a.txt"), "a", "utf8");
    await fs.mkdir(path.join(dir, "nested"));

    const result = await executeWithDefaultRegistry("ListFiles", { path: "." }, { cwd: dir });

    expect(result.ok).toBe(true);
    expect(result.output?.entries).toEqual([
      { path: path.join(dir, "a.txt"), name: "a.txt", type: "file" },
      { path: path.join(dir, "nested"), name: "nested", type: "directory" }
    ]);
  });

  it("returns too_many_entries when ListFiles exceeds max_entries", async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, "a.txt"), "a", "utf8");
    await fs.writeFile(path.join(dir, "b.txt"), "b", "utf8");

    const result = await executeWithDefaultRegistry("ListFiles", { path: ".", max_entries: 1 }, { cwd: dir });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("too_many_entries");
  });

  it("searches text files with literal matching", async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, "note.txt"), "one\nGOD-code\nthree", "utf8");

    const result = await executeWithDefaultRegistry(
      "Search",
      { path: ".", pattern: "GOD-code" },
      { cwd: dir }
    );

    expect(result.ok).toBe(true);
    expect(result.output?.matches).toEqual([
      { path: path.join(dir, "note.txt"), line_number: 2, line: "GOD-code" }
    ]);
  });

  it("skips binary files during Search", async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, "binary.bin"), Buffer.from([0, 71, 79, 68]));

    const result = await executeWithDefaultRegistry("Search", { path: ".", pattern: "GOD" }, { cwd: dir });

    expect(result.ok).toBe(true);
    expect(result.output?.matches).toEqual([]);
  });

  it("returns too_many_matches when Search exceeds max_matches", async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, "note.txt"), "hit\nhit\n", "utf8");

    const result = await executeWithDefaultRegistry(
      "Search",
      { path: ".", pattern: "hit", max_matches: 1 },
      { cwd: dir }
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("too_many_matches");
  });

  it("writes new files without overwriting by default", async () => {
    const dir = await createTempDir();

    const result = await executeWithDefaultRegistry(
      "Write",
      { path: "new.txt", content: "hello" },
      { cwd: dir }
    );

    expect(result.ok).toBe(true);
    expect(result.output?.bytes).toBe(5);
    expect(await fs.readFile(path.join(dir, "new.txt"), "utf8")).toBe("hello");
  });

  it("refuses to overwrite existing files by default", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "existing.txt");
    await fs.writeFile(filePath, "old", "utf8");

    const result = await executeWithDefaultRegistry(
      "Write",
      { path: "existing.txt", content: "new" },
      { cwd: dir }
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("file_exists");
    expect(await fs.readFile(filePath, "utf8")).toBe("old");
  });

  it("overwrites existing files when overwrite is true", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "existing.txt");
    await fs.writeFile(filePath, "old", "utf8");

    const result = await executeWithDefaultRegistry(
      "Write",
      { path: "existing.txt", content: "new", overwrite: true },
      { cwd: dir }
    );

    expect(result.ok).toBe(true);
    expect(result.output?.overwritten).toBe(true);
    expect(await fs.readFile(filePath, "utf8")).toBe("new");
  });

  it("returns command_failed for non-zero exit", async () => {
    const dir = await createTempDir();

    const result = await executeWithDefaultRegistry("Bash", { command: "exit 3" }, { cwd: dir });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("command_failed");
  });

  it("returns command_timed_out for slow commands", async () => {
    const dir = await createTempDir();

    const result = await executeWithDefaultRegistry(
      "Bash",
      { command: "sleep 1", timeout_ms: 50 },
      { cwd: dir }
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("command_timed_out");
  });

  it("denies reads outside cwd through default policy", async () => {
    const root = await createTempDir();
    const cwd = path.join(root, "workspace");
    await fs.mkdir(cwd);
    await fs.writeFile(path.join(root, "secret.txt"), "secret", "utf8");

    const result = await registry.executeRequest(toolRequest("Read", { path: "../secret.txt" }), {
      cwd
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("permission_denied");
  });

  it("denies edits that match the path denylist without writing", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "edit.txt");
    await fs.writeFile(filePath, "hello", "utf8");
    const auditSink = new MemoryAuditSink();
    const lockedRegistry = createDefaultHostToolRegistry({
      auditSink,
      permissionPolicy: new DefaultPermissionPolicy({
        path: {
          denylist: ["edit.txt"]
        }
      })
    });

    const result = await lockedRegistry.executeRequest(
      toolRequest("Edit", { path: "edit.txt", find: "hello", replace: "world" }),
      { cwd: dir }
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("permission_denied");
    expect(await fs.readFile(filePath, "utf8")).toBe("hello");
    expect(auditSink.events.map((event) => event.type)).toEqual([
      "tool_requested",
      "tool_decision",
      "tool_finished"
    ]);
    expect(auditSink.events[2]).toMatchObject({
      type: "tool_finished",
      result: {
        ok: false,
        error: {
          code: "permission_denied"
        }
      }
    });
  });

  it("denies bash commands that match the command denylist", async () => {
    const dir = await createTempDir();

    const result = await registry.executeRequest(
      toolRequest("Bash", { command: "printf nope && shutdown now" }),
      { cwd: dir }
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("permission_denied");
  });

  it("applies path policy to new host tools", async () => {
    const root = await createTempDir();
    const cwd = path.join(root, "workspace");
    await fs.mkdir(cwd);
    await fs.writeFile(path.join(root, "secret.txt"), "secret", "utf8");

    const listResult = await registry.executeRequest(toolRequest("ListFiles", { path: ".." }), {
      cwd
    });
    const searchResult = await registry.executeRequest(
      toolRequest("Search", { path: "../secret.txt", pattern: "secret" }),
      { cwd }
    );
    const writeResult = await registry.executeRequest(
      toolRequest("Write", { path: "../secret.txt", content: "changed" }),
      { cwd }
    );

    expect(listResult.error?.code).toBe("permission_denied");
    expect(searchResult.error?.code).toBe("permission_denied");
    expect(writeResult.error?.code).toBe("permission_denied");
    expect(await fs.readFile(path.join(root, "secret.txt"), "utf8")).toBe("secret");
  });

  it("wraps policy exceptions as policy_error", async () => {
    const dir = await createTempDir();
    const auditSink = new MemoryAuditSink();
    const throwingPolicy: PermissionPolicy = {
      async beforeExecute(): Promise<PolicyDecision> {
        throw new Error("policy exploded");
      },
      async afterExecute(): Promise<void> {
        // No-op.
      }
    };
    const lockedRegistry = createDefaultHostToolRegistry({
      auditSink,
      permissionPolicy: throwingPolicy
    });

    const result = await lockedRegistry.executeRequest(
      toolRequest("Read", { path: "note.txt" }),
      { cwd: dir }
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("policy_error");
    expect(auditSink.events.map((event) => event.type)).toEqual([
      "tool_requested",
      "tool_finished"
    ]);
    expect(auditSink.events[1]).toMatchObject({
      type: "tool_finished",
      result: {
        ok: false,
        error: {
          code: "policy_error"
        }
      }
    });
  });

  it("preserves committed tool results when after-policy observation fails", async () => {
    const dir = await createTempDir();
    const auditSink = new MemoryAuditSink();
    const afterFailurePolicy: PermissionPolicy = {
      async beforeExecute(): Promise<PolicyDecision> {
        return { action: "allow" };
      },
      async afterExecute(): Promise<void> {
        throw new Error("after policy failed");
      }
    };
    const guardedRegistry = createDefaultHostToolRegistry({
      auditSink,
      permissionPolicy: afterFailurePolicy
    });

    const writeResult = await guardedRegistry.executeRequest(
      toolRequest("Write", { path: "committed.txt", content: "committed" }),
      { cwd: dir }
    );
    const readResult = await guardedRegistry.executeRequest(
      toolRequest("Read", { path: "missing.txt" }),
      { cwd: dir }
    );

    expect(writeResult).toMatchObject({
      ok: true,
      output: {
        bytes: 9,
        policy_warning: {
          code: "policy_error",
          message: "after policy failed",
          phase: "after_execute",
          tool_name: "Write"
        }
      }
    });
    expect(await fs.readFile(path.join(dir, "committed.txt"), "utf8")).toBe("committed");
    expect(readResult).toMatchObject({
      ok: false,
      error: {
        code: "file_not_found"
      },
      output: {
        policy_warning: {
          code: "policy_error",
          message: "after policy failed",
          phase: "after_execute",
          tool_name: "Read"
        }
      }
    });
    expect(auditSink.events.filter((event) => event.type === "tool_finished"))
      .toEqual([
        expect.objectContaining({ type: "tool_finished", result: writeResult }),
        expect.objectContaining({ type: "tool_finished", result: readResult })
      ]);
  });

  it("audits unavailable interactive approval before denying execution", async () => {
    const dir = await createTempDir();
    const auditSink = new MemoryAuditSink();
    const promptPolicy: PermissionPolicy = {
      async beforeExecute(): Promise<PolicyDecision> {
        return { action: "prompt", reason: "needs approval" };
      },
      async afterExecute(): Promise<void> {
        // No-op.
      }
    };
    const lockedRegistry = createDefaultHostToolRegistry({
      auditSink,
      permissionPolicy: promptPolicy
    });

    const result = await lockedRegistry.executeRequest(
      toolRequest("Bash", { command: "printf should-not-run" }),
      { cwd: dir }
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("permission_denied");
    expect(result.error?.message).toBe(
      "Interactive approval is not configured: needs approval"
    );
    expect(auditSink.events.map((event) => event.type)).toEqual([
      "tool_requested",
      "tool_decision",
      "tool_approval",
      "tool_finished"
    ]);
    expect(auditSink.events[2]).toMatchObject({
      type: "tool_approval",
      approval: {
        action: "deny",
        source: "unavailable",
        reason: "Interactive approval is not configured: needs approval"
      }
    });
    expect(auditSink.events[3]).toMatchObject({
      type: "tool_finished",
      result: {
        ok: false,
        error: {
          code: "permission_denied"
        }
      }
    });
  });

  it("audits approval prompt failures as unavailable denials", async () => {
    const dir = await createTempDir();
    const auditSink = new MemoryAuditSink();
    const promptPolicy: PermissionPolicy = {
      async beforeExecute(): Promise<PolicyDecision> {
        return { action: "prompt", reason: "needs approval" };
      },
      async afterExecute(): Promise<void> {
        // No-op.
      }
    };
    const failedRegistry = createDefaultHostToolRegistry({
      auditSink,
      permissionPolicy: promptPolicy,
      approvalPrompt: {
        async requestApproval(): Promise<never> {
          throw new Error("approval channel failed");
        }
      }
    });

    const result = await failedRegistry.executeRequest(
      toolRequest("Write", { path: "denied.txt", content: "should not write" }),
      { cwd: dir }
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "permission_denied",
        message: "approval channel failed"
      }
    });
    expect(auditSink.events.map((event) => event.type)).toEqual([
      "tool_requested",
      "tool_decision",
      "tool_approval",
      "tool_finished"
    ]);
    expect(auditSink.events[2]).toMatchObject({
      type: "tool_approval",
      approval: {
        action: "deny",
        source: "unavailable",
        reason: "approval channel failed"
      }
    });
    await expect(fs.access(path.join(dir, "denied.txt"))).rejects.toThrow();
  });

  it("executes prompt policy decisions after interactive approval", async () => {
    const dir = await createTempDir();
    const auditSink = new MemoryAuditSink();
    const approvalPrompt = new FakeApprovalPrompt({ action: "allow", source: "interactive" });
    const promptPolicy: PermissionPolicy = {
      async beforeExecute(): Promise<PolicyDecision> {
        return { action: "prompt", reason: "needs approval" };
      },
      async afterExecute(): Promise<void> {
        // No-op.
      }
    };
    const approvedRegistry = createDefaultHostToolRegistry({
      auditSink,
      permissionPolicy: promptPolicy,
      approvalPrompt
    });

    const result = await approvedRegistry.executeRequest(
      toolRequest("Bash", { command: "printf approved" }),
      { cwd: dir }
    );

    expect(result.ok).toBe(true);
    expect(result.output?.stdout).toBe("approved");
    expect(approvalPrompt.requests[0]).toMatchObject({
      toolName: "Bash",
      reason: "needs approval",
      cwd: dir
    });
    expect(approvalPrompt.requests[0]?.inputSummary.lines).toContainEqual({
      label: "command",
      value: "printf approved"
    });
    expect(auditSink.events.map((event) => event.type)).toEqual([
      "tool_requested",
      "tool_decision",
      "tool_approval",
      "tool_finished"
    ]);
    expect(auditSink.events[2]).toMatchObject({
      type: "tool_approval",
      approval: {
        action: "allow"
      }
    });
  });

  it("denies prompt policy decisions when interactive approval is denied", async () => {
    const dir = await createTempDir();
    const approvalPrompt = new FakeApprovalPrompt({
      action: "deny",
      source: "interactive",
      reason: "User denied tool execution."
    });
    const promptPolicy: PermissionPolicy = {
      async beforeExecute(): Promise<PolicyDecision> {
        return { action: "prompt", reason: "needs approval" };
      },
      async afterExecute(): Promise<void> {
        // No-op.
      }
    };
    const deniedRegistry = createDefaultHostToolRegistry({
      permissionPolicy: promptPolicy,
      approvalPrompt
    });

    const result = await deniedRegistry.executeRequest(
      toolRequest("Write", { path: "denied.txt", content: "should not write" }),
      { cwd: dir }
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("permission_denied");
    expect(result.error?.message).toBe("User denied tool execution.");
    await expect(fs.access(path.join(dir, "denied.txt"))).rejects.toThrow();
    expect(approvalPrompt.requests).toHaveLength(1);
  });

  it("prompts for mutating tools in prompt approval mode without relaxing hard denies", async () => {
    const dir = await createTempDir();
    const approvalPrompt = new FakeApprovalPrompt({ action: "allow", source: "interactive" });
    const approvalRegistry = createDefaultHostToolRegistry({
      approvalPrompt,
      permissionPolicy: new PromptingPermissionPolicy(new DefaultPermissionPolicy())
    });

    const readResult = await approvalRegistry.executeRequest(toolRequest("Read", { path: "missing.txt" }), {
      cwd: dir
    });
    const deniedBashResult = await approvalRegistry.executeRequest(
      toolRequest("Bash", { command: "printf nope && shutdown now" }),
      { cwd: dir }
    );
    const writeResult = await approvalRegistry.executeRequest(
      toolRequest("Write", { path: "approved.txt", content: "approved" }),
      { cwd: dir }
    );

    expect(readResult.ok).toBe(false);
    expect(readResult.error?.code).toBe("file_not_found");
    expect(deniedBashResult.ok).toBe(false);
    expect(deniedBashResult.error?.code).toBe("permission_denied");
    expect(writeResult.ok).toBe(true);
    expect(await fs.readFile(path.join(dir, "approved.txt"), "utf8")).toBe("approved");
    expect(approvalPrompt.requests.map((request) => request.toolName)).toEqual(["Write"]);
  });

  it("cancels bash subprocesses through AbortSignal", async () => {
    const dir = await createTempDir();
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 50);

    const result = await executeWithDefaultRegistry("Bash", { command: "sleep 5" }, {
      cwd: dir,
      abortSignal: controller.signal
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("tool_cancelled");
  });

  it("records audit events around allowed tool execution", async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, "note.txt"), "hello", "utf8");
    const auditSink = new MemoryAuditSink();
    const auditedRegistry = createDefaultHostToolRegistry({ auditSink });

    const result = await auditedRegistry.executeRequest(toolRequest("Read", { path: "note.txt" }), {
      cwd: dir
    });

    expect(result.ok).toBe(true);
    expect(auditSink.events.map((event) => event.type)).toEqual([
      "tool_requested",
      "tool_decision",
      "tool_finished"
    ]);
  });

  it("reports audit sink failures without changing approved tool execution", async () => {
    const dir = await createTempDir();
    const approvalPrompt = new FakeApprovalPrompt({ action: "allow", source: "interactive" });
    const promptPolicy: PermissionPolicy = {
      async beforeExecute(): Promise<PolicyDecision> {
        return { action: "prompt", reason: "needs approval" };
      },
      async afterExecute(): Promise<void> {
        // No-op.
      }
    };
    const auditedRegistry = createDefaultHostToolRegistry({
      auditSink: new FailingAuditSink(),
      permissionPolicy: promptPolicy,
      approvalPrompt
    });

    const result = await auditedRegistry.executeRequest(
      toolRequest("Write", { path: "audited.txt", content: "written" }),
      { cwd: dir }
    );

    expect(result).toMatchObject({
      ok: true,
      output: {
        audit_warnings: [
          {
            code: "audit_error",
            event_type: "tool_requested",
            message: "audit failed: tool_requested"
          },
          {
            code: "audit_error",
            event_type: "tool_decision",
            message: "audit failed: tool_decision"
          },
          {
            code: "audit_error",
            event_type: "tool_approval",
            message: "audit failed: tool_approval"
          },
          {
            code: "audit_error",
            event_type: "tool_finished",
            message: "audit failed: tool_finished"
          }
        ]
      }
    });
    expect(await fs.readFile(path.join(dir, "audited.txt"), "utf8")).toBe("written");
    expect(approvalPrompt.requests).toHaveLength(1);
  });

  it("keeps audit warnings on pre-execution failure paths", async () => {
    const dir = await createTempDir();
    const rejectedRegistry = createDefaultHostToolRegistry({
      auditSink: new FailingAuditSink(),
      permissionPolicy: {
        async beforeExecute(): Promise<PolicyDecision> {
          throw new Error("policy unavailable");
        },
        async afterExecute(): Promise<void> {
          // No-op.
        }
      }
    });

    const result = await rejectedRegistry.executeRequest(
      toolRequest("Write", { path: "blocked.txt", content: "blocked" }),
      { cwd: dir }
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "policy_error",
        message: "policy unavailable"
      },
      output: {
        audit_warnings: [
          expect.objectContaining({ event_type: "tool_requested" }),
          expect.objectContaining({ event_type: "tool_finished" })
        ]
      }
    });
    await expect(fs.access(path.join(dir, "blocked.txt"))).rejects.toThrow();
  });
});
