import type { ExecuteToolRequest, ToolExecutionResult } from "../types/godCodeProtocol.js";
import type { PermissionPolicy, PolicyContext, PolicyDecision } from "./base.js";
import { allowDecision } from "./base.js";
import { CommandPermissionPolicy, type CommandPolicyOptions } from "./commandPolicy.js";
import { PathPermissionPolicy, type PathPolicyOptions } from "./pathPolicy.js";

export interface DefaultPermissionPolicyOptions {
  path?: PathPolicyOptions;
  command?: CommandPolicyOptions;
}

export class DefaultPermissionPolicy implements PermissionPolicy {
  private readonly pathPolicy: PathPermissionPolicy;
  private readonly commandPolicy: CommandPermissionPolicy;

  public constructor(options: DefaultPermissionPolicyOptions = {}) {
    this.pathPolicy = new PathPermissionPolicy(options.path);
    this.commandPolicy = new CommandPermissionPolicy(options.command);
  }

  public async beforeExecute(
    request: ExecuteToolRequest,
    context: PolicyContext
  ): Promise<PolicyDecision> {
    const pathDecision = this.pathPolicy.decide(request, context);
    if (pathDecision.action !== "allow") {
      return pathDecision;
    }

    const commandDecision = this.commandPolicy.decide(request, context);
    if (commandDecision.action !== "allow") {
      return commandDecision;
    }

    return allowDecision;
  }

  public async afterExecute(
    _request: ExecuteToolRequest,
    _result: ToolExecutionResult,
    _context: PolicyContext
  ): Promise<void> {
    // Hook reserved for future policy state updates.
  }
}
