import type {
  ExecuteToolRequest,
  ToolExecutionResult
} from "../types/godCodeProtocol.js";
import type { HostToolContext } from "../host_tools/common.js";

export interface PolicyContext extends HostToolContext {
  sessionId: string;
  turnId: string;
  toolCallId: string;
  resolvedPath?: string;
}

export type PolicyDecision =
  | { action: "allow" }
  | { action: "deny"; reason: string }
  | { action: "prompt"; reason: string };

export interface PermissionPolicy {
  beforeExecute(request: ExecuteToolRequest, context: PolicyContext): Promise<PolicyDecision>;
  afterExecute(
    request: ExecuteToolRequest,
    result: ToolExecutionResult,
    context: PolicyContext
  ): Promise<void>;
}

export const allowDecision: PolicyDecision = { action: "allow" };

export class AllowAllPermissionPolicy implements PermissionPolicy {
  public async beforeExecute(): Promise<PolicyDecision> {
    return allowDecision;
  }

  public async afterExecute(): Promise<void> {
    // No-op.
  }
}
