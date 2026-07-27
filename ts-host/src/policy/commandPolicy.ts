import type { ExecuteToolRequest } from "../types/godCodeProtocol.js";
import type { PolicyContext, PolicyDecision } from "./base.js";
import { allowDecision } from "./base.js";

const DEFAULT_COMMAND_DENYLIST = ["rm -rf /", "mkfs", "shutdown", "reboot"];

export interface CommandPolicyOptions {
  allowlist?: string[];
  denylist?: string[];
}

export class CommandPermissionPolicy {
  private readonly allowlist: string[];
  private readonly denylist: string[];

  public constructor(options: CommandPolicyOptions = {}) {
    this.allowlist = options.allowlist ?? [];
    this.denylist = options.denylist ?? DEFAULT_COMMAND_DENYLIST;
  }

  public decide(request: ExecuteToolRequest, _context: PolicyContext): PolicyDecision {
    if (request.tool_name !== "Bash") {
      return allowDecision;
    }

    const command = request.input.command;
    if (typeof command !== "string" || command.length === 0) {
      return allowDecision;
    }

    const deniedPattern = this.denylist.find((pattern) => command.includes(pattern));
    if (deniedPattern) {
      return {
        action: "deny",
        reason: `Bash command matched denylist pattern: ${deniedPattern}`
      };
    }

    if (this.allowlist.length > 0 && !this.allowlist.some((pattern) => command.includes(pattern))) {
      return {
        action: "deny",
        reason: "Bash command is not covered by command allowlist."
      };
    }

    return allowDecision;
  }
}
