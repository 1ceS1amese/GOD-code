import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export type McpCompletionScriptShell = "bash" | "zsh";

interface RenderMcpCompletionScriptOptions {
  programName?: string;
}

interface InstallMcpCompletionScriptOptions {
  shell: McpCompletionScriptShell;
  programName?: string;
  rcFile?: string;
  dryRun?: boolean;
  cwd?: string;
  homeDir?: string;
}

export interface McpCompletionInstallReport {
  ok: boolean;
  shell: McpCompletionScriptShell;
  program_name: string;
  rc_file: string;
  dry_run: boolean;
  action: "noop" | "would_create" | "would_append" | "would_update" | "create" | "append" | "update";
  changed: boolean;
  created: boolean;
  marker_start: string;
  marker_end: string;
  script_line_count: number;
  message: string;
}

const DEFAULT_PROGRAM_NAME = "god-code";
const MANAGED_BLOCK_START = "# >>> GOD-code MCP completion >>>";
const MANAGED_BLOCK_END = "# <<< GOD-code MCP completion <<<";

const MCP_SUBCOMMANDS = [
  "inspect-config",
  "inspect-context",
  "read-resource",
  "get-prompt",
  "subscribe-resource",
  "unsubscribe-resource",
  "wait-resource-update",
  "watch-resource-updates",
  "loop-resource-updates",
  "complete-prompt",
  "complete-resource-template",
  "completion-script",
  "completion-install"
];

const COMPLETION_FLAGS = ["--server", "--json", "--values-only", "--jsonl"];

export function renderMcpCompletionScript(
  shell: McpCompletionScriptShell,
  options: RenderMcpCompletionScriptOptions = {}
): string {
  const programName = validateProgramName(options.programName ?? DEFAULT_PROGRAM_NAME);
  if (shell === "bash") {
    return renderBashMcpCompletionScript(programName);
  }
  if (shell === "zsh") {
    return renderZshMcpCompletionScript(programName);
  }
  throw new Error(`Unsupported MCP completion shell: ${String(shell)}`);
}

export async function installMcpCompletionScript(
  options: InstallMcpCompletionScriptOptions
): Promise<McpCompletionInstallReport> {
  const programName = validateProgramName(options.programName ?? DEFAULT_PROGRAM_NAME);
  const dryRun = options.dryRun !== false;
  const rcFile = resolveRcFile({
    shell: options.shell,
    rcFile: options.rcFile,
    cwd: options.cwd,
    homeDir: options.homeDir
  });
  const block = buildManagedBlock(options.shell, programName);
  const existing = await readFileIfExists(rcFile);
  const nextContent = mergeManagedBlock(existing.content, block);
  const changed = nextContent !== existing.content;
  const created = !existing.exists;
  const action = determineInstallAction({
    dryRun,
    changed,
    created,
    hadBlock: existing.content.includes(MANAGED_BLOCK_START)
  });

  if (!dryRun && changed) {
    await fs.mkdir(path.dirname(rcFile), { recursive: true });
    await fs.writeFile(rcFile, nextContent, "utf8");
  }

  return {
    ok: true,
    shell: options.shell,
    program_name: programName,
    rc_file: rcFile,
    dry_run: dryRun,
    action,
    changed,
    created: created && changed,
    marker_start: MANAGED_BLOCK_START,
    marker_end: MANAGED_BLOCK_END,
    script_line_count: block.split(/\r?\n/u).filter((line) => line.length > 0).length,
    message: renderInstallMessage(action, rcFile)
  };
}

export function renderMcpCompletionInstallReport(report: McpCompletionInstallReport): string {
  return [
    "GOD-code MCP completion install:",
    `OK mcp_completion_install: ${report.message}`,
    `  shell=${report.shell}`,
    `  program=${report.program_name}`,
    `  rc_file=${report.rc_file}`,
    `  dry_run=${String(report.dry_run)}`,
    `  action=${report.action}`,
    `  changed=${String(report.changed)}`,
    `  created=${String(report.created)}`,
    `  marker_start=${report.marker_start}`,
    `  marker_end=${report.marker_end}`,
    `  script_line_count=${String(report.script_line_count)}`
  ].join("\n");
}

export function renderMcpCompletionInstallReportJson(report: McpCompletionInstallReport): string {
  return JSON.stringify(report, null, 2);
}

function renderBashMcpCompletionScript(programName: string): string {
  const quotedProgram = shellSingleQuote(programName);
  const subcommands = MCP_SUBCOMMANDS.join(" ");
  const completionFlags = COMPLETION_FLAGS.join(" ");
  return [
    "# GOD-code MCP completion hook for bash/readline.",
    "# Source this file from bash to enable MCP command and completion candidate suggestions.",
    "_god_code_mcp_completion() {",
    `  local god_code_program=${quotedProgram}`,
    "  local cur sub",
    "  COMPREPLY=()",
    "",
    "  cur=\"${COMP_WORDS[COMP_CWORD]}\"",
    "  if [[ ${COMP_CWORD} -eq 1 ]]; then",
    "    if [[ mcp == \"$cur\"* ]]; then COMPREPLY=(mcp); fi",
    "    return 0",
    "  fi",
    "  if [[ ${COMP_WORDS[1]} != \"mcp\" ]]; then",
    "    return 0",
    "  fi",
    "  if [[ ${COMP_CWORD} -eq 2 ]]; then",
    `    _god_code_mcp_filter_words "$cur" ${subcommands}`,
    "    return 0",
    "  fi",
    "",
    "  sub=\"${COMP_WORDS[2]}\"",
    "  case \"$sub\" in",
    "    complete-prompt)",
    "      if [[ ${COMP_CWORD} -eq 5 ]]; then",
    "        _god_code_mcp_dynamic_values complete-prompt \"${COMP_WORDS[3]}\" \"${COMP_WORDS[4]}\" \"$cur\"",
    "        return 0",
    "      fi",
    `      _god_code_mcp_filter_words "$cur" ${completionFlags}`,
    "      return 0",
    "      ;;",
    "    complete-resource-template)",
    "      if [[ ${COMP_CWORD} -eq 5 ]]; then",
    "        _god_code_mcp_dynamic_values complete-resource-template \"${COMP_WORDS[3]}\" \"${COMP_WORDS[4]}\" \"$cur\"",
    "        return 0",
    "      fi",
    `      _god_code_mcp_filter_words "$cur" ${completionFlags}`,
    "      return 0",
    "      ;;",
    "  esac",
    "}",
    "",
    "_god_code_mcp_filter_words() {",
    "  local prefix=\"$1\"",
    "  shift",
    "  local word",
    "  for word in \"$@\"; do",
    "    if [[ \"$word\" == \"$prefix\"* ]]; then",
    "      COMPREPLY+=(\"$word\")",
    "    fi",
    "  done",
    "}",
    "",
    "_god_code_mcp_dynamic_values() {",
    "  local kind=\"$1\"",
    "  local ref=\"$2\"",
    "  local argument_name=\"$3\"",
    "  local prefix=\"$4\"",
    "  local candidate",
    "  while IFS= read -r candidate; do",
    "    if [[ -n \"$candidate\" && \"$candidate\" == \"$prefix\"* ]]; then",
    "      COMPREPLY+=(\"$candidate\")",
    "    fi",
    "  done < <(\"$god_code_program\" mcp \"$kind\" \"$ref\" \"$argument_name\" \"$prefix\" --values-only 2>/dev/null)",
    "}",
    "",
    `complete -F _god_code_mcp_completion -- ${quotedProgram}`
  ].join("\n");
}

function renderZshMcpCompletionScript(programName: string): string {
  const quotedProgram = shellSingleQuote(programName);
  const subcommands = MCP_SUBCOMMANDS.join(" ");
  const completionFlags = COMPLETION_FLAGS.join(" ");
  return [
    "#compdef " + programName,
    "# GOD-code MCP completion hook for zsh.",
    "_god_code_mcp_completion() {",
    `  local god_code_program=${quotedProgram}`,
    "  local -a mcp_subcommands",
    "  local -a completion_flags",
    `  mcp_subcommands=(${subcommands})`,
    `  completion_flags=(${completionFlags})`,
    "",
    "  if (( CURRENT == 2 )); then",
    "    compadd -- mcp",
    "    return 0",
    "  fi",
    "  if [[ ${words[2]} != mcp ]]; then",
    "    return 1",
    "  fi",
    "  if (( CURRENT == 3 )); then",
    "    compadd -- ${mcp_subcommands[@]}",
    "    return 0",
    "  fi",
    "",
    "  case \"${words[3]}\" in",
    "    complete-prompt)",
    "      if (( CURRENT == 6 )); then",
    "        _god_code_mcp_dynamic_values complete-prompt \"${words[4]}\" \"${words[5]}\" \"$PREFIX\"",
    "        return 0",
    "      fi",
    "      compadd -- ${completion_flags[@]}",
    "      return 0",
    "      ;;",
    "    complete-resource-template)",
    "      if (( CURRENT == 6 )); then",
    "        _god_code_mcp_dynamic_values complete-resource-template \"${words[4]}\" \"${words[5]}\" \"$PREFIX\"",
    "        return 0",
    "      fi",
    "      compadd -- ${completion_flags[@]}",
    "      return 0",
    "      ;;",
    "  esac",
    "  return 1",
    "}",
    "",
    "_god_code_mcp_dynamic_values() {",
    "  local kind=\"$1\"",
    "  local ref=\"$2\"",
    "  local argument_name=\"$3\"",
    "  local prefix=\"$4\"",
    "  local output",
    "  local -a candidates",
    "  output=\"$(\"$god_code_program\" mcp \"$kind\" \"$ref\" \"$argument_name\" \"$prefix\" --values-only 2>/dev/null)\" || return 0",
    "  candidates=(\"${(@f)output}\")",
    "  if (( ${#candidates} > 0 )); then",
    "    compadd -- ${candidates[@]}",
    "  fi",
    "}",
    "",
    `compdef _god_code_mcp_completion ${quotedProgram}`
  ].join("\n");
}

function validateProgramName(programName: string): string {
  const trimmed = programName.trim();
  if (trimmed.length === 0) {
    throw new Error("MCP completion script program name must not be empty");
  }
  if (/[\r\n\0]/u.test(trimmed)) {
    throw new Error("MCP completion script program name must not contain control characters");
  }
  return trimmed;
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/gu, "'\\''")}'`;
}

function buildManagedBlock(shell: McpCompletionScriptShell, programName: string): string {
  return [
    MANAGED_BLOCK_START,
    `# shell=${shell}`,
    `# program=${programName}`,
    renderMcpCompletionScript(shell, { programName }),
    MANAGED_BLOCK_END,
    ""
  ].join("\n");
}

function resolveRcFile(options: {
  shell: McpCompletionScriptShell;
  rcFile?: string;
  cwd?: string;
  homeDir?: string;
}): string {
  if (options.rcFile) {
    return path.resolve(options.cwd ?? process.cwd(), expandHome(options.rcFile, options.homeDir));
  }
  const homeDir = options.homeDir ?? os.homedir();
  return path.join(homeDir, options.shell === "bash" ? ".bashrc" : ".zshrc");
}

function expandHome(value: string, homeDir?: string): string {
  if (value === "~") {
    return homeDir ?? os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(homeDir ?? os.homedir(), value.slice(2));
  }
  return value;
}

async function readFileIfExists(filePath: string): Promise<{ exists: boolean; content: string }> {
  try {
    return {
      exists: true,
      content: await fs.readFile(filePath, "utf8")
    };
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return { exists: false, content: "" };
    }
    throw error;
  }
}

function mergeManagedBlock(content: string, block: string): string {
  const start = content.indexOf(MANAGED_BLOCK_START);
  const end = content.indexOf(MANAGED_BLOCK_END);
  if (start >= 0 && end >= start) {
    const afterEnd = end + MANAGED_BLOCK_END.length;
    const suffix = content.slice(afterEnd).replace(/^\r?\n/u, "");
    return `${content.slice(0, start)}${block}${suffix}`;
  }
  if (content.length === 0) {
    return block;
  }
  const separator = content.endsWith("\n") ? "\n" : "\n\n";
  return `${content}${separator}${block}`;
}

function determineInstallAction(options: {
  dryRun: boolean;
  changed: boolean;
  created: boolean;
  hadBlock: boolean;
}): McpCompletionInstallReport["action"] {
  if (!options.changed) {
    return "noop";
  }
  if (options.dryRun) {
    if (options.created) {
      return "would_create";
    }
    return options.hadBlock ? "would_update" : "would_append";
  }
  if (options.created) {
    return "create";
  }
  return options.hadBlock ? "update" : "append";
}

function renderInstallMessage(action: McpCompletionInstallReport["action"], rcFile: string): string {
  if (action === "noop") {
    return `completion block already up to date in ${rcFile}`;
  }
  if (action.startsWith("would_")) {
    return `dry-run: ${action.replace("would_", "would ")} completion block in ${rcFile}`;
  }
  return `${action} completion block in ${rcFile}`;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
