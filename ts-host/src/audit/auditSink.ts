import type { ExecuteToolRequest, ToolExecutionResult } from "../types/godCodeProtocol.js";
import type { ToolApprovalDecision } from "../policy/approval.js";
import type { PolicyContext, PolicyDecision } from "../policy/base.js";

export type AuditEvent =
  | {
      type: "tool_requested";
      request: ExecuteToolRequest;
      context: PolicyContext;
    }
  | {
      type: "tool_decision";
      request: ExecuteToolRequest;
      decision: PolicyDecision;
    }
  | {
      type: "tool_approval";
      request: ExecuteToolRequest;
      approval: ToolApprovalDecision;
    }
  | {
      type: "tool_finished";
      request: ExecuteToolRequest;
      result: ToolExecutionResult;
    };

export interface AuditSink {
  record(event: AuditEvent): Promise<void>;
}
