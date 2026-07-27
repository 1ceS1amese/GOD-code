import type { ExecuteToolRequest, ToolName } from "../types/godCodeProtocol.js";
import type { PermissionPolicy, PolicyContext, PolicyDecision } from "./base.js";

export type ToolApprovalMode = "never" | "prompt";

export interface ToolApprovalInputSummary {
  lines: ToolApprovalSummaryLine[];
  truncated: boolean;
  redacted: boolean;
}

export interface ToolApprovalSummaryLine {
  label: string;
  value: string;
}

export type ToolApprovalDecision =
  | { action: "allow"; source: "interactive"; reason?: string }
  | {
      action: "deny";
      source: "interactive" | "non_interactive" | "unavailable";
      reason: string;
    };

export interface ToolApprovalRequest {
  toolName: ToolName;
  reason: string;
  cwd: string;
  sessionId: string;
  turnId: string;
  toolCallId: string;
  inputSummary: ToolApprovalInputSummary;
}

export interface ToolApprovalPrompt {
  requestApproval(request: ToolApprovalRequest, signal?: AbortSignal): Promise<ToolApprovalDecision>;
}

export interface PromptingPermissionPolicyOptions {
  promptToolNames?: readonly ToolName[];
  allowToolNames?: readonly ToolName[];
}

const DEFAULT_APPROVAL_PREVIEW_CHARS = 500;
const DEFAULT_READ_ONLY_TOOLS = new Set<ToolName>(["Read", "ListFiles", "Search"]);
const DEFAULT_PROMPT_TOOLS = new Set<ToolName>(["Edit", "Write", "Bash"]);
const SENSITIVE_KEY_PATTERN = /api[_-]?key|authorization|bearer|cookie|credential|header|password|secret|token/i;

export class PromptingPermissionPolicy implements PermissionPolicy {
  private readonly promptToolNames: Set<ToolName>;
  private readonly allowToolNames: Set<ToolName>;

  public constructor(
    private readonly basePolicy: PermissionPolicy,
    options: PromptingPermissionPolicyOptions = {}
  ) {
    this.promptToolNames = new Set(options.promptToolNames ?? DEFAULT_PROMPT_TOOLS);
    this.allowToolNames = new Set(options.allowToolNames ?? DEFAULT_READ_ONLY_TOOLS);
  }

  public async beforeExecute(
    request: ExecuteToolRequest,
    context: PolicyContext
  ): Promise<PolicyDecision> {
    const baseDecision = await this.basePolicy.beforeExecute(request, context);
    if (baseDecision.action !== "allow") {
      return baseDecision;
    }
    if (!this.shouldPrompt(request.tool_name)) {
      return baseDecision;
    }
    return {
      action: "prompt",
      reason: approvalReasonForTool(request.tool_name)
    };
  }

  public async afterExecute(
    request: ExecuteToolRequest,
    result: Parameters<PermissionPolicy["afterExecute"]>[1],
    context: PolicyContext
  ): Promise<void> {
    await this.basePolicy.afterExecute(request, result, context);
  }

  private shouldPrompt(toolName: ToolName): boolean {
    if (this.allowToolNames.has(toolName)) {
      return false;
    }
    return this.promptToolNames.has(toolName) || !DEFAULT_READ_ONLY_TOOLS.has(toolName);
  }
}

export function buildToolApprovalRequest(
  request: ExecuteToolRequest,
  context: PolicyContext,
  reason: string
): ToolApprovalRequest {
  return {
    toolName: request.tool_name,
    reason,
    cwd: context.cwd,
    sessionId: request.session_id,
    turnId: request.turn_id,
    toolCallId: request.tool_call_id,
    inputSummary: summarizeToolApprovalInput(request)
  };
}

export function parseToolApprovalMode(value: string, source: string): ToolApprovalMode {
  if (value === "never" || value === "prompt") {
    return value;
  }
  throw new Error(`Invalid ${source}: expected never or prompt.`);
}

export function resolveToolApprovalMode(
  explicitMode: ToolApprovalMode | undefined,
  environ: Record<string, string | undefined> = process.env
): ToolApprovalMode {
  if (explicitMode) {
    return explicitMode;
  }
  const envMode = environ.GOD_CODE_APPROVAL_MODE;
  if (envMode === undefined || envMode.trim().length === 0) {
    return "never";
  }
  return parseToolApprovalMode(envMode.trim(), "GOD_CODE_APPROVAL_MODE");
}

export function approvalReasonForTool(toolName: ToolName): string {
  if (toolName === "Bash") {
    return "Bash requires interactive approval in prompt mode.";
  }
  if (toolName === "Edit" || toolName === "Write") {
    return `${toolName} requires interactive approval in prompt mode.`;
  }
  return `External tool requires interactive approval in prompt mode: ${toolName}.`;
}

function summarizeToolApprovalInput(request: ExecuteToolRequest): ToolApprovalInputSummary {
  if (request.tool_name === "Bash") {
    return summarizeKnownFields(request.input, [
      ["command", "command"],
      ["cwd", "cwd"],
      ["timeout_ms", "timeout_ms"]
    ]);
  }
  if (request.tool_name === "Read" || request.tool_name === "ListFiles" || request.tool_name === "Search") {
    return summarizeKnownFields(request.input, [
      ["path", "path"],
      ["pattern", "pattern"],
      ["recursive", "recursive"],
      ["max_entries", "max_entries"],
      ["max_matches", "max_matches"]
    ]);
  }
  if (request.tool_name === "Edit") {
    return summarizeKnownFields(request.input, [
      ["path", "path"],
      ["find", "find"],
      ["replace", "replace"]
    ]);
  }
  if (request.tool_name === "Write") {
    return summarizeKnownFields(request.input, [
      ["path", "path"],
      ["content", "content"],
      ["overwrite", "overwrite"]
    ]);
  }
  return summarizeGenericInput(request.input);
}

function summarizeKnownFields(
  input: Record<string, unknown>,
  fields: Array<[string, string]>
): ToolApprovalInputSummary {
  const lines: ToolApprovalSummaryLine[] = [];
  let truncated = false;
  let redacted = false;
  for (const [key, label] of fields) {
    if (!(key in input)) {
      continue;
    }
    const rendered = renderApprovalValue(input[key], key);
    lines.push({ label, value: rendered.value });
    truncated = truncated || rendered.truncated;
    redacted = redacted || rendered.redacted;
  }
  return { lines, truncated, redacted };
}

function summarizeGenericInput(input: Record<string, unknown>): ToolApprovalInputSummary {
  const lines: ToolApprovalSummaryLine[] = [];
  let truncated = false;
  let redacted = false;
  for (const key of Object.keys(input).sort()) {
    const rendered = renderApprovalValue(input[key], key);
    lines.push({ label: key, value: rendered.value });
    truncated = truncated || rendered.truncated;
    redacted = redacted || rendered.redacted;
    if (lines.length >= 12) {
      truncated = true;
      break;
    }
  }
  return { lines, truncated, redacted };
}

function renderApprovalValue(
  value: unknown,
  key: string
): { value: string; truncated: boolean; redacted: boolean } {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return { value: "<redacted>", truncated: false, redacted: true };
  }
  let rendered: string;
  if (typeof value === "string") {
    rendered = value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    rendered = String(value);
  } else if (value === null) {
    rendered = "null";
  } else {
    rendered = JSON.stringify(value);
  }
  if (rendered === undefined) {
    rendered = String(value);
  }
  if (looksBinary(rendered)) {
    return { value: "<binary content omitted>", truncated: false, redacted: true };
  }
  if (rendered.length > DEFAULT_APPROVAL_PREVIEW_CHARS) {
    return {
      value: `${rendered.slice(0, DEFAULT_APPROVAL_PREVIEW_CHARS)}...`,
      truncated: true,
      redacted: false
    };
  }
  return { value: rendered, truncated: false, redacted: false };
}

function looksBinary(value: string): boolean {
  if (value.includes("\u0000")) {
    return true;
  }
  let controlChars = 0;
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 && char !== "\n" && char !== "\r" && char !== "\t") {
      controlChars += 1;
    }
  }
  return controlChars > 8;
}
