import path from "node:path";
import type { ExecuteToolRequest } from "../types/godCodeProtocol.js";
import { isPathInside, resolveToolPath } from "../host_tools/common.js";
import type { PolicyContext, PolicyDecision } from "./base.js";
import { allowDecision } from "./base.js";

export interface PathPolicyOptions {
  allowlist?: string[];
  denylist?: string[];
  enforceCwd?: boolean;
}

export class PathPermissionPolicy {
  private readonly allowlist: string[];
  private readonly denylist: string[];
  private readonly enforceCwd: boolean;

  public constructor(options: PathPolicyOptions = {}) {
    this.allowlist = options.allowlist ?? [];
    this.denylist = options.denylist ?? [];
    this.enforceCwd = options.enforceCwd ?? true;
  }

  public decide(request: ExecuteToolRequest, context: PolicyContext): PolicyDecision {
    if (!pathPolicyAppliesTo(request.tool_name)) {
      return allowDecision;
    }

    const rawPath = request.input.path;
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      return allowDecision;
    }

    const resolvedPath = resolveToolPath(context.cwd, rawPath);
    context.resolvedPath = resolvedPath;

    if (this.enforceCwd && !isPathInside(context.cwd, resolvedPath)) {
      return {
        action: "deny",
        reason: `${request.tool_name} is limited to the session cwd.`
      };
    }

    if (this.matchesAnyPath(context.cwd, resolvedPath, this.denylist)) {
      return {
        action: "deny",
        reason: `${request.tool_name} path is denied by path denylist.`
      };
    }

    if (this.allowlist.length > 0 && !this.matchesAnyPath(context.cwd, resolvedPath, this.allowlist)) {
      return {
        action: "deny",
        reason: `${request.tool_name} path is not covered by path allowlist.`
      };
    }

    return allowDecision;
  }

  private matchesAnyPath(cwd: string, resolvedPath: string, entries: string[]): boolean {
    return entries.some((entry) => {
      const resolvedEntry = path.isAbsolute(entry) ? path.resolve(entry) : resolveToolPath(cwd, entry);
      return resolvedPath === resolvedEntry || isPathInside(resolvedEntry, resolvedPath);
    });
  }
}

function pathPolicyAppliesTo(toolName: ExecuteToolRequest["tool_name"]): boolean {
  return (
    toolName === "Read" ||
    toolName === "Edit" ||
    toolName === "ListFiles" ||
    toolName === "Search" ||
    toolName === "Write"
  );
}
