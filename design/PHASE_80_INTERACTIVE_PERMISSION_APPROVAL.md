# Phase 80: Interactive permission approval

Phase80 implements the first interactive permission confirmation path for tool execution. It turns the `PolicyDecision.action === "prompt"` branch that Phase1 reserved into an explicit, opt-in host-side approval flow.

## Goals

- Add an opt-in CLI approval flow for tool executions that require user confirmation.
- Keep the authority boundary in the TS Host, inside `HostToolRegistry.executeRequest(...)`.
- Preserve the existing default behavior unless the user explicitly enables approval prompts.
- Support `god-code run` and `god-code repl` first.
- Keep prompts on stderr so `--json` stdout remains machine-readable.
- Let non-interactive shells fail closed instead of blocking forever.
- Audit the policy prompt, approval decision, and final tool result.
- Avoid Python Engine, provider, MCP protocol, plugin manifest, transcript schema, and JSON-RPC method changes.

## Non-goals

- No TUI framework.
- No persistent approval daemon.
- No cross-command approval cache.
- No long-lived policy store or rules file.
- No remote approval service.
- No provider-side tool approval.
- No automatic bypass for plugin or MCP tools.
- No policy relaxation for path denylist, command denylist, cwd enforcement, or unknown tools.
- No change to existing non-interactive default behavior.

## Current state

Phase1 already defines the permission decision shape:

```ts
export type PolicyDecision =
  | { action: "allow" }
  | { action: "deny"; reason: string }
  | { action: "prompt"; reason: string };
```

Current `HostToolRegistry.executeRequest(...)` behavior is:

```text
tool_requested
policy.beforeExecute(...)
tool_decision
allow -> execute tool
deny -> permission_denied
prompt -> permission_denied with "Interactive approval is not implemented"
tool_finished
```

That means the architectural hook is already present, but no UI can answer the prompt.

## User-facing surface

The initial surface is explicit:

```bash
god-code run --approval-mode prompt "write fixture.txt ::: hello"
god-code run --approval-mode never "read README.md"
god-code repl --approval-mode prompt
god-code sessions resume <session_id> --approval-mode prompt "bash npm test"
```

Environment fallback:

```text
GOD_CODE_APPROVAL_MODE=never|prompt
```

Rules:

- Default mode remains `never`.
- `never` keeps current prompt-as-deny behavior.
- `prompt` enables the terminal approval UI when stdin/stderr are interactive.
- If `prompt` is requested without an interactive terminal, the tool result is `permission_denied`.
- Approval prompts render to stderr only.
- CLI JSON output remains reserved for command results on stdout.

## Approval policy

Phase80 does not make all tools prompt by default. It adds a small wrapper policy used only when approval mode is `prompt`:

```text
PromptingPermissionPolicy
  -> call DefaultPermissionPolicy first
  -> deny stays deny
  -> prompt stays prompt
  -> allow may become prompt for selected tools
```

Prompt set:

- `Edit`
- `Write`
- `Bash`
- MCP tools
- plugin / skill tools

Read-only allow set:

- `Read`
- `ListFiles`
- `Search`

Rationale:

- Read-only local inspection stays smooth.
- Mutating files, shell commands, MCP tools, and plugin-owned tools require explicit confirmation.
- Existing hard safety rules still win before approval is asked.

## Prompt content

The UI shows compact, sanitized request details:

```text
GOD-code tool approval required
tool: Bash
reason: Bash requires interactive approval in prompt mode.
cwd: /work/repo
command: npm test

Allow this tool execution? [y/N]
```

For path tools:

```text
GOD-code tool approval required
tool: Write
reason: Write requires interactive approval in prompt mode.
cwd: /work/repo
path: src/example.ts

Allow this tool execution? [y/N]
```

Content previews must be bounded:

- Default maximum preview: 500 characters.
- Redact binary-looking content.
- Do not print full file contents for `Write` / `Edit`.
- Do not print environment variable values.
- Do not print MCP auth header or bearer token values.

## Approval result model

Internal host-side shape:

```ts
export type ToolApprovalDecision =
  | { action: "allow"; source: "interactive"; reason?: string }
  | { action: "deny"; source: "interactive" | "non_interactive" | "unavailable"; reason: string };

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
```

Only `allow` lets execution continue. Every deny-like outcome returns the existing `permission_denied` tool error code.

## Audit extension

Adds one audit event type:

```ts
{
  type: "tool_approval";
  request: ExecuteToolRequest;
  approval: ToolApprovalDecision;
}
```

Expected event order for an approved prompt:

```text
tool_requested
tool_decision(action=prompt)
tool_approval(action=allow)
tool_finished(ok=true|false)
```

Expected event order for a denied prompt:

```text
tool_requested
tool_decision(action=prompt)
tool_approval(action=deny)
tool_finished(permission_denied)
```

Existing allow and deny paths keep their current audit order.

## Runtime flow

```text
Python Engine emits execute_tool request
  -> TS Host GodCodeEngineProcess receives request
  -> HostToolRegistry.executeRequest(...)
  -> permissionPolicy.beforeExecute(...)
  -> decision=prompt
  -> approvalPrompt.requestApproval(...)
  -> allow: executeRaw(...)
  -> deny: permission_denied
  -> permissionPolicy.afterExecute(...) only after actual execution
  -> audit tool_finished
  -> JSON-RPC execute_tool response returns to Python Engine
```

The Python Engine still only sees a normal tool result. It does not know whether the TS Host asked the user.

## Code touch points

- `ts-host/src/policy/approval.ts`
  - Adds approval request/decision/prompt types.
  - Adds request summarization and prompt-policy wrapper helpers.
- `ts-host/src/policy/approval.ts`
  - Adds `PromptingPermissionPolicy`, `resolveToolApprovalMode(...)`, and bounded input summaries.
- `ts-host/src/host_tools/registry.ts`
  - Adds optional `approvalPrompt` to `HostToolRegistryOptions`.
  - Uses approval prompt when configured.
  - Preserves prompt-as-deny fallback when no approval prompt is configured.
- `ts-host/src/audit/auditSink.ts`
  - Adds `tool_approval` event type.
- `ts-host/src/cli/approval.ts`
  - Adds terminal prompt implementation using Node readline.
  - Render prompts to stderr.
  - Fail closed when non-interactive.
- `ts-host/src/cli/main.ts`
  - Adds `--approval-mode` parsing for `run`, `repl`, and `sessions resume`.
- `ts-host/src/cli/repl.ts`
  - Adds approval prompt wiring for REPL sessions.
- `ts-host/src/headless/godCodeHostSetup.ts`
  - Threads approval-mode options into the default host registry.
- Tests:
  - `ts-host/test/hostTools.test.ts`
  - `ts-host/test/repl.test.ts`
  - `tools/run-cli-smoke.sh`

## Test coverage

- Default mode still treats `prompt` policy decisions as `permission_denied`.
- `approvalMode=prompt` with an approving fake prompt executes the tool.
- `approvalMode=prompt` with a denying fake prompt does not execute the tool.
- Hard path denylist and command denylist do not ask for approval.
- Non-interactive prompt mode fails closed.
- Approval prompt output goes to stderr and does not corrupt `run --json` stdout.
- Audit includes `tool_approval` only on prompt paths.
- REPL uses the same approval prompt path.
- MCP/plugin tools still route through `HostToolRegistry.executeRequest(...)` before approval.

## Verification

Implementation checks:

```bash
cd ts-host
npm run build
npm test -- hostTools.test.ts --run
npm test -- cliDiagnostics.test.ts --run
npm test -- repl.test.ts --run
cd ..
./tools/run-cli-smoke.sh
./tools/check.sh
```

## Acceptance criteria

- `god-code run --approval-mode prompt "write file.txt ::: hello"` can ask for approval in an interactive terminal.
- Denying the prompt returns `permission_denied` and does not execute the tool.
- Approving the prompt executes the tool through the normal registry path.
- `god-code run --json --approval-mode prompt ...` keeps JSON on stdout and prompt text on stderr.
- Non-interactive prompt mode fails closed with `permission_denied`.
- Default mode remains compatible with Phase1 behavior.
- No Python Engine, provider, transcript, MCP protocol, plugin manifest, or JSON-RPC method changes are required.

## Phase598 completed integration

Phase598 makes the terminal prompt lifecycle single-close and primary-aware. Answer and abort callbacks now only settle the decision; listener detach and readline close run afterward through bounded synchronous wrappers. Question failures, explicit denial, and cancellation remain primary, while an approved decision with cleanup uncertainty fails closed through the existing unavailable-denial shape. The Phase80 permission policy, request summary, audit event, CLI mode, and public decision union are unchanged.
