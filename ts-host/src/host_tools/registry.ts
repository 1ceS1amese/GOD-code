import type {
  BuiltInToolName,
  ExecuteToolRequest,
  ToolExecutionResult,
  ToolName
} from "../types/godCodeProtocol.js";
import type { AuditEvent, AuditSink } from "../audit/auditSink.js";
import { NoopAuditSink } from "../audit/noopAuditSink.js";
import { DefaultPermissionPolicy } from "../policy/defaultPolicy.js";
import type { PermissionPolicy, PolicyContext, PolicyDecision } from "../policy/base.js";
import {
  buildToolApprovalRequest,
  type ToolApprovalDecision,
  type ToolApprovalPrompt
} from "../policy/approval.js";
import { executeBash } from "./bash.js";
import { type HostToolContext, toolCancelled, toolError } from "./common.js";
import { executeEdit } from "./edit.js";
import { executeListFiles } from "./listFiles.js";
import { executeRead } from "./read.js";
import { executeSearch } from "./search.js";
import { executeWrite } from "./write.js";

export type HostToolHandler = (
  input: Record<string, unknown>,
  context: HostToolContext
) => Promise<ToolExecutionResult>;

export interface HostToolRegistryOptions {
  permissionPolicy?: PermissionPolicy;
  approvalPrompt?: ToolApprovalPrompt;
  auditSink?: AuditSink;
}

interface AuditWarning {
  code: "audit_error";
  event_type: AuditEvent["type"];
  message: string;
}

export class HostToolRegistry {
  private readonly handlers = new Map<ToolName, HostToolHandler>();
  private readonly permissionPolicy: PermissionPolicy;
  private readonly approvalPrompt?: ToolApprovalPrompt;
  private readonly auditSink: AuditSink;

  public constructor(options: HostToolRegistryOptions = {}) {
    this.permissionPolicy = options.permissionPolicy ?? new DefaultPermissionPolicy();
    this.approvalPrompt = options.approvalPrompt;
    this.auditSink = options.auditSink ?? new NoopAuditSink();
  }

  public register(name: ToolName, handler: HostToolHandler): void {
    this.handlers.set(name, handler);
  }

  private async executeRaw(
    name: ToolName,
    input: Record<string, unknown>,
    context: HostToolContext
  ): Promise<ToolExecutionResult> {
    const handler = this.handlers.get(name);
    if (!handler) {
      return toolError("unknown_tool", `Unknown host tool: ${name}`);
    }

    try {
      return await handler(input, context);
    } catch (error) {
      return toolError("tool_exception", error instanceof Error ? error.message : String(error), {
        tool_name: name
      });
    }
  }

  public async executeRequest(
    request: ExecuteToolRequest,
    context: HostToolContext
  ): Promise<ToolExecutionResult> {
    const auditWarnings: AuditWarning[] = [];
    const policyContext: PolicyContext = {
      ...context,
      sessionId: request.session_id,
      turnId: request.turn_id,
      toolCallId: request.tool_call_id
    };

    this.collectAuditWarning(auditWarnings, await this.recordAudit({
      type: "tool_requested",
      request,
      context: policyContext
    }));

    const decision = await this.runBeforePolicy(request, policyContext);
    if ("ok" in decision) {
      return await this.finishRequest(request, decision, auditWarnings);
    }

    this.collectAuditWarning(auditWarnings, await this.recordAudit({
      type: "tool_decision",
      request,
      decision
    }));

    if (decision.action === "deny") {
      return await this.finishRequest(
        request,
        permissionDenied(request.tool_name, decision.reason),
        auditWarnings
      );
    }

    if (decision.action === "prompt") {
      const approval = await this.requestApproval(request, policyContext, decision.reason);
      this.collectAuditWarning(auditWarnings, await this.recordAudit({
        type: "tool_approval",
        request,
        approval
      }));
      if (approval.action === "deny") {
        return await this.finishRequest(
          request,
          permissionDenied(request.tool_name, approval.reason),
          auditWarnings
        );
      }
    }

    if (context.abortSignal?.aborted) {
      const result = toolCancelled(`Tool was cancelled before execution: ${request.tool_name}`, {
        tool_name: request.tool_name,
        tool_call_id: request.tool_call_id
      });
      return await this.finishRequest(request, result, auditWarnings);
    }

    const result = await this.executeRaw(request.tool_name, request.input, context);
    const policyWarning = await this.runAfterPolicy(request, result, policyContext);
    const finalResult = policyWarning
      ? attachPolicyWarning(result, policyWarning)
      : result;

    return await this.finishRequest(request, finalResult, auditWarnings);
  }

  private async runBeforePolicy(
    request: ExecuteToolRequest,
    context: PolicyContext
  ): Promise<PolicyDecision | ToolExecutionResult> {
    try {
      return await this.permissionPolicy.beforeExecute(request, context);
    } catch (error) {
      return toolError("policy_error", error instanceof Error ? error.message : String(error), {
        tool_name: request.tool_name
      });
    }
  }

  private async runAfterPolicy(
    request: ExecuteToolRequest,
    result: ToolExecutionResult,
    context: PolicyContext
  ): Promise<Record<string, unknown> | undefined> {
    try {
      await this.permissionPolicy.afterExecute(request, result, context);
      return undefined;
    } catch (error) {
      return {
        code: "policy_error",
        message: error instanceof Error ? error.message : String(error),
        phase: "after_execute",
        tool_name: request.tool_name
      };
    }
  }

  private async requestApproval(
    request: ExecuteToolRequest,
    context: PolicyContext,
    reason: string
  ): Promise<ToolApprovalDecision> {
    if (!this.approvalPrompt) {
      return {
        action: "deny",
        source: "unavailable",
        reason: `Interactive approval is not configured: ${reason}`
      };
    }
    try {
      return await this.approvalPrompt.requestApproval(
        buildToolApprovalRequest(request, context, reason),
        context.abortSignal
      );
    } catch (error) {
      return {
        action: "deny",
        source: "unavailable",
        reason: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async finishRequest(
    request: ExecuteToolRequest,
    result: ToolExecutionResult,
    warnings: AuditWarning[]
  ): Promise<ToolExecutionResult> {
    let finalResult = warnings.length > 0
      ? attachAuditWarnings(result, warnings)
      : result;
    const finishWarning = await this.recordAudit({
      type: "tool_finished",
      request,
      result: finalResult
    });
    if (finishWarning) {
      finalResult = attachAuditWarnings(finalResult, [finishWarning]);
    }
    return finalResult;
  }

  private collectAuditWarning(
    warnings: AuditWarning[],
    warning: AuditWarning | undefined
  ): void {
    if (warning) {
      warnings.push(warning);
    }
  }

  private async recordAudit(event: AuditEvent): Promise<AuditWarning | undefined> {
    try {
      await this.auditSink.record(event);
      return undefined;
    } catch (error) {
      return {
        code: "audit_error",
        event_type: event.type,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

export function createDefaultHostToolRegistry(options: HostToolRegistryOptions = {}): HostToolRegistry {
  const registry = new HostToolRegistry(options);
  registry.register("Read" satisfies BuiltInToolName, executeRead);
  registry.register("Edit" satisfies BuiltInToolName, executeEdit);
  registry.register("Bash" satisfies BuiltInToolName, executeBash);
  registry.register("ListFiles" satisfies BuiltInToolName, executeListFiles);
  registry.register("Search" satisfies BuiltInToolName, executeSearch);
  registry.register("Write" satisfies BuiltInToolName, executeWrite);
  return registry;
}

function permissionDenied(toolName: ToolName, reason: string): ToolExecutionResult {
  return toolError("permission_denied", reason, {
    tool_name: toolName,
    reason
  });
}

function attachPolicyWarning(
  result: ToolExecutionResult,
  warning: Record<string, unknown>
): ToolExecutionResult {
  return {
    ...result,
    output: {
      ...result.output,
      policy_warning: warning
    }
  };
}

function attachAuditWarnings(
  result: ToolExecutionResult,
  warnings: readonly AuditWarning[]
): ToolExecutionResult {
  const existingWarnings = Array.isArray(result.output?.audit_warnings)
    ? result.output.audit_warnings
    : [];
  return {
    ...result,
    output: {
      ...result.output,
      audit_warnings: [...existingWarnings, ...warnings]
    }
  };
}
