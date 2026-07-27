#!/usr/bin/env node

import path from "node:path";
import { TerminalApprovalPrompt } from "./approval.js";
import {
  runGodCodeRecoveredSession,
  runGodCodeResumedSession,
  runGodCodeRpcSmoke,
  runGodCodeSession
} from "../headless/godCodeRunSession.js";
import { TerminalRenderer } from "../rendering/terminalRenderer.js";
import {
  buildTranscriptSearchIndex,
  buildTranscriptRecoveryPlan,
  compressArchivedTranscriptSession,
  cleanupTranscriptSessions,
  deleteArchivedTranscriptSession,
  deleteTranscriptSession,
  discoverTranscriptRoots,
  listArchivedTranscriptSessions,
  listTranscriptSessions,
  readArchivedTranscriptEntriesForSession,
  readArchivedTranscriptTimelineForSession,
  readTranscriptEntriesForSession,
  readTranscriptTimelineForSession,
  renderTranscriptArchiveCompressJson,
  renderTranscriptCleanup,
  renderTranscriptCleanupJson,
  renderTranscriptArchiveRestoreJson,
  renderTranscriptDeleteJson,
  renderTranscriptGlobalSearch,
  renderTranscriptGlobalSearchJson,
  renderTranscriptIndexSearch,
  renderTranscriptIndexSearchJson,
  renderTranscriptIndexWatchRefresh,
  renderTranscriptIndexWatchRefreshJson,
  renderSessionList,
  renderTranscriptReplay,
  renderTranscriptReplayJson,
  renderTranscriptRecoveryPlan,
  renderTranscriptRecoveryPlanJson,
  renderTranscriptRootDiscovery,
  renderTranscriptRootDiscoveryJson,
  renderTranscriptSearch,
  renderTranscriptSearchIndexBuild,
  renderTranscriptSearchIndexBuildJson,
  renderTranscriptSearchIndexRefresh,
  renderTranscriptSearchIndexRefreshJson,
  renderTranscriptSearchJson,
  renderTranscriptTimeline,
  renderTranscriptTimelineJson,
  renderTranscriptWatch,
  renderTranscriptWatchJson,
  resolveTranscriptDir,
  resolveTranscriptArchiveDir,
  refreshTranscriptSearchIndex,
  restoreArchivedTranscriptSession,
  searchArchivedTranscriptSessions,
  searchGlobalTranscriptSessions,
  searchTranscriptIndex,
  searchTranscriptSessions,
  watchRefreshTranscriptSearchIndex,
  watchTranscriptSessions,
  type TranscriptCleanupAction,
  type TranscriptGlobalSearchDiscoverySummary,
  type TranscriptRecoverySourceMode,
  type TranscriptRecoveryStrategy,
  type TranscriptWatchDiscoverySummary,
  type TranscriptIndexWatchRefreshDiscoverySummary
} from "../transcripts/history.js";
import type { GodCodeEventEnvelope, TurnResult } from "../types/godCodeProtocol.js";
import {
  cleanupAuditEmptyLockDisposal,
  cleanupAuditEmptyLockQuarantine,
  cleanupAuditLock,
  cleanupAuditLockDisposal,
  cleanupAuditLockQuarantine,
  inspectAuditConfig,
  inspectAuditLockDisposal,
  inspectAuditLockDisposals,
  inspectAuditLockQuarantine,
  inspectAuditLockQuarantines,
  inspectAuditPath,
  inspectAuditRotationRecovery,
  inspectAuditRotationStaging,
  inspectAuditRotationStagings,
  recoverAuditLockQuarantine,
  recoverAuditRotationStaging,
  renderAuditLockCleanupReport,
  renderAuditLockCleanupReportJson,
  renderAuditEmptyLockDisposalCleanupReport,
  renderAuditEmptyLockDisposalCleanupReportJson,
  renderAuditEmptyLockQuarantineCleanupReport,
  renderAuditEmptyLockQuarantineCleanupReportJson,
  renderAuditLockDisposalReport,
  renderAuditLockDisposalReportJson,
  renderAuditTargetedLockDisposalReport,
  renderAuditTargetedLockDisposalReportJson,
  renderAuditLockDisposalCleanupReport,
  renderAuditLockDisposalCleanupReportJson,
  renderAuditLockQuarantineReport,
  renderAuditLockQuarantineReportJson,
  renderAuditTargetedLockQuarantineReport,
  renderAuditTargetedLockQuarantineReportJson,
  renderAuditLockQuarantineCleanupReport,
  renderAuditLockQuarantineCleanupReportJson,
  renderAuditLockQuarantineRecoveryReport,
  renderAuditLockQuarantineRecoveryReportJson,
  renderAuditConfigReport,
  renderAuditConfigReportJson,
  renderAuditPathReport,
  renderAuditPathReportJson,
  renderAuditRotationStagingReport,
  renderAuditRotationStagingReportJson,
  renderAuditRotationRecoveryReport,
  renderAuditRotationRecoveryReportJson,
  renderAuditRotationStagingRecoveryReport,
  renderAuditRotationStagingRecoveryReportJson,
  renderAuditTargetedRotationStagingReport,
  renderAuditTargetedRotationStagingReportJson
} from "./audit.js";
import { renderDoctorReport, renderDoctorReportJson, runGodCodeDoctor } from "./doctor.js";
import {
  completeMcpPrompt,
  completeMcpResourceTemplate,
  getMcpPrompt,
  inspectMcpConfig,
  inspectMcpContext,
  loopMcpResourceUpdates,
  readMcpResource,
  renderMcpCompletionJsonl,
  renderMcpCompletionValues,
  renderMcpDiagnosticReport,
  renderMcpDiagnosticReportJson,
  subscribeMcpResource,
  unsubscribeMcpResource,
  waitMcpResourceUpdate,
  watchMcpResourceUpdates
} from "./mcp.js";
import {
  installMcpCompletionScript,
  renderMcpCompletionInstallReport,
  renderMcpCompletionInstallReportJson,
  renderMcpCompletionScript,
  type McpCompletionScriptShell
} from "./mcpCompletionScript.js";
import {
  inspectPluginConfig,
  inspectConfiguredPlugin,
  installLocalPluginRegistryEntry,
  listConfiguredPlugins,
  renderPluginDiagnosticReport,
  renderPluginDiagnosticReportJson,
  renderPluginManifestSchema,
  renderPluginManifestSchemaJson,
  renderPluginRegistryInstallResult,
  renderPluginRegistryInstallResultJson,
  renderPluginRegistrySetEnabledResult,
  renderPluginRegistrySetEnabledResultJson,
  renderPluginRegistryTagsResult,
  renderPluginRegistryTagsResultJson,
  renderPluginRegistryUninstallResult,
  renderPluginRegistryUninstallResultJson,
  setLocalPluginRegistryEntryEnabled,
  uninstallLocalPluginRegistryEntry,
  updateLocalPluginRegistryEntryTags,
  validatePluginManifestTarget
} from "./plugins.js";
import {
  inspectProviderConfig,
  inspectLocalProviderDaemon,
  listLocalProviderModels,
  pruneLocalProviderModels,
  pullLocalProviderModel,
  removeLocalProviderModel,
  renderLocalProviderDaemonReport,
  renderLocalProviderDaemonReportJson,
  renderLocalProviderModelRemoveReport,
  renderLocalProviderModelRemoveReportJson,
  renderLocalProviderModelPruneReport,
  renderLocalProviderModelPruneReportJson,
  renderLocalProviderModelPullReport,
  renderLocalProviderModelPullReportJson,
  renderLocalProviderModelsReport,
  renderLocalProviderModelsReportJson,
  renderProviderContractReport,
  renderProviderContractReportJson,
  renderProviderConfigReport,
  renderProviderConfigReportJson,
  runProviderContractTests,
  startLocalProviderDaemon,
  stopLocalProviderDaemon
} from "./provider.js";
import { runGodCodeRepl } from "./repl.js";
import { runGodCodeTui } from "./tuiSession.js";
import {
  getHostTool,
  listHostTools,
  renderToolInspect,
  renderToolInspectJson,
  renderToolList,
  renderToolListJson
} from "./tools.js";
import {
  parseToolApprovalMode,
  resolveToolApprovalMode,
  type ToolApprovalMode,
  type ToolApprovalPrompt
} from "../policy/approval.js";

interface ParsedRunCommand {
  json: boolean;
  rawEvents: boolean;
  approvalMode?: ToolApprovalMode;
  prompt: string;
}

interface ParsedReplCommand {
  approvalMode?: ToolApprovalMode;
}

interface ParsedTuiCommand {
  approvalMode?: ToolApprovalMode;
  transcriptDir?: string;
  modelAdapter?: string;
  stream: boolean;
  help: boolean;
}

type JsonRunOutput = TurnResult & {
  events?: GodCodeEventEnvelope[];
};

type JsonResumeOutput = TurnResult & {
  resumed_from_session_id: string;
  restored_message_count: number;
  events?: GodCodeEventEnvelope[];
};

type JsonRecoverOutput = TurnResult & {
  recovered_from_session_id: string;
  recovery_strategy: TranscriptRecoveryStrategy;
  restored_message_count: number;
  skipped_entry_count: number;
  recovery_warnings: unknown[];
  events?: GodCodeEventEnvelope[];
};

type McpCompletionOutputFormat = "text" | "json" | "values" | "jsonl";

interface ParsedCleanupCommand {
  olderThanDays: number;
  action: TranscriptCleanupAction;
  json: boolean;
  yes: boolean;
}

interface ParsedTimelineCommand {
  json: boolean;
  includePreview: boolean;
  previewChars: number;
}

interface ParsedRecoverCommand {
  json: boolean;
  rawEvents: boolean;
  dryRun: boolean;
  sourceMode: TranscriptRecoverySourceMode;
  strategy: TranscriptRecoveryStrategy;
  maxRestoredMessages?: number;
  noToolResults: boolean;
  previewChars: number;
  approvalMode?: ToolApprovalMode;
  prompt: string | null;
}

interface ParsedGlobalSearchCommand {
  query: string;
  roots: string[];
  searchRoots: string[];
  includeCurrent: boolean;
  includeArchive: boolean;
  maxResults: number | null;
  discoveryMaxDepth: number;
  discoveryLimit: number;
  json: boolean;
}

interface ParsedTranscriptRootsCommand {
  searchRoots: string[];
  includeCurrent: boolean;
  maxDepth: number;
  limit: number;
  includeEmpty: boolean;
  json: boolean;
}

interface ParsedTranscriptWatchCommand {
  roots: string[];
  searchRoots: string[];
  includeCurrent: boolean;
  includeArchive: boolean;
  discoveryMaxDepth: number;
  discoveryLimit: number;
  maxEvents: number;
  timeoutMs: number;
  json: boolean;
}

interface ParsedIndexWatchRefreshCommand {
  roots: string[];
  searchRoots: string[];
  includeCurrent: boolean;
  includeArchive: boolean;
  discoveryMaxDepth: number;
  discoveryLimit: number;
  maxEvents: number;
  timeoutMs: number;
  debounceMs: number;
  refreshOnTimeout: boolean;
  json: boolean;
}

interface ParsedPluginInstallCommand {
  packageDir: string;
  registryFile?: string;
  dryRun: boolean;
  yes: boolean;
  json: boolean;
  enabled?: boolean;
  tags: string[];
  replace: boolean;
}

interface ParsedPluginUninstallCommand {
  pluginId: string;
  registryFile?: string;
  dryRun: boolean;
  yes: boolean;
  json: boolean;
  missingOk: boolean;
}

interface ParsedPluginSetEnabledCommand {
  pluginId: string;
  registryFile?: string;
  dryRun: boolean;
  yes: boolean;
  json: boolean;
}

interface ParsedPluginTagsCommand {
  pluginId: string;
  registryFile?: string;
  dryRun: boolean;
  yes: boolean;
  json: boolean;
  addTags: string[];
  removeTags: string[];
  setTags?: string[];
  clear: boolean;
}

const DEFAULT_TRANSCRIPT_TIMELINE_PREVIEW_CHARS = 120;
const MAX_TRANSCRIPT_TIMELINE_PREVIEW_CHARS = 2000;
const DEFAULT_TRANSCRIPT_ROOT_DISCOVERY_MAX_DEPTH = 3;
const MAX_TRANSCRIPT_ROOT_DISCOVERY_MAX_DEPTH = 8;
const DEFAULT_TRANSCRIPT_ROOT_DISCOVERY_LIMIT = 100;
const MAX_TRANSCRIPT_ROOT_DISCOVERY_LIMIT = 1000;
const DEFAULT_TRANSCRIPT_WATCH_MAX_EVENTS = 20;
const MAX_TRANSCRIPT_WATCH_MAX_EVENTS = 1000;
const DEFAULT_TRANSCRIPT_WATCH_TIMEOUT_MS = 30000;
const MAX_TRANSCRIPT_WATCH_TIMEOUT_MS = 300000;
const DEFAULT_TRANSCRIPT_INDEX_WATCH_REFRESH_DEBOUNCE_MS = 250;
const MAX_TRANSCRIPT_INDEX_WATCH_REFRESH_DEBOUNCE_MS = 10000;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command === "rpc-smoke") {
    await runGodCodeRpcSmoke(process.cwd());
    console.log("rpc-smoke ok");
    return;
  }

  if (command === "run") {
    const parsed = parseRunCommand(rest);
    const events: GodCodeEventEnvelope[] = [];
    const approval = resolveCliApproval(parsed.approvalMode);
    const result = await runGodCodeSession(parsed.prompt, process.cwd(), {
      renderer: parsed.json ? undefined : new TerminalRenderer(),
      stream: !parsed.json,
      onEvent: parsed.rawEvents ? (event) => events.push(event) : undefined,
      approvalMode: approval.mode,
      approvalPrompt: approval.prompt
    });
    if (parsed.json) {
      const output: JsonRunOutput = parsed.rawEvents ? { ...result, events } : result;
      console.log(JSON.stringify(output, null, 2));
      if (result.status !== "success") {
        process.exitCode = 1;
      }
      return;
    }
    if (result.status === "success") {
      return;
    }
    if (result.status === "cancelled") {
      throw new Error("Turn cancelled.");
    }
    throw new Error(result.error?.message ?? "Turn failed.");
  }

  if (command === "repl") {
    const parsed = parseReplCommand(rest);
    const approval = resolveCliApproval(parsed.approvalMode);
    await runGodCodeRepl(process.cwd(), {
      stream: true,
      approvalMode: approval.mode,
      approvalPrompt: approval.prompt
    });
    return;
  }

  if (command === "tui") {
    const parsed = parseTuiCommand(rest);
    if (parsed.help) {
      printTuiUsage();
      return;
    }
    const approval = resolveCliApproval(parsed.approvalMode);
    await runGodCodeTui(process.cwd(), {
      stream: parsed.stream,
      modelAdapter: parsed.modelAdapter,
      transcriptDir: parsed.transcriptDir,
      approvalMode: approval.mode,
      approvalPrompt: approval.prompt
    });
    return;
  }

  if (command === "sessions") {
    await handleSessionsCommand(rest);
    return;
  }

  if (command === "tools") {
    await handleToolsCommand(rest);
    return;
  }

  if (command === "doctor") {
    await handleDoctorCommand(rest);
    return;
  }

  if (command === "audit") {
    await handleAuditCommand(rest);
    return;
  }

  if (command === "mcp") {
    await handleMcpCommand(rest);
    return;
  }

  if (command === "plugins") {
    await handlePluginsCommand(rest);
    return;
  }

  if (command === "provider") {
    await handleProviderCommand(rest);
    return;
  }

  throw new CliUsageError(`Unknown command: ${command}`);
}

async function handleAuditCommand(args: string[]): Promise<void> {
  const [subcommand, ...flags] = args;
  if (subcommand === "inspect-config") {
    const json = parseJsonOnlyFlag(flags, "god-code audit inspect-config [--json]");
    const report = inspectAuditConfig(process.env, process.cwd());
    console.log(json ? renderAuditConfigReportJson(report) : renderAuditConfigReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (subcommand === "inspect-path") {
    const json = parseJsonOnlyFlag(flags, "god-code audit inspect-path [--json]");
    const report = await inspectAuditPath(process.env, process.cwd());
    console.log(json ? renderAuditPathReportJson(report) : renderAuditPathReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (subcommand === "inspect-rotation-stagings") {
    const json = parseJsonOnlyFlag(
      flags,
      "god-code audit inspect-rotation-stagings [--json]"
    );
    const report = await inspectAuditRotationStagings(process.env, process.cwd());
    console.log(
      json
        ? renderAuditRotationStagingReportJson(report)
        : renderAuditRotationStagingReport(report)
    );
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (subcommand === "inspect-rotation-staging") {
    const parsed = parseAuditRotationStagingInspectionFlags(flags);
    const report = await inspectAuditRotationStaging(
      process.env,
      process.cwd(),
      parsed.stagingId
    );
    console.log(
      parsed.json
        ? renderAuditTargetedRotationStagingReportJson(report)
        : renderAuditTargetedRotationStagingReport(report)
    );
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (subcommand === "inspect-rotation-recovery") {
    const parsed = parseAuditRotationRecoveryInspectionFlags(flags);
    const report = await inspectAuditRotationRecovery(
      process.env,
      process.cwd(),
      parsed.stagingId
    );
    console.log(
      parsed.json
        ? renderAuditRotationRecoveryReportJson(report)
        : renderAuditRotationRecoveryReport(report)
    );
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (subcommand === "recover-rotation-staging") {
    const parsed = parseAuditRotationStagingRecoveryFlags(flags);
    const report = await recoverAuditRotationStaging(
      process.env,
      process.cwd(),
      parsed.stagingId,
      {
        dryRun: parsed.dryRun,
        expectedAction: parsed.expectedAction,
        expectedRecoveryFingerprint: parsed.expectedRecoveryFingerprint
      }
    );
    console.log(
      parsed.json
        ? renderAuditRotationStagingRecoveryReportJson(report)
        : renderAuditRotationStagingRecoveryReport(report)
    );
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (subcommand === "inspect-lock-quarantines") {
    const json = parseJsonOnlyFlag(
      flags,
      "god-code audit inspect-lock-quarantines [--json]"
    );
    const report = await inspectAuditLockQuarantines(process.env, process.cwd());
    console.log(
      json
        ? renderAuditLockQuarantineReportJson(report)
        : renderAuditLockQuarantineReport(report)
    );
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (subcommand === "inspect-lock-quarantine") {
    const parsed = parseAuditLockQuarantineInspectionFlags(flags);
    const report = await inspectAuditLockQuarantine(
      process.env,
      process.cwd(),
      parsed.quarantineId
    );
    console.log(
      parsed.json
        ? renderAuditTargetedLockQuarantineReportJson(report)
        : renderAuditTargetedLockQuarantineReport(report)
    );
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (subcommand === "inspect-lock-disposals") {
    const json = parseJsonOnlyFlag(
      flags,
      "god-code audit inspect-lock-disposals [--json]"
    );
    const report = await inspectAuditLockDisposals(process.env, process.cwd());
    console.log(
      json
        ? renderAuditLockDisposalReportJson(report)
        : renderAuditLockDisposalReport(report)
    );
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (subcommand === "inspect-lock-disposal") {
    const parsed = parseAuditLockDisposalInspectionFlags(flags);
    const report = await inspectAuditLockDisposal(
      process.env,
      process.cwd(),
      parsed.quarantineId,
      parsed.disposalId
    );
    console.log(
      parsed.json
        ? renderAuditTargetedLockDisposalReportJson(report)
        : renderAuditTargetedLockDisposalReport(report)
    );
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (subcommand === "cleanup-lock-disposal") {
    const parsed = parseAuditLockDisposalCleanupFlags(flags);
    const report = await cleanupAuditLockDisposal(
      process.env,
      process.cwd(),
      parsed.quarantineId,
      parsed.disposalId,
      {
        dryRun: parsed.dryRun,
        expectedOwnerFingerprint: parsed.expectedOwnerFingerprint
      }
    );
    console.log(
      parsed.json
        ? renderAuditLockDisposalCleanupReportJson(report)
        : renderAuditLockDisposalCleanupReport(report)
    );
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (subcommand === "cleanup-empty-lock-disposal") {
    const parsed = parseAuditEmptyLockDisposalCleanupFlags(flags);
    const report = await cleanupAuditEmptyLockDisposal(
      process.env,
      process.cwd(),
      parsed.quarantineId,
      parsed.disposalId,
      {
        dryRun: parsed.dryRun,
        expectedDisposalFingerprint: parsed.expectedDisposalFingerprint
      }
    );
    console.log(
      parsed.json
        ? renderAuditEmptyLockDisposalCleanupReportJson(report)
        : renderAuditEmptyLockDisposalCleanupReport(report)
    );
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (subcommand === "cleanup-empty-lock-quarantine") {
    const parsed = parseAuditEmptyLockQuarantineCleanupFlags(flags);
    const report = await cleanupAuditEmptyLockQuarantine(
      process.env,
      process.cwd(),
      parsed.quarantineId,
      {
        dryRun: parsed.dryRun,
        expectedQuarantineFingerprint: parsed.expectedQuarantineFingerprint
      }
    );
    console.log(
      parsed.json
        ? renderAuditEmptyLockQuarantineCleanupReportJson(report)
        : renderAuditEmptyLockQuarantineCleanupReport(report)
    );
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (subcommand === "cleanup-lock-quarantine") {
    const parsed = parseAuditLockQuarantineCleanupFlags(flags);
    const report = await cleanupAuditLockQuarantine(
      process.env,
      process.cwd(),
      parsed.quarantineId,
      {
        dryRun: parsed.dryRun,
        expectedOwnerFingerprint: parsed.expectedOwnerFingerprint
      }
    );
    console.log(
      parsed.json
        ? renderAuditLockQuarantineCleanupReportJson(report)
        : renderAuditLockQuarantineCleanupReport(report)
    );
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (subcommand === "recover-lock-quarantine") {
    const parsed = parseAuditLockQuarantineRecoveryFlags(flags);
    const report = await recoverAuditLockQuarantine(
      process.env,
      process.cwd(),
      parsed.quarantineId,
      {
        dryRun: parsed.dryRun,
        expectedOwnerFingerprint: parsed.expectedOwnerFingerprint
      }
    );
    console.log(
      parsed.json
        ? renderAuditLockQuarantineRecoveryReportJson(report)
        : renderAuditLockQuarantineRecoveryReport(report)
    );
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (subcommand === "cleanup-lock") {
    const parsed = parseAuditLockCleanupFlags(flags);
    const report = await cleanupAuditLock(process.env, process.cwd(), {
      dryRun: parsed.dryRun,
      expectedOwnerFingerprint: parsed.expectedOwnerFingerprint
    });
    console.log(
      parsed.json
        ? renderAuditLockCleanupReportJson(report)
        : renderAuditLockCleanupReport(report)
    );
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  throw new CliUsageError(
    "Missing or unknown audit command. Usage: god-code audit <inspect-config|inspect-path|inspect-rotation-stagings|inspect-rotation-staging|inspect-rotation-recovery|recover-rotation-staging|inspect-lock-quarantines|inspect-lock-quarantine|inspect-lock-disposals|inspect-lock-disposal|cleanup-lock|cleanup-lock-quarantine|cleanup-empty-lock-quarantine|cleanup-lock-disposal|cleanup-empty-lock-disposal|recover-lock-quarantine>"
  );
}

async function handleProviderCommand(args: string[]): Promise<void> {
  const [subcommand, ...flags] = args;
  if (subcommand === "local-daemon") {
    await handleProviderLocalDaemonCommand(flags);
    return;
  }

  if (subcommand === "local-models") {
    await handleProviderLocalModelsCommand(flags);
    return;
  }

  if (subcommand === "contract-test") {
    const json = parseJsonOnlyFlag(flags, "god-code provider contract-test [--json]");
    const report = await runProviderContractTests();
    console.log(json ? renderProviderContractReportJson(report) : renderProviderContractReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "inspect-config") {
    const json = parseJsonOnlyFlag(flags, "god-code provider inspect-config [--json]");
    const report = inspectProviderConfig();
    console.log(json ? renderProviderConfigReportJson(report) : renderProviderConfigReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  throw new CliUsageError("Missing or unknown provider command. Usage: god-code provider <inspect-config|contract-test|local-daemon|local-models> ...");
}

async function handleProviderLocalDaemonCommand(args: string[]): Promise<void> {
  const [subcommand, ...flags] = args;
  if (subcommand === "status") {
    const json = parseJsonOnlyFlag(flags, "god-code provider local-daemon status [--json]");
    const report = await inspectLocalProviderDaemon();
    console.log(json ? renderLocalProviderDaemonReportJson(report) : renderLocalProviderDaemonReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "start") {
    const parsed = parseLocalDaemonActionFlags(flags, "god-code provider local-daemon start [--dry-run|--yes] [--json]");
    const report = await startLocalProviderDaemon({
      dryRun: parsed.dryRun,
      yes: parsed.yes
    });
    console.log(parsed.json ? renderLocalProviderDaemonReportJson(report) : renderLocalProviderDaemonReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "stop") {
    const parsed = parseLocalDaemonActionFlags(flags, "god-code provider local-daemon stop [--dry-run|--yes] [--json]");
    const report = await stopLocalProviderDaemon({
      dryRun: parsed.dryRun,
      yes: parsed.yes
    });
    console.log(parsed.json ? renderLocalProviderDaemonReportJson(report) : renderLocalProviderDaemonReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  throw new CliUsageError("Missing or unknown local daemon command. Usage: god-code provider local-daemon <status|start|stop> ...");
}

async function handleProviderLocalModelsCommand(args: string[]): Promise<void> {
  const [subcommand, ...flags] = args;
  if (subcommand === "list") {
    const parsed = parseLocalModelsListFlags(flags);
    const report = await listLocalProviderModels({
      requireConfiguredModel: parsed.requireConfiguredModel
    });
    console.log(parsed.json ? renderLocalProviderModelsReportJson(report) : renderLocalProviderModelsReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "pull") {
    const parsed = parseLocalModelsPullFlags(flags);
    const report = await pullLocalProviderModel(parsed.model, {
      dryRun: parsed.dryRun,
      yes: parsed.yes
    });
    console.log(parsed.json ? renderLocalProviderModelPullReportJson(report) : renderLocalProviderModelPullReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "remove") {
    const parsed = parseLocalModelsRemoveFlags(flags);
    const report = await removeLocalProviderModel(parsed.model, {
      dryRun: parsed.dryRun,
      yes: parsed.yes
    });
    console.log(parsed.json ? renderLocalProviderModelRemoveReportJson(report) : renderLocalProviderModelRemoveReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "prune") {
    const parsed = parseLocalModelsPruneFlags(flags);
    const report = await pruneLocalProviderModels(parsed.target, {
      dryRun: parsed.dryRun,
      yes: parsed.yes
    });
    console.log(parsed.json ? renderLocalProviderModelPruneReportJson(report) : renderLocalProviderModelPruneReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  throw new CliUsageError("Missing or unknown local models command. Usage: god-code provider local-models <list|pull|remove|prune> ...");
}

async function handleMcpCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand === "inspect-config") {
    const parsed = parseMcpInspectConfigFlags(rest);
    const report = await inspectMcpConfig({
      connect: parsed.connect,
      resources: parsed.resources,
      resourceTemplates: parsed.resourceTemplates,
      prompts: parsed.prompts
    });
    console.log(parsed.json ? renderMcpDiagnosticReportJson(report) : renderMcpDiagnosticReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "inspect-context") {
    const json = parseJsonOnlyFlag(rest, "god-code mcp inspect-context [--json]");
    const report = await inspectMcpContext();
    console.log(json ? renderMcpDiagnosticReportJson(report) : renderMcpDiagnosticReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "read-resource") {
    const parsed = parseMcpReadResourceFlags(rest);
    const report = await readMcpResource({
      uri: parsed.uri,
      serverId: parsed.serverId
    });
    console.log(parsed.json ? renderMcpDiagnosticReportJson(report) : renderMcpDiagnosticReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "get-prompt") {
    const parsed = parseMcpGetPromptFlags(rest);
    const report = await getMcpPrompt({
      name: parsed.name,
      arguments: parsed.arguments,
      serverId: parsed.serverId
    });
    console.log(parsed.json ? renderMcpDiagnosticReportJson(report) : renderMcpDiagnosticReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "subscribe-resource") {
    const parsed = parseMcpResourceSubscriptionFlags(rest, "god-code mcp subscribe-resource <uri> [--server <server_id>] [--json]");
    const report = await subscribeMcpResource({
      uri: parsed.uri,
      serverId: parsed.serverId
    });
    console.log(parsed.json ? renderMcpDiagnosticReportJson(report) : renderMcpDiagnosticReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "unsubscribe-resource") {
    const parsed = parseMcpResourceSubscriptionFlags(rest, "god-code mcp unsubscribe-resource <uri> [--server <server_id>] [--json]");
    const report = await unsubscribeMcpResource({
      uri: parsed.uri,
      serverId: parsed.serverId
    });
    console.log(parsed.json ? renderMcpDiagnosticReportJson(report) : renderMcpDiagnosticReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "wait-resource-update") {
    const parsed = parseMcpWaitResourceUpdateFlags(rest);
    const report = await waitMcpResourceUpdate({
      uri: parsed.uri,
      serverId: parsed.serverId,
      timeoutMs: parsed.timeoutMs
    });
    console.log(parsed.json ? renderMcpDiagnosticReportJson(report) : renderMcpDiagnosticReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "watch-resource-updates") {
    const parsed = parseMcpWatchResourceUpdatesFlags(rest);
    const report = await watchMcpResourceUpdates({
      uri: parsed.uri,
      serverId: parsed.serverId,
      timeoutMs: parsed.timeoutMs,
      maxEvents: parsed.maxEvents
    });
    console.log(parsed.json ? renderMcpDiagnosticReportJson(report) : renderMcpDiagnosticReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "loop-resource-updates") {
    const parsed = parseMcpLoopResourceUpdatesFlags(rest);
    const report = await loopMcpResourceUpdates({
      uris: parsed.uris,
      serverId: parsed.serverId,
      timeoutMs: parsed.timeoutMs,
      maxEvents: parsed.maxEvents
    });
    console.log(parsed.json ? renderMcpDiagnosticReportJson(report) : renderMcpDiagnosticReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "complete-prompt") {
    const parsed = parseMcpCompletionFlags(
      rest,
      "god-code mcp complete-prompt <name> <argument_name> <argument_value> [context_json] [--server <server_id>] [--json|--values-only|--jsonl]"
    );
    const report = await completeMcpPrompt({
      name: parsed.ref,
      argument: parsed.argument,
      context: parsed.context,
      serverId: parsed.serverId
    });
    writeMcpCompletionOutput(report, parsed.output);
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "complete-resource-template") {
    const parsed = parseMcpCompletionFlags(
      rest,
      "god-code mcp complete-resource-template <uri_template> <argument_name> <argument_value> [context_json] [--server <server_id>] [--json|--values-only|--jsonl]"
    );
    const report = await completeMcpResourceTemplate({
      uriTemplate: parsed.ref,
      argument: parsed.argument,
      context: parsed.context,
      serverId: parsed.serverId
    });
    writeMcpCompletionOutput(report, parsed.output);
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "completion-script") {
    const parsed = parseMcpCompletionScriptFlags(rest);
    console.log(renderMcpCompletionScript(parsed.shell, { programName: parsed.programName }));
    return;
  }

  if (subcommand === "completion-install") {
    const parsed = parseMcpCompletionInstallFlags(rest);
    const report = await installMcpCompletionScript({
      shell: parsed.shell,
      programName: parsed.programName,
      rcFile: parsed.rcFile,
      dryRun: parsed.dryRun,
      cwd: process.cwd()
    });
    console.log(parsed.json ? renderMcpCompletionInstallReportJson(report) : renderMcpCompletionInstallReport(report));
    return;
  }

  throw new CliUsageError("Missing or unknown mcp command. Usage: god-code mcp <inspect-config|inspect-context|read-resource|get-prompt|subscribe-resource|unsubscribe-resource|wait-resource-update|watch-resource-updates|loop-resource-updates|complete-prompt|complete-resource-template|completion-script|completion-install>");
}

function writeMcpCompletionOutput(report: Awaited<ReturnType<typeof completeMcpPrompt>>, output: McpCompletionOutputFormat): void {
  let rendered: string;
  if (output === "json") {
    rendered = renderMcpDiagnosticReportJson(report);
  } else if (output === "values") {
    rendered = renderMcpCompletionValues(report);
  } else if (output === "jsonl") {
    rendered = renderMcpCompletionJsonl(report);
  } else {
    rendered = renderMcpDiagnosticReport(report);
  }
  if (rendered.length > 0) {
    process.stdout.write(`${rendered}\n`);
  }
}

async function handlePluginsCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand === "schema") {
    const json = parseJsonOnlyFlag(rest, "god-code plugins schema [--json]");
    console.log(json ? renderPluginManifestSchemaJson() : renderPluginManifestSchema());
    return;
  }

  if (subcommand === "inspect-config") {
    const json = parseJsonOnlyFlag(rest, "god-code plugins inspect-config [--json]");
    const report = await inspectPluginConfig({ cwd: process.cwd() });
    console.log(json ? renderPluginDiagnosticReportJson(report) : renderPluginDiagnosticReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "list") {
    const json = parseJsonOnlyFlag(rest, "god-code plugins list [--json]");
    const report = await listConfiguredPlugins({ cwd: process.cwd() });
    console.log(json ? renderPluginDiagnosticReportJson(report) : renderPluginDiagnosticReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "inspect") {
    const [pluginId, ...flags] = rest;
    if (!pluginId || pluginId.startsWith("-")) {
      throw new CliUsageError("Missing plugin id. Usage: god-code plugins inspect <plugin_id> [--json]");
    }
    const json = parseJsonOnlyFlag(flags, "god-code plugins inspect <plugin_id> [--json]");
    const report = await inspectConfiguredPlugin(pluginId, { cwd: process.cwd() });
    console.log(json ? renderPluginDiagnosticReportJson(report) : renderPluginDiagnosticReport(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "install") {
    const parsed = parsePluginInstallFlags(rest);
    const result = await installLocalPluginRegistryEntry({
      packageDir: parsed.packageDir,
      registryFile: parsed.registryFile,
      cwd: process.cwd(),
      dryRun: parsed.dryRun,
      yes: parsed.yes,
      enabled: parsed.enabled,
      tags: parsed.tags.length > 0 ? parsed.tags : undefined,
      replace: parsed.replace
    });
    console.log(parsed.json ? renderPluginRegistryInstallResultJson(result) : renderPluginRegistryInstallResult(result));
    return;
  }

  if (subcommand === "uninstall") {
    const parsed = parsePluginUninstallFlags(rest);
    const result = await uninstallLocalPluginRegistryEntry({
      pluginId: parsed.pluginId,
      registryFile: parsed.registryFile,
      cwd: process.cwd(),
      dryRun: parsed.dryRun,
      yes: parsed.yes,
      missingOk: parsed.missingOk
    });
    console.log(
      parsed.json ? renderPluginRegistryUninstallResultJson(result) : renderPluginRegistryUninstallResult(result)
    );
    return;
  }

  if (subcommand === "enable" || subcommand === "disable") {
    const parsed = parsePluginSetEnabledFlags(rest, subcommand);
    const result = await setLocalPluginRegistryEntryEnabled({
      pluginId: parsed.pluginId,
      enabled: subcommand === "enable",
      registryFile: parsed.registryFile,
      cwd: process.cwd(),
      dryRun: parsed.dryRun,
      yes: parsed.yes
    });
    console.log(
      parsed.json ? renderPluginRegistrySetEnabledResultJson(result) : renderPluginRegistrySetEnabledResult(result)
    );
    return;
  }

  if (subcommand === "tags") {
    const parsed = parsePluginTagsFlags(rest);
    const result = await updateLocalPluginRegistryEntryTags({
      pluginId: parsed.pluginId,
      registryFile: parsed.registryFile,
      cwd: process.cwd(),
      dryRun: parsed.dryRun,
      yes: parsed.yes,
      addTags: parsed.addTags,
      removeTags: parsed.removeTags,
      setTags: parsed.setTags,
      clear: parsed.clear
    });
    console.log(parsed.json ? renderPluginRegistryTagsResultJson(result) : renderPluginRegistryTagsResult(result));
    return;
  }

  if (subcommand !== "validate") {
    throw new CliUsageError("Missing or unknown plugins command. Usage: god-code plugins <schema|inspect-config|list|inspect|install|uninstall|enable|disable|tags|validate>");
  }

  const [targetPath, ...flags] = rest;
  if (!targetPath || targetPath.startsWith("-")) {
    throw new CliUsageError("Missing manifest path. Usage: god-code plugins validate <manifest_or_dir> [--json]");
  }
  const json = parseJsonOnlyFlag(flags, "god-code plugins validate <manifest_or_dir> [--json]");
  const report = await validatePluginManifestTarget(targetPath);
  console.log(json ? renderPluginDiagnosticReportJson(report) : renderPluginDiagnosticReport(report));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

async function handleDoctorCommand(args: string[]): Promise<void> {
  const [subcommandOrFlag, ...rest] = args;
  const providerHealth = subcommandOrFlag === "provider-health";
  const flags = providerHealth ? rest : args;

  if (subcommandOrFlag && subcommandOrFlag !== "--json" && !providerHealth) {
    throw new CliUsageError("Unknown doctor command. Usage: god-code doctor [provider-health] [--json]");
  }

  const json = parseJsonOnlyFlag(
    flags,
    providerHealth ? "god-code doctor provider-health [--json]" : "god-code doctor [--json]"
  );
  const report = await runGodCodeDoctor(process.cwd(), { providerHealth });
  console.log(json ? renderDoctorReportJson(report) : renderDoctorReport(report));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

async function handleSessionsCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  const transcriptDir = resolveTranscriptDir(process.cwd());

  if (subcommand === "list") {
    const summaries = await listTranscriptSessions(transcriptDir);
    console.log(renderSessionList(transcriptDir, summaries));
    return;
  }

  if (subcommand === "replay") {
    const [sessionId, ...flags] = rest;
    if (!sessionId) {
      throw new CliUsageError("Missing session id. Usage: god-code sessions replay <session_id> [--json]");
    }
    const json = parseJsonOnlyFlag(flags, "god-code sessions replay <session_id> [--json]");
    const entries = await readTranscriptEntriesForSession(transcriptDir, sessionId);
    console.log(json ? renderTranscriptReplayJson(entries) : renderTranscriptReplay(entries));
    return;
  }

  if (subcommand === "timeline") {
    const [sessionId, ...flags] = rest;
    if (!sessionId || sessionId.startsWith("-")) {
      throw new CliUsageError("Missing session id. Usage: god-code sessions timeline <session_id> [--json] [--no-preview|--preview-chars <n>]");
    }
    const parsed = parseTimelineFlags(
      flags,
      "god-code sessions timeline <session_id> [--json] [--no-preview|--preview-chars <n>]"
    );
    const timeline = await readTranscriptTimelineForSession(transcriptDir, sessionId, {
      includePreview: parsed.includePreview,
      previewChars: parsed.previewChars
    });
    console.log(parsed.json ? renderTranscriptTimelineJson(timeline) : renderTranscriptTimeline(timeline));
    return;
  }

  if (subcommand === "resume") {
    const [sessionId, ...promptArgs] = rest;
    if (!sessionId || sessionId.startsWith("-")) {
      throw new CliUsageError("Missing session id. Usage: god-code sessions resume <session_id> <prompt>");
    }
    const parsed = parseResumeCommand(promptArgs);
    const events: GodCodeEventEnvelope[] = [];
    const approval = resolveCliApproval(parsed.approvalMode);
    const result = await runGodCodeResumedSession(sessionId, parsed.prompt, process.cwd(), {
      renderer: parsed.json ? undefined : new TerminalRenderer(),
      stream: !parsed.json,
      onEvent: parsed.rawEvents ? (event) => events.push(event) : undefined,
      approvalMode: approval.mode,
      approvalPrompt: approval.prompt
    });

    if (parsed.json) {
      const output: JsonResumeOutput = parsed.rawEvents ? { ...result, events } : result;
      console.log(JSON.stringify(output, null, 2));
      if (result.status !== "success") {
        process.exitCode = 1;
      }
      return;
    }

    if (result.status === "success") {
      return;
    }
    if (result.status === "cancelled") {
      throw new Error("Turn cancelled.");
    }
    throw new Error(result.error?.message ?? "Turn failed.");
  }

  if (subcommand === "recover") {
    const [sessionId, ...recoverArgs] = rest;
    if (!sessionId || sessionId.startsWith("-")) {
      throw new CliUsageError("Missing session id. Usage: god-code sessions recover <session_id> [--dry-run|--json] <prompt>");
    }
    const parsed = parseRecoverCommand(recoverArgs);
    const recoveryOptions = {
      strategy: parsed.strategy,
      sourceMode: parsed.sourceMode,
      maxRestoredMessages: parsed.maxRestoredMessages,
      noToolResults: parsed.noToolResults,
      previewChars: parsed.previewChars
    };

    if (parsed.dryRun) {
      const plan = await buildTranscriptRecoveryPlan(transcriptDir, sessionId, recoveryOptions);
      console.log(parsed.json ? renderTranscriptRecoveryPlanJson(plan) : renderTranscriptRecoveryPlan(plan));
      if (!plan.recoverable) {
        process.exitCode = 1;
      }
      return;
    }

    if (!parsed.prompt) {
      throw new CliUsageError("Missing prompt. Usage: god-code sessions recover <session_id> [--json] <prompt>");
    }

    const events: GodCodeEventEnvelope[] = [];
    const approval = resolveCliApproval(parsed.approvalMode);
    const result = await runGodCodeRecoveredSession(
      sessionId,
      parsed.prompt,
      process.cwd(),
      recoveryOptions,
      {
        renderer: parsed.json ? undefined : new TerminalRenderer(),
        stream: !parsed.json,
        onEvent: parsed.rawEvents ? (event) => events.push(event) : undefined,
        approvalMode: approval.mode,
        approvalPrompt: approval.prompt
      }
    );

    if (parsed.json) {
      const output: JsonRecoverOutput = parsed.rawEvents ? { ...result, events } : result;
      console.log(JSON.stringify(output, null, 2));
      if (result.status !== "success") {
        process.exitCode = 1;
      }
      return;
    }

    if (result.status === "success") {
      return;
    }
    if (result.status === "cancelled") {
      throw new Error("Turn cancelled.");
    }
    throw new Error(result.error?.message ?? "Turn failed.");
  }

  if (subcommand === "search") {
    const [query, ...flags] = rest;
    if (!query || query.startsWith("-")) {
      throw new CliUsageError("Missing query. Usage: god-code sessions search <query> [--json]");
    }
    const json = parseJsonOnlyFlag(flags, "god-code sessions search <query> [--json]");
    const results = await searchTranscriptSessions(transcriptDir, query);
    console.log(json ? renderTranscriptSearchJson(results) : renderTranscriptSearch(transcriptDir, query, results));
    return;
  }

  if (subcommand === "global-search") {
    const parsed = parseGlobalSearchFlags(rest);
    const directRoots = resolveGlobalTranscriptSearchRoots(parsed, process.cwd(), process.env);
    const discoverySearchRoots = resolveGlobalTranscriptSearchDiscoveryRoots(parsed, process.cwd());
    if (directRoots.length === 0 && discoverySearchRoots.length === 0) {
      throw new CliUsageError(
        "Missing transcript search root. Usage: god-code sessions global-search <query> [--root <transcript_dir>...] [--search-root <dir>...] [--include-current] [--include-archive] [--max-results <n>] [--discovery-max-depth <n>] [--discovery-limit <n>] [--json]"
      );
    }
    let roots = directRoots;
    let discovery: TranscriptGlobalSearchDiscoverySummary | null = null;
    if (discoverySearchRoots.length > 0) {
      const discovered = await discoverTranscriptRoots({
        searchRoots: discoverySearchRoots,
        cwd: process.cwd(),
        maxDepth: parsed.discoveryMaxDepth,
        limit: parsed.discoveryLimit
      });
      discovery = {
        searchRoots: discovered.searchRoots,
        discoveredRoots: discovered.roots,
        maxDepth: discovered.maxDepth,
        limit: discovered.limit,
        truncated: discovered.truncated
      };
      roots = mergeGlobalTranscriptSearchRoots(
        process.cwd(),
        directRoots,
        discovered.roots.map((root) => root.root)
      );
    }
    const result = await searchGlobalTranscriptSessions({
      query: parsed.query,
      roots,
      cwd: process.cwd(),
      includeArchive: parsed.includeArchive,
      maxResults: parsed.maxResults,
      discovery
    });
    console.log(parsed.json ? renderTranscriptGlobalSearchJson(result) : renderTranscriptGlobalSearch(result));
    return;
  }

  if (subcommand === "roots") {
    const parsed = parseTranscriptRootsFlags(rest);
    const searchRoots = resolveTranscriptRootDiscoverySearchRoots(parsed, process.cwd(), process.env);
    if (searchRoots.length === 0) {
      throw new CliUsageError(
        "Missing transcript root search path. Usage: god-code sessions roots [--search-root <dir>...] [--include-current] [--max-depth <n>] [--limit <n>] [--include-empty] [--json]"
      );
    }
    const result = await discoverTranscriptRoots({
      searchRoots,
      cwd: process.cwd(),
      maxDepth: parsed.maxDepth,
      limit: parsed.limit,
      includeEmpty: parsed.includeEmpty
    });
    console.log(parsed.json ? renderTranscriptRootDiscoveryJson(result) : renderTranscriptRootDiscovery(result));
    return;
  }

  if (subcommand === "watch") {
    const parsed = parseTranscriptWatchFlags(rest);
    const directRoots = resolveTranscriptWatchRoots(parsed, process.cwd(), process.env);
    const discoverySearchRoots = resolveTranscriptWatchDiscoveryRoots(parsed, process.cwd());
    if (directRoots.length === 0 && discoverySearchRoots.length === 0) {
      throw new CliUsageError(
        "Missing transcript watch root. Usage: god-code sessions watch [--root <transcript_dir>...] [--search-root <dir>...] [--include-current] [--include-archive] [--max-events <n>] [--timeout-ms <n>] [--discovery-max-depth <n>] [--discovery-limit <n>] [--json]"
      );
    }

    let roots = directRoots;
    let discovery: TranscriptWatchDiscoverySummary | null = null;
    if (discoverySearchRoots.length > 0) {
      const discovered = await discoverTranscriptRoots({
        searchRoots: discoverySearchRoots,
        cwd: process.cwd(),
        maxDepth: parsed.discoveryMaxDepth,
        limit: parsed.discoveryLimit
      });
      discovery = {
        searchRoots: discovered.searchRoots,
        discoveredRoots: discovered.roots,
        maxDepth: discovered.maxDepth,
        limit: discovered.limit,
        truncated: discovered.truncated
      };
      roots = mergeGlobalTranscriptSearchRoots(
        process.cwd(),
        directRoots,
        discovered.roots.map((root) => root.root)
      );
    }

    const result = await watchTranscriptSessions({
      roots,
      cwd: process.cwd(),
      includeArchive: parsed.includeArchive,
      maxEvents: parsed.maxEvents,
      timeoutMs: parsed.timeoutMs,
      discovery
    });
    console.log(parsed.json ? renderTranscriptWatchJson(result) : renderTranscriptWatch(result));
    return;
  }

  if (subcommand === "cleanup") {
    const parsed = parseCleanupSessionFlags(rest);
    if (parsed.action !== "dry-run" && !parsed.yes) {
      throw new CliUsageError(
        "Transcript cleanup requires --yes when using --archive or --delete. Usage: god-code sessions cleanup --older-than-days <n> [--archive|--delete] [--yes] [--json]"
      );
    }
    const result = await cleanupTranscriptSessions(transcriptDir, {
      olderThanDays: parsed.olderThanDays,
      action: parsed.action
    });
    console.log(parsed.json ? renderTranscriptCleanupJson(result) : renderTranscriptCleanup(result));
    return;
  }

  if (subcommand === "index") {
    await handleSessionsIndexCommand(transcriptDir, rest);
    return;
  }

  if (subcommand === "archive") {
    await handleSessionsArchiveCommand(transcriptDir, rest);
    return;
  }

  if (subcommand === "delete") {
    const [sessionId, ...flags] = rest;
    if (!sessionId || sessionId.startsWith("-")) {
      throw new CliUsageError("Missing session id. Usage: god-code sessions delete <session_id> --yes [--json]");
    }
    const parsed = parseDeleteSessionFlags(flags);
    if (!parsed.yes) {
      throw new CliUsageError("Deleting a session requires --yes. Usage: god-code sessions delete <session_id> --yes [--json]");
    }
    const result = await deleteTranscriptSession(transcriptDir, sessionId);
    console.log(parsed.json ? renderTranscriptDeleteJson(result) : `Deleted transcript session ${sessionId}: ${result.filePath}`);
    return;
  }

  throw new CliUsageError("Missing or unknown sessions command. Usage: god-code sessions <list|replay|timeline|resume|recover|search|global-search|roots|watch|cleanup|index|archive|delete>");
}

async function handleSessionsIndexCommand(transcriptDir: string, args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;

  if (subcommand === "build") {
    const parsed = parseIndexBuildFlags(rest);
    const result = await buildTranscriptSearchIndex(transcriptDir, {
      includeArchive: parsed.includeArchive
    });
    console.log(
      parsed.json
        ? renderTranscriptSearchIndexBuildJson(result)
        : renderTranscriptSearchIndexBuild(result)
    );
    return;
  }

  if (subcommand === "refresh") {
    const parsed = parseIndexRefreshFlags(rest);
    const result = await refreshTranscriptSearchIndex(transcriptDir, {
      includeArchive: parsed.includeArchive
    });
    console.log(
      parsed.json
        ? renderTranscriptSearchIndexRefreshJson(result)
        : renderTranscriptSearchIndexRefresh(result)
    );
    return;
  }

  if (subcommand === "watch-refresh") {
    const parsed = parseIndexWatchRefreshFlags(rest);
    const directRoots = resolveIndexWatchRefreshRoots(parsed, process.cwd(), process.env);
    const discoverySearchRoots = resolveIndexWatchRefreshDiscoveryRoots(parsed, process.cwd());
    if (directRoots.length === 0 && discoverySearchRoots.length === 0) {
      throw new CliUsageError(
        "Missing transcript index watch-refresh root. Usage: god-code sessions index watch-refresh [--root <transcript_dir>...] [--search-root <dir>...] [--include-current] [--include-archive] [--max-events <n>] [--timeout-ms <n>] [--debounce-ms <n>] [--refresh-on-timeout] [--discovery-max-depth <n>] [--discovery-limit <n>] [--json]"
      );
    }

    let roots = directRoots;
    let discovery: TranscriptIndexWatchRefreshDiscoverySummary | null = null;
    if (discoverySearchRoots.length > 0) {
      const discovered = await discoverTranscriptRoots({
        searchRoots: discoverySearchRoots,
        cwd: process.cwd(),
        maxDepth: parsed.discoveryMaxDepth,
        limit: parsed.discoveryLimit
      });
      discovery = {
        searchRoots: discovered.searchRoots,
        discoveredRoots: discovered.roots,
        maxDepth: discovered.maxDepth,
        limit: discovered.limit,
        truncated: discovered.truncated
      };
      roots = mergeGlobalTranscriptSearchRoots(
        process.cwd(),
        directRoots,
        discovered.roots.map((root) => root.root)
      );
    }

    const result = await watchRefreshTranscriptSearchIndex({
      roots,
      cwd: process.cwd(),
      includeArchive: parsed.includeArchive,
      maxEvents: parsed.maxEvents,
      timeoutMs: parsed.timeoutMs,
      debounceMs: parsed.debounceMs,
      refreshOnTimeout: parsed.refreshOnTimeout,
      discovery
    });
    console.log(parsed.json ? renderTranscriptIndexWatchRefreshJson(result) : renderTranscriptIndexWatchRefresh(result));
    return;
  }

  if (subcommand === "search") {
    const [query, ...flags] = rest;
    if (!query || query.startsWith("-")) {
      throw new CliUsageError("Missing query. Usage: god-code sessions index search <query> [--refresh] [--include-archive] [--json]");
    }
    const parsed = parseIndexSearchFlags(flags);
    if (parsed.refresh) {
      await refreshTranscriptSearchIndex(transcriptDir, {
        includeArchive: parsed.includeArchive
      });
    } else if (parsed.includeArchive) {
      throw new CliUsageError("The --include-archive flag for indexed search requires --refresh. Usage: god-code sessions index search <query> [--refresh] [--include-archive] [--json]");
    }
    const result = await searchTranscriptIndex(transcriptDir, query);
    console.log(parsed.json ? renderTranscriptIndexSearchJson(result) : renderTranscriptIndexSearch(query, result));
    return;
  }

  throw new CliUsageError("Missing or unknown sessions index command. Usage: god-code sessions index <build|refresh|watch-refresh|search>");
}

async function handleSessionsArchiveCommand(transcriptDir: string, args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;

  if (subcommand === "list") {
    const json = parseJsonOnlyFlag(rest, "god-code sessions archive list [--json]");
    const summaries = await listArchivedTranscriptSessions(transcriptDir);
    console.log(json ? JSON.stringify(summaries, null, 2) : renderSessionList(resolveTranscriptArchiveDir(transcriptDir), summaries));
    return;
  }

  if (subcommand === "replay") {
    const [sessionId, ...flags] = rest;
    if (!sessionId || sessionId.startsWith("-")) {
      throw new CliUsageError("Missing session id. Usage: god-code sessions archive replay <session_id> [--json]");
    }
    const json = parseJsonOnlyFlag(flags, "god-code sessions archive replay <session_id> [--json]");
    const entries = await readArchivedTranscriptEntriesForSession(transcriptDir, sessionId);
    console.log(json ? renderTranscriptReplayJson(entries) : renderTranscriptReplay(entries));
    return;
  }

  if (subcommand === "timeline") {
    const [sessionId, ...flags] = rest;
    if (!sessionId || sessionId.startsWith("-")) {
      throw new CliUsageError("Missing session id. Usage: god-code sessions archive timeline <session_id> [--json] [--no-preview|--preview-chars <n>]");
    }
    const parsed = parseTimelineFlags(
      flags,
      "god-code sessions archive timeline <session_id> [--json] [--no-preview|--preview-chars <n>]"
    );
    const timeline = await readArchivedTranscriptTimelineForSession(transcriptDir, sessionId, {
      includePreview: parsed.includePreview,
      previewChars: parsed.previewChars
    });
    console.log(parsed.json ? renderTranscriptTimelineJson(timeline) : renderTranscriptTimeline(timeline));
    return;
  }

  if (subcommand === "search") {
    const [query, ...flags] = rest;
    if (!query || query.startsWith("-")) {
      throw new CliUsageError("Missing query. Usage: god-code sessions archive search <query> [--json]");
    }
    const json = parseJsonOnlyFlag(flags, "god-code sessions archive search <query> [--json]");
    const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
    const results = await searchArchivedTranscriptSessions(transcriptDir, query);
    console.log(json ? renderTranscriptSearchJson(results) : renderTranscriptSearch(archiveDir, query, results));
    return;
  }

  if (subcommand === "restore") {
    const [sessionId, ...flags] = rest;
    if (!sessionId || sessionId.startsWith("-")) {
      throw new CliUsageError("Missing session id. Usage: god-code sessions archive restore <session_id> --yes [--json]");
    }
    const parsed = parseArchiveRestoreFlags(flags);
    if (!parsed.yes) {
      throw new CliUsageError("Restoring an archived session requires --yes. Usage: god-code sessions archive restore <session_id> --yes [--json]");
    }
    const result = await restoreArchivedTranscriptSession(transcriptDir, sessionId);
    console.log(
      parsed.json
        ? renderTranscriptArchiveRestoreJson(result)
        : `Restored archived transcript session ${sessionId}: ${result.sourcePath} -> ${result.restoredPath}`
    );
    return;
  }

  if (subcommand === "compress") {
    const [sessionId, ...flags] = rest;
    if (!sessionId || sessionId.startsWith("-")) {
      throw new CliUsageError("Missing session id. Usage: god-code sessions archive compress <session_id> --yes [--json]");
    }
    const parsed = parseArchiveCompressFlags(flags);
    if (!parsed.yes) {
      throw new CliUsageError("Compressing an archived session requires --yes. Usage: god-code sessions archive compress <session_id> --yes [--json]");
    }
    const result = await compressArchivedTranscriptSession(transcriptDir, sessionId);
    console.log(
      parsed.json
        ? renderTranscriptArchiveCompressJson(result)
        : `Compressed archived transcript session ${sessionId}: ${result.sourcePath} -> ${result.compressedPath}`
    );
    return;
  }

  if (subcommand === "delete") {
    const [sessionId, ...flags] = rest;
    if (!sessionId || sessionId.startsWith("-")) {
      throw new CliUsageError("Missing session id. Usage: god-code sessions archive delete <session_id> --yes [--json]");
    }
    const parsed = parseArchiveDeleteFlags(flags);
    if (!parsed.yes) {
      throw new CliUsageError("Deleting an archived session requires --yes. Usage: god-code sessions archive delete <session_id> --yes [--json]");
    }
    const result = await deleteArchivedTranscriptSession(transcriptDir, sessionId);
    console.log(
      parsed.json
        ? renderTranscriptDeleteJson(result)
        : `Deleted archived transcript session ${sessionId}: ${result.filePath}`
    );
    return;
  }

  throw new CliUsageError("Missing or unknown sessions archive command. Usage: god-code sessions archive <list|replay|timeline|search|restore|compress|delete>");
}

async function handleToolsCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;

  if (subcommand === "list") {
    const json = parseJsonOnlyFlag(rest, "god-code tools list [--json]");
    const tools = await listHostTools();
    console.log(json ? renderToolListJson(tools) : renderToolList(tools));
    return;
  }

  if (subcommand === "inspect") {
    const [toolName, ...flags] = rest;
    if (!toolName || toolName.startsWith("-")) {
      throw new CliUsageError("Missing tool name. Usage: god-code tools inspect <tool_name> [--json]");
    }
    const json = parseJsonOnlyFlag(flags, "god-code tools inspect <tool_name> [--json]");
    const tool = await getHostTool(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    console.log(json ? renderToolInspectJson(tool) : renderToolInspect(tool));
    return;
  }

  throw new CliUsageError("Missing or unknown tools command. Usage: god-code tools <list|inspect>");
}

function parseRunCommand(args: string[]): ParsedRunCommand {
  return parsePromptCommand(args, {
    plain: "god-code run <prompt>",
    json: "god-code run --json <prompt>",
    rawEvents: "god-code run --json --raw-events <prompt>",
    approval: "god-code run [--approval-mode <never|prompt>] [--json] [--raw-events] <prompt>"
  });
}

function parseResumeCommand(args: string[]): ParsedRunCommand {
  return parsePromptCommand(args, {
    plain: "god-code sessions resume <session_id> <prompt>",
    json: "god-code sessions resume <session_id> --json <prompt>",
    rawEvents: "god-code sessions resume <session_id> --json --raw-events <prompt>",
    approval:
      "god-code sessions resume <session_id> [--approval-mode <never|prompt>] [--json] [--raw-events] <prompt>"
  });
}

function parseRecoverCommand(args: string[]): ParsedRecoverCommand {
  const usage =
    "god-code sessions recover <session_id> [--dry-run] [--strategy <strict|best-effort|compact>] [--archive|--include-archived] [--max-restored-messages <n>] [--no-tool-results] [--preview-chars <n>] [--approval-mode <never|prompt>] [--json] [--raw-events] <prompt>";
  let json = false;
  let rawEvents = false;
  let dryRun = false;
  let sourceMode: TranscriptRecoverySourceMode = "active";
  let strategy: TranscriptRecoveryStrategy = "strict";
  let maxRestoredMessages: number | undefined;
  let noToolResults = false;
  let previewChars = 160;
  let approvalMode: ToolApprovalMode | undefined;
  const promptParts: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--raw-events") {
      rawEvents = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--archive") {
      sourceMode = "archive";
      continue;
    }
    if (arg === "--include-archived") {
      sourceMode = "include-archived";
      continue;
    }
    if (arg === "--no-tool-results") {
      noToolResults = true;
      continue;
    }
    if (arg === "--strategy") {
      strategy = parseRecoveryStrategy(requireFlagValue(args, index, "--strategy", usage), usage);
      index += 1;
      continue;
    }
    if (arg.startsWith("--strategy=")) {
      strategy = parseRecoveryStrategy(arg.slice("--strategy=".length), usage);
      continue;
    }
    if (arg === "--max-restored-messages") {
      maxRestoredMessages = parsePositiveInteger(
        requireFlagValue(args, index, "--max-restored-messages", usage),
        "--max-restored-messages",
        usage
      );
      index += 1;
      continue;
    }
    if (arg === "--preview-chars") {
      previewChars = parsePositiveInteger(
        requireFlagValue(args, index, "--preview-chars", usage),
        "--preview-chars",
        usage
      );
      index += 1;
      continue;
    }
    if (arg === "--approval-mode") {
      approvalMode = parseCliApprovalMode(
        requireFlagValue(args, index, "--approval-mode", usage),
        "--approval-mode",
        usage
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--approval-mode=")) {
      approvalMode = parseCliApprovalMode(arg.slice("--approval-mode=".length), "--approval-mode", usage);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown option: ${arg}. Usage: ${usage}`);
    }
    promptParts.push(arg);
  }

  if (rawEvents && !json) {
    throw new CliUsageError(`The --raw-events flag requires --json. Usage: ${usage}`);
  }

  if (dryRun && promptParts.length > 0) {
    throw new CliUsageError(`Dry-run recovery does not accept a prompt. Usage: ${usage}`);
  }

  return {
    json,
    rawEvents,
    dryRun,
    sourceMode,
    strategy,
    maxRestoredMessages,
    noToolResults,
    previewChars,
    approvalMode,
    prompt: promptParts.length > 0 ? promptParts.join(" ") : null
  };
}

function parseRecoveryStrategy(value: string, usage: string): TranscriptRecoveryStrategy {
  if (value === "strict" || value === "best-effort" || value === "compact") {
    return value;
  }
  throw new CliUsageError(`Expected --strategy to be strict, best-effort, or compact. Usage: ${usage}`);
}

function parsePromptCommand(
  args: string[],
  usage: { plain: string; json: string; rawEvents: string; approval: string }
): ParsedRunCommand {
  let json = false;
  let rawEvents = false;
  let approvalMode: ToolApprovalMode | undefined;
  const promptParts: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--raw-events") {
      rawEvents = true;
      continue;
    }
    if (arg === "--approval-mode") {
      approvalMode = parseCliApprovalMode(
        requireFlagValue(args, index, "--approval-mode", usage.approval),
        "--approval-mode",
        usage.approval
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--approval-mode=")) {
      approvalMode = parseCliApprovalMode(
        arg.slice("--approval-mode=".length),
        "--approval-mode",
        usage.approval
      );
      continue;
    }
    promptParts.push(arg);
  }

  if (rawEvents && !json) {
    throw new CliUsageError(`The --raw-events flag requires --json. Usage: ${usage.rawEvents}`);
  }

  if (promptParts.length === 0) {
    if (json && rawEvents) {
      throw new CliUsageError(`Missing prompt. Usage: ${usage.rawEvents}`);
    }
    throw new CliUsageError(`Missing prompt. Usage: ${json ? usage.json : usage.plain}`);
  }

  return {
    json,
    rawEvents,
    approvalMode,
    prompt: promptParts.join(" ")
  };
}

function parseReplCommand(args: string[]): ParsedReplCommand {
  const usage = "god-code repl [--approval-mode <never|prompt>]";
  let approvalMode: ToolApprovalMode | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--approval-mode") {
      approvalMode = parseCliApprovalMode(
        requireFlagValue(args, index, "--approval-mode", usage),
        "--approval-mode",
        usage
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--approval-mode=")) {
      approvalMode = parseCliApprovalMode(arg.slice("--approval-mode=".length), "--approval-mode", usage);
      continue;
    }
    throw new CliUsageError(`Unknown option: ${arg}. Usage: ${usage}`);
  }
  return { approvalMode };
}

function parseTuiCommand(args: string[]): ParsedTuiCommand {
  const usage =
    "god-code tui [--transcript-dir <dir>] [--model-adapter <name>] [--approval-mode <never|prompt>] [--no-stream]";
  let approvalMode: ToolApprovalMode | undefined;
  let transcriptDir: string | undefined;
  let modelAdapter: string | undefined;
  let stream = true;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--json") {
      throw new CliUsageError(`The --json flag is not supported for TUI. Usage: ${usage}`);
    }
    if (arg === "--no-stream") {
      stream = false;
      continue;
    }
    if (arg === "--transcript-dir") {
      transcriptDir = requireFlagValue(args, index, "--transcript-dir", usage);
      index += 1;
      continue;
    }
    if (arg.startsWith("--transcript-dir=")) {
      transcriptDir = arg.slice("--transcript-dir=".length);
      continue;
    }
    if (arg === "--model-adapter") {
      modelAdapter = requireFlagValue(args, index, "--model-adapter", usage);
      index += 1;
      continue;
    }
    if (arg.startsWith("--model-adapter=")) {
      modelAdapter = arg.slice("--model-adapter=".length);
      continue;
    }
    if (arg === "--approval-mode") {
      approvalMode = parseCliApprovalMode(
        requireFlagValue(args, index, "--approval-mode", usage),
        "--approval-mode",
        usage
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--approval-mode=")) {
      approvalMode = parseCliApprovalMode(arg.slice("--approval-mode=".length), "--approval-mode", usage);
      continue;
    }
    throw new CliUsageError(`Unknown option: ${arg}. Usage: ${usage}`);
  }

  return {
    approvalMode,
    transcriptDir,
    modelAdapter,
    stream,
    help
  };
}

function parseCliApprovalMode(value: string, flagName: string, usage: string): ToolApprovalMode {
  try {
    return parseToolApprovalMode(value, flagName);
  } catch {
    throw new CliUsageError(`Expected ${flagName} to be never or prompt. Usage: ${usage}`);
  }
}

function resolveCliApproval(explicitMode: ToolApprovalMode | undefined): {
  mode: ToolApprovalMode;
  prompt?: ToolApprovalPrompt;
} {
  const mode = resolveToolApprovalMode(explicitMode, process.env);
  if (mode !== "prompt") {
    return { mode };
  }
  return {
    mode,
    prompt: new TerminalApprovalPrompt()
  };
}

function parseJsonOnlyFlag(args: string[], usage: string): boolean {
  if (args.length === 0) {
    return false;
  }
  if (args.length === 1 && args[0] === "--json") {
    return true;
  }
  throw new CliUsageError(`Unknown option. Usage: ${usage}`);
}

function parsePluginInstallFlags(args: string[]): ParsedPluginInstallCommand {
  const usage =
    "god-code plugins install <plugin_or_skill_dir> [--registry-file <path>] [--dry-run|--yes] [--enable|--disable] [--tag <tag>...] [--replace] [--json]";
  let packageDir: string | undefined;
  let registryFile: string | undefined;
  let dryRun = true;
  let yes = false;
  let json = false;
  let enabled: boolean | undefined;
  const tags: string[] = [];
  let replace = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--registry-file") {
      registryFile = requireFlagValue(args, index, "--registry-file", usage);
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      if (yes) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = true;
      continue;
    }
    if (arg === "--yes") {
      if (dryRun === true && args.includes("--dry-run")) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = false;
      yes = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--enable") {
      if (enabled === false) {
        throw new CliUsageError(`--enable and --disable are mutually exclusive. Usage: ${usage}`);
      }
      enabled = true;
      continue;
    }
    if (arg === "--disable") {
      if (enabled === true) {
        throw new CliUsageError(`--enable and --disable are mutually exclusive. Usage: ${usage}`);
      }
      enabled = false;
      continue;
    }
    if (arg === "--tag") {
      tags.push(requireFlagValue(args, index, "--tag", usage));
      index += 1;
      continue;
    }
    if (arg === "--replace") {
      replace = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown option: ${arg}. Usage: ${usage}`);
    }
    if (packageDir !== undefined) {
      throw new CliUsageError(`Unexpected argument: ${arg}. Usage: ${usage}`);
    }
    packageDir = arg;
  }

  if (packageDir === undefined) {
    throw new CliUsageError(`Missing plugin package directory. Usage: ${usage}`);
  }

  return {
    packageDir,
    registryFile,
    dryRun,
    yes,
    json,
    enabled,
    tags,
    replace
  };
}

function parsePluginUninstallFlags(args: string[]): ParsedPluginUninstallCommand {
  const usage =
    "god-code plugins uninstall <plugin_id> [--registry-file <path>] [--dry-run|--yes] [--missing-ok] [--json]";
  let pluginId: string | undefined;
  let registryFile: string | undefined;
  let dryRun = true;
  let yes = false;
  let json = false;
  let missingOk = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--registry-file") {
      registryFile = requireFlagValue(args, index, "--registry-file", usage);
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      if (yes) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = true;
      continue;
    }
    if (arg === "--yes") {
      if (dryRun === true && args.includes("--dry-run")) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = false;
      yes = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--missing-ok") {
      missingOk = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown option: ${arg}. Usage: ${usage}`);
    }
    if (pluginId !== undefined) {
      throw new CliUsageError(`Unexpected argument: ${arg}. Usage: ${usage}`);
    }
    pluginId = arg;
  }

  if (pluginId === undefined) {
    throw new CliUsageError(`Missing plugin id. Usage: ${usage}`);
  }

  return {
    pluginId,
    registryFile,
    dryRun,
    yes,
    json,
    missingOk
  };
}

function parsePluginSetEnabledFlags(
  args: string[],
  subcommand: "enable" | "disable"
): ParsedPluginSetEnabledCommand {
  const usage = `god-code plugins ${subcommand} <plugin_id> [--registry-file <path>] [--dry-run|--yes] [--json]`;
  let pluginId: string | undefined;
  let registryFile: string | undefined;
  let dryRun = true;
  let yes = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--registry-file") {
      registryFile = requireFlagValue(args, index, "--registry-file", usage);
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      if (yes) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = true;
      continue;
    }
    if (arg === "--yes") {
      if (dryRun === true && args.includes("--dry-run")) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = false;
      yes = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown option: ${arg}. Usage: ${usage}`);
    }
    if (pluginId !== undefined) {
      throw new CliUsageError(`Unexpected argument: ${arg}. Usage: ${usage}`);
    }
    pluginId = arg;
  }

  if (pluginId === undefined) {
    throw new CliUsageError(`Missing plugin id. Usage: ${usage}`);
  }

  return {
    pluginId,
    registryFile,
    dryRun,
    yes,
    json
  };
}

function parsePluginTagsFlags(args: string[]): ParsedPluginTagsCommand {
  const usage =
    "god-code plugins tags <plugin_id> [--registry-file <path>] [--add <tag>...] [--remove <tag>...] [--set <tag1,tag2>] [--clear] [--dry-run|--yes] [--json]";
  let pluginId: string | undefined;
  let registryFile: string | undefined;
  let dryRun = true;
  let yes = false;
  let json = false;
  const addTags: string[] = [];
  const removeTags: string[] = [];
  let setTags: string[] | undefined;
  let clear = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--registry-file") {
      registryFile = requireFlagValue(args, index, "--registry-file", usage);
      index += 1;
      continue;
    }
    if (arg === "--add") {
      addTags.push(requireFlagValue(args, index, "--add", usage));
      index += 1;
      continue;
    }
    if (arg === "--remove") {
      removeTags.push(requireFlagValue(args, index, "--remove", usage));
      index += 1;
      continue;
    }
    if (arg === "--set") {
      if (setTags !== undefined) {
        throw new CliUsageError(`--set can only be provided once. Usage: ${usage}`);
      }
      setTags = parseCommaSeparatedTagList(requireFlagValue(args, index, "--set", usage), "--set", usage);
      index += 1;
      continue;
    }
    if (arg === "--clear") {
      clear = true;
      continue;
    }
    if (arg === "--dry-run") {
      if (yes) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = true;
      continue;
    }
    if (arg === "--yes") {
      if (dryRun === true && args.includes("--dry-run")) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = false;
      yes = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown option: ${arg}. Usage: ${usage}`);
    }
    if (pluginId !== undefined) {
      throw new CliUsageError(`Unexpected argument: ${arg}. Usage: ${usage}`);
    }
    pluginId = arg;
  }

  if (pluginId === undefined) {
    throw new CliUsageError(`Missing plugin id. Usage: ${usage}`);
  }
  if (clear && setTags !== undefined) {
    throw new CliUsageError(`--set and --clear are mutually exclusive. Usage: ${usage}`);
  }
  if ((clear || setTags !== undefined) && (addTags.length > 0 || removeTags.length > 0)) {
    throw new CliUsageError(`--set/--clear cannot be combined with --add/--remove. Usage: ${usage}`);
  }
  if (!clear && setTags === undefined && addTags.length === 0 && removeTags.length === 0) {
    throw new CliUsageError(`Missing tag operation. Use --add, --remove, --set, or --clear. Usage: ${usage}`);
  }

  return {
    pluginId,
    registryFile,
    dryRun,
    yes,
    json,
    addTags,
    removeTags,
    setTags,
    clear
  };
}

function requireFlagValue(args: string[], index: number, flagName: string, usage: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new CliUsageError(`Missing value for ${flagName}. Usage: ${usage}`);
  }
  return value;
}

function parseCommaSeparatedTagList(raw: string, flagName: string, usage: string): string[] {
  const tags = raw.split(",").map((tag) => tag.trim());
  if (tags.length === 0 || tags.some((tag) => tag.length === 0)) {
    throw new CliUsageError(`Expected comma-separated tags for ${flagName}. Usage: ${usage}`);
  }
  return tags;
}

function parseTimelineFlags(args: string[], usage: string): ParsedTimelineCommand {
  let json = false;
  let includePreview = true;
  let previewChars = DEFAULT_TRANSCRIPT_TIMELINE_PREVIEW_CHARS;
  let previewCharsProvided = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--no-preview") {
      if (previewCharsProvided) {
        throw new CliUsageError(`--no-preview and --preview-chars are mutually exclusive. Usage: ${usage}`);
      }
      includePreview = false;
      continue;
    }
    if (arg === "--preview-chars") {
      if (!includePreview) {
        throw new CliUsageError(`--no-preview and --preview-chars are mutually exclusive. Usage: ${usage}`);
      }
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new CliUsageError(`Missing value for --preview-chars. Usage: ${usage}`);
      }
      previewChars = parseBoundedPositiveInteger(
        value,
        "--preview-chars",
        usage,
        MAX_TRANSCRIPT_TIMELINE_PREVIEW_CHARS
      );
      previewCharsProvided = true;
      index += 1;
      continue;
    }
    if (arg.startsWith("--preview-chars=")) {
      if (!includePreview) {
        throw new CliUsageError(`--no-preview and --preview-chars are mutually exclusive. Usage: ${usage}`);
      }
      previewChars = parseBoundedPositiveInteger(
        arg.slice("--preview-chars=".length),
        "--preview-chars",
        usage,
        MAX_TRANSCRIPT_TIMELINE_PREVIEW_CHARS
      );
      previewCharsProvided = true;
      continue;
    }
    throw new CliUsageError(`Unknown option. Usage: ${usage}`);
  }

  return {
    json,
    includePreview,
    previewChars
  };
}

function parseGlobalSearchFlags(args: string[]): ParsedGlobalSearchCommand {
  const usage =
    "god-code sessions global-search <query> [--root <transcript_dir>...] [--search-root <dir>...] [--include-current] [--include-archive] [--max-results <n>] [--discovery-max-depth <n>] [--discovery-limit <n>] [--json]";
  let query: string | undefined;
  const roots: string[] = [];
  const searchRoots: string[] = [];
  let includeCurrent = false;
  let includeArchive = false;
  let maxResults: number | null = null;
  let discoveryMaxDepth = DEFAULT_TRANSCRIPT_ROOT_DISCOVERY_MAX_DEPTH;
  let discoveryLimit = DEFAULT_TRANSCRIPT_ROOT_DISCOVERY_LIMIT;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--root") {
      roots.push(requireFlagValue(args, index, "--root", usage));
      index += 1;
      continue;
    }
    if (arg === "--search-root") {
      searchRoots.push(requireFlagValue(args, index, "--search-root", usage));
      index += 1;
      continue;
    }
    if (arg === "--include-current") {
      includeCurrent = true;
      continue;
    }
    if (arg === "--include-archive") {
      includeArchive = true;
      continue;
    }
    if (arg === "--max-results") {
      maxResults = parsePositiveInteger(requireFlagValue(args, index, "--max-results", usage), "--max-results", usage);
      index += 1;
      continue;
    }
    if (arg.startsWith("--max-results=")) {
      maxResults = parsePositiveInteger(arg.slice("--max-results=".length), "--max-results", usage);
      continue;
    }
    if (arg === "--discovery-max-depth") {
      discoveryMaxDepth = parseBoundedPositiveInteger(
        requireFlagValue(args, index, "--discovery-max-depth", usage),
        "--discovery-max-depth",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_MAX_DEPTH
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--discovery-max-depth=")) {
      discoveryMaxDepth = parseBoundedPositiveInteger(
        arg.slice("--discovery-max-depth=".length),
        "--discovery-max-depth",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_MAX_DEPTH
      );
      continue;
    }
    if (arg === "--discovery-limit") {
      discoveryLimit = parseBoundedPositiveInteger(
        requireFlagValue(args, index, "--discovery-limit", usage),
        "--discovery-limit",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_LIMIT
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--discovery-limit=")) {
      discoveryLimit = parseBoundedPositiveInteger(
        arg.slice("--discovery-limit=".length),
        "--discovery-limit",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_LIMIT
      );
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown option: ${arg}. Usage: ${usage}`);
    }
    if (query !== undefined) {
      throw new CliUsageError(`Unexpected argument: ${arg}. Usage: ${usage}`);
    }
    query = arg;
  }

  if (query === undefined || query.trim().length === 0) {
    throw new CliUsageError(`Missing query. Usage: ${usage}`);
  }

  return {
    query,
    roots,
    searchRoots,
    includeCurrent,
    includeArchive,
    maxResults,
    discoveryMaxDepth,
    discoveryLimit,
    json
  };
}

function resolveGlobalTranscriptSearchRoots(
  parsed: ParsedGlobalSearchCommand,
  cwd: string,
  environ: Record<string, string | undefined>
): string[] {
  const rawRoots: string[] = [];
  if (parsed.includeCurrent) {
    rawRoots.push(resolveTranscriptDir(cwd, environ));
  }
  rawRoots.push(...parseGlobalTranscriptSearchEnvRoots(environ.GOD_CODE_TRANSCRIPT_SEARCH_DIRS));
  rawRoots.push(...parsed.roots);

  const seen = new Set<string>();
  const resolvedRoots: string[] = [];
  for (const rawRoot of rawRoots) {
    if (rawRoot.trim().length === 0) {
      throw new CliUsageError("Transcript search roots must be non-empty strings.");
    }
    const resolved = path.resolve(cwd, rawRoot);
    const key = path.normalize(resolved);
    if (!seen.has(key)) {
      seen.add(key);
      resolvedRoots.push(resolved);
    }
  }
  return resolvedRoots;
}

function parseGlobalTranscriptSearchEnvRoots(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim().length === 0) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliUsageError(`GOD_CODE_TRANSCRIPT_SEARCH_DIRS must be a JSON string array: ${message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new CliUsageError("GOD_CODE_TRANSCRIPT_SEARCH_DIRS must be a JSON string array.");
  }

  return parsed.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new CliUsageError(`GOD_CODE_TRANSCRIPT_SEARCH_DIRS entry at index ${index} must be a non-empty string.`);
    }
    return entry;
  });
}

function resolveGlobalTranscriptSearchDiscoveryRoots(parsed: ParsedGlobalSearchCommand, cwd: string): string[] {
  const seen = new Set<string>();
  const resolvedRoots: string[] = [];
  for (const rawRoot of parsed.searchRoots) {
    if (rawRoot.trim().length === 0) {
      throw new CliUsageError("Transcript global search discovery roots must be non-empty strings.");
    }
    const resolved = path.resolve(cwd, rawRoot);
    const key = path.normalize(resolved);
    if (!seen.has(key)) {
      seen.add(key);
      resolvedRoots.push(resolved);
    }
  }
  return resolvedRoots;
}

function mergeGlobalTranscriptSearchRoots(cwd: string, directRoots: string[], discoveredRoots: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const root of [...directRoots, ...discoveredRoots]) {
    const resolved = path.resolve(cwd, root);
    const key = path.normalize(resolved);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(resolved);
    }
  }
  return merged;
}

function parseTranscriptRootsFlags(args: string[]): ParsedTranscriptRootsCommand {
  const usage =
    "god-code sessions roots [--search-root <dir>...] [--include-current] [--max-depth <n>] [--limit <n>] [--include-empty] [--json]";
  const searchRoots: string[] = [];
  let includeCurrent = false;
  let maxDepth = DEFAULT_TRANSCRIPT_ROOT_DISCOVERY_MAX_DEPTH;
  let limit = DEFAULT_TRANSCRIPT_ROOT_DISCOVERY_LIMIT;
  let includeEmpty = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--search-root") {
      searchRoots.push(requireFlagValue(args, index, "--search-root", usage));
      index += 1;
      continue;
    }
    if (arg === "--include-current") {
      includeCurrent = true;
      continue;
    }
    if (arg === "--max-depth") {
      maxDepth = parseBoundedPositiveInteger(
        requireFlagValue(args, index, "--max-depth", usage),
        "--max-depth",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_MAX_DEPTH
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--max-depth=")) {
      maxDepth = parseBoundedPositiveInteger(
        arg.slice("--max-depth=".length),
        "--max-depth",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_MAX_DEPTH
      );
      continue;
    }
    if (arg === "--limit") {
      limit = parseBoundedPositiveInteger(
        requireFlagValue(args, index, "--limit", usage),
        "--limit",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_LIMIT
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      limit = parseBoundedPositiveInteger(
        arg.slice("--limit=".length),
        "--limit",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_LIMIT
      );
      continue;
    }
    if (arg === "--include-empty") {
      includeEmpty = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    throw new CliUsageError(`Unknown option: ${arg}. Usage: ${usage}`);
  }

  return {
    searchRoots,
    includeCurrent,
    maxDepth,
    limit,
    includeEmpty,
    json
  };
}

function resolveTranscriptRootDiscoverySearchRoots(
  parsed: ParsedTranscriptRootsCommand,
  cwd: string,
  environ: Record<string, string | undefined>
): string[] {
  const rawRoots: string[] = [];
  if (parsed.includeCurrent) {
    rawRoots.push(cwd);
  }
  rawRoots.push(...parseTranscriptRootDiscoveryEnvSearchRoots(environ.GOD_CODE_TRANSCRIPT_ROOT_SEARCH_DIRS));
  rawRoots.push(...parsed.searchRoots);

  const seen = new Set<string>();
  const resolvedRoots: string[] = [];
  for (const rawRoot of rawRoots) {
    if (rawRoot.trim().length === 0) {
      throw new CliUsageError("Transcript root discovery search roots must be non-empty strings.");
    }
    const resolved = path.resolve(cwd, rawRoot);
    const key = path.normalize(resolved);
    if (!seen.has(key)) {
      seen.add(key);
      resolvedRoots.push(resolved);
    }
  }
  return resolvedRoots;
}

function parseTranscriptRootDiscoveryEnvSearchRoots(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim().length === 0) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliUsageError(`GOD_CODE_TRANSCRIPT_ROOT_SEARCH_DIRS must be a JSON string array: ${message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new CliUsageError("GOD_CODE_TRANSCRIPT_ROOT_SEARCH_DIRS must be a JSON string array.");
  }

  return parsed.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new CliUsageError(`GOD_CODE_TRANSCRIPT_ROOT_SEARCH_DIRS entry at index ${index} must be a non-empty string.`);
    }
    return entry;
  });
}

function parseTranscriptWatchFlags(args: string[]): ParsedTranscriptWatchCommand {
  const usage =
    "god-code sessions watch [--root <transcript_dir>...] [--search-root <dir>...] [--include-current] [--include-archive] [--max-events <n>] [--timeout-ms <n>] [--discovery-max-depth <n>] [--discovery-limit <n>] [--json]";
  const roots: string[] = [];
  const searchRoots: string[] = [];
  let includeCurrent = false;
  let includeArchive = false;
  let discoveryMaxDepth = DEFAULT_TRANSCRIPT_ROOT_DISCOVERY_MAX_DEPTH;
  let discoveryLimit = DEFAULT_TRANSCRIPT_ROOT_DISCOVERY_LIMIT;
  let maxEvents = DEFAULT_TRANSCRIPT_WATCH_MAX_EVENTS;
  let timeoutMs = DEFAULT_TRANSCRIPT_WATCH_TIMEOUT_MS;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--root") {
      roots.push(requireFlagValue(args, index, "--root", usage));
      index += 1;
      continue;
    }
    if (arg === "--search-root") {
      searchRoots.push(requireFlagValue(args, index, "--search-root", usage));
      index += 1;
      continue;
    }
    if (arg === "--include-current") {
      includeCurrent = true;
      continue;
    }
    if (arg === "--include-archive") {
      includeArchive = true;
      continue;
    }
    if (arg === "--discovery-max-depth") {
      discoveryMaxDepth = parseBoundedPositiveInteger(
        requireFlagValue(args, index, "--discovery-max-depth", usage),
        "--discovery-max-depth",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_MAX_DEPTH
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--discovery-max-depth=")) {
      discoveryMaxDepth = parseBoundedPositiveInteger(
        arg.slice("--discovery-max-depth=".length),
        "--discovery-max-depth",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_MAX_DEPTH
      );
      continue;
    }
    if (arg === "--discovery-limit") {
      discoveryLimit = parseBoundedPositiveInteger(
        requireFlagValue(args, index, "--discovery-limit", usage),
        "--discovery-limit",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_LIMIT
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--discovery-limit=")) {
      discoveryLimit = parseBoundedPositiveInteger(
        arg.slice("--discovery-limit=".length),
        "--discovery-limit",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_LIMIT
      );
      continue;
    }
    if (arg === "--max-events") {
      maxEvents = parseBoundedPositiveInteger(
        requireFlagValue(args, index, "--max-events", usage),
        "--max-events",
        usage,
        MAX_TRANSCRIPT_WATCH_MAX_EVENTS
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--max-events=")) {
      maxEvents = parseBoundedPositiveInteger(
        arg.slice("--max-events=".length),
        "--max-events",
        usage,
        MAX_TRANSCRIPT_WATCH_MAX_EVENTS
      );
      continue;
    }
    if (arg === "--timeout-ms") {
      timeoutMs = parseBoundedPositiveInteger(
        requireFlagValue(args, index, "--timeout-ms", usage),
        "--timeout-ms",
        usage,
        MAX_TRANSCRIPT_WATCH_TIMEOUT_MS
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      timeoutMs = parseBoundedPositiveInteger(
        arg.slice("--timeout-ms=".length),
        "--timeout-ms",
        usage,
        MAX_TRANSCRIPT_WATCH_TIMEOUT_MS
      );
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    throw new CliUsageError(`Unknown option: ${arg}. Usage: ${usage}`);
  }

  return {
    roots,
    searchRoots,
    includeCurrent,
    includeArchive,
    discoveryMaxDepth,
    discoveryLimit,
    maxEvents,
    timeoutMs,
    json
  };
}

function resolveTranscriptWatchRoots(
  parsed: ParsedTranscriptWatchCommand,
  cwd: string,
  environ: Record<string, string | undefined>
): string[] {
  const rawRoots: string[] = [];
  if (parsed.includeCurrent) {
    rawRoots.push(resolveTranscriptDir(cwd, environ));
  }
  rawRoots.push(...parsed.roots);

  const seen = new Set<string>();
  const resolvedRoots: string[] = [];
  for (const rawRoot of rawRoots) {
    if (rawRoot.trim().length === 0) {
      throw new CliUsageError("Transcript watch roots must be non-empty strings.");
    }
    const resolved = path.resolve(cwd, rawRoot);
    const key = path.normalize(resolved);
    if (!seen.has(key)) {
      seen.add(key);
      resolvedRoots.push(resolved);
    }
  }
  return resolvedRoots;
}

function resolveTranscriptWatchDiscoveryRoots(parsed: ParsedTranscriptWatchCommand, cwd: string): string[] {
  const seen = new Set<string>();
  const resolvedRoots: string[] = [];
  for (const rawRoot of parsed.searchRoots) {
    if (rawRoot.trim().length === 0) {
      throw new CliUsageError("Transcript watch discovery roots must be non-empty strings.");
    }
    const resolved = path.resolve(cwd, rawRoot);
    const key = path.normalize(resolved);
    if (!seen.has(key)) {
      seen.add(key);
      resolvedRoots.push(resolved);
    }
  }
  return resolvedRoots;
}

function parseIndexWatchRefreshFlags(args: string[]): ParsedIndexWatchRefreshCommand {
  const usage =
    "god-code sessions index watch-refresh [--root <transcript_dir>...] [--search-root <dir>...] [--include-current] [--include-archive] [--max-events <n>] [--timeout-ms <n>] [--debounce-ms <n>] [--refresh-on-timeout] [--discovery-max-depth <n>] [--discovery-limit <n>] [--json]";
  const roots: string[] = [];
  const searchRoots: string[] = [];
  let includeCurrent = false;
  let includeArchive = false;
  let discoveryMaxDepth = DEFAULT_TRANSCRIPT_ROOT_DISCOVERY_MAX_DEPTH;
  let discoveryLimit = DEFAULT_TRANSCRIPT_ROOT_DISCOVERY_LIMIT;
  let maxEvents = DEFAULT_TRANSCRIPT_WATCH_MAX_EVENTS;
  let timeoutMs = DEFAULT_TRANSCRIPT_WATCH_TIMEOUT_MS;
  let debounceMs = DEFAULT_TRANSCRIPT_INDEX_WATCH_REFRESH_DEBOUNCE_MS;
  let refreshOnTimeout = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--root") {
      roots.push(requireFlagValue(args, index, "--root", usage));
      index += 1;
      continue;
    }
    if (arg === "--search-root") {
      searchRoots.push(requireFlagValue(args, index, "--search-root", usage));
      index += 1;
      continue;
    }
    if (arg === "--include-current") {
      includeCurrent = true;
      continue;
    }
    if (arg === "--include-archive") {
      includeArchive = true;
      continue;
    }
    if (arg === "--refresh-on-timeout") {
      refreshOnTimeout = true;
      continue;
    }
    if (arg === "--discovery-max-depth") {
      discoveryMaxDepth = parseBoundedPositiveInteger(
        requireFlagValue(args, index, "--discovery-max-depth", usage),
        "--discovery-max-depth",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_MAX_DEPTH
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--discovery-max-depth=")) {
      discoveryMaxDepth = parseBoundedPositiveInteger(
        arg.slice("--discovery-max-depth=".length),
        "--discovery-max-depth",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_MAX_DEPTH
      );
      continue;
    }
    if (arg === "--discovery-limit") {
      discoveryLimit = parseBoundedPositiveInteger(
        requireFlagValue(args, index, "--discovery-limit", usage),
        "--discovery-limit",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_LIMIT
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--discovery-limit=")) {
      discoveryLimit = parseBoundedPositiveInteger(
        arg.slice("--discovery-limit=".length),
        "--discovery-limit",
        usage,
        MAX_TRANSCRIPT_ROOT_DISCOVERY_LIMIT
      );
      continue;
    }
    if (arg === "--max-events") {
      maxEvents = parseBoundedPositiveInteger(
        requireFlagValue(args, index, "--max-events", usage),
        "--max-events",
        usage,
        MAX_TRANSCRIPT_WATCH_MAX_EVENTS
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--max-events=")) {
      maxEvents = parseBoundedPositiveInteger(
        arg.slice("--max-events=".length),
        "--max-events",
        usage,
        MAX_TRANSCRIPT_WATCH_MAX_EVENTS
      );
      continue;
    }
    if (arg === "--timeout-ms") {
      timeoutMs = parseBoundedPositiveInteger(
        requireFlagValue(args, index, "--timeout-ms", usage),
        "--timeout-ms",
        usage,
        MAX_TRANSCRIPT_WATCH_TIMEOUT_MS
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      timeoutMs = parseBoundedPositiveInteger(
        arg.slice("--timeout-ms=".length),
        "--timeout-ms",
        usage,
        MAX_TRANSCRIPT_WATCH_TIMEOUT_MS
      );
      continue;
    }
    if (arg === "--debounce-ms") {
      debounceMs = parseBoundedPositiveInteger(
        requireFlagValue(args, index, "--debounce-ms", usage),
        "--debounce-ms",
        usage,
        MAX_TRANSCRIPT_INDEX_WATCH_REFRESH_DEBOUNCE_MS
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--debounce-ms=")) {
      debounceMs = parseBoundedPositiveInteger(
        arg.slice("--debounce-ms=".length),
        "--debounce-ms",
        usage,
        MAX_TRANSCRIPT_INDEX_WATCH_REFRESH_DEBOUNCE_MS
      );
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    throw new CliUsageError(`Unknown option: ${arg}. Usage: ${usage}`);
  }

  return {
    roots,
    searchRoots,
    includeCurrent,
    includeArchive,
    discoveryMaxDepth,
    discoveryLimit,
    maxEvents,
    timeoutMs,
    debounceMs,
    refreshOnTimeout,
    json
  };
}

function resolveIndexWatchRefreshRoots(
  parsed: ParsedIndexWatchRefreshCommand,
  cwd: string,
  environ: Record<string, string | undefined>
): string[] {
  return resolveTranscriptWatchRoots(parsed, cwd, environ);
}

function resolveIndexWatchRefreshDiscoveryRoots(parsed: ParsedIndexWatchRefreshCommand, cwd: string): string[] {
  return resolveTranscriptWatchDiscoveryRoots(parsed, cwd);
}

function parseAuditLockCleanupFlags(args: string[]): {
  json: boolean;
  dryRun: boolean;
  expectedOwnerFingerprint?: string;
} {
  const usage = "god-code audit cleanup-lock [--dry-run|--yes --expect-owner <fingerprint>] [--json]";
  return parseOwnerFingerprintCleanupFlags(args, usage);
}

function parseAuditLockQuarantineCleanupFlags(args: string[]): {
  quarantineId: string;
  json: boolean;
  dryRun: boolean;
  expectedOwnerFingerprint?: string;
} {
  const usage = "god-code audit cleanup-lock-quarantine <id> [--dry-run|--yes --expect-owner <fingerprint>] [--json]";
  const [quarantineId, ...flags] = args;
  if (quarantineId === undefined || quarantineId.startsWith("--")) {
    throw new CliUsageError(`Missing quarantine id. Usage: ${usage}`);
  }
  if (!/^[A-Za-z0-9]{6}$/u.test(quarantineId)) {
    throw new CliUsageError(
      `Invalid quarantine id; expected six ASCII alphanumeric characters. Usage: ${usage}`
    );
  }
  return {
    quarantineId,
    ...parseOwnerFingerprintCleanupFlags(flags, usage)
  };
}

function parseAuditLockQuarantineInspectionFlags(args: string[]): {
  quarantineId: string;
  json: boolean;
} {
  const usage = "god-code audit inspect-lock-quarantine <quarantine-id> [--json]";
  const [quarantineId, ...flags] = args;
  if (quarantineId === undefined || quarantineId.startsWith("--")) {
    throw new CliUsageError(`Missing quarantine id. Usage: ${usage}`);
  }
  if (!/^[A-Za-z0-9]{6}$/u.test(quarantineId)) {
    throw new CliUsageError(
      `Invalid quarantine id; expected six ASCII alphanumeric characters. Usage: ${usage}`
    );
  }
  return {
    quarantineId,
    json: parseJsonOnlyFlag(flags, usage)
  };
}

function parseAuditRotationStagingInspectionFlags(args: string[]): {
  stagingId: string;
  json: boolean;
} {
  const usage = "god-code audit inspect-rotation-staging <staging-id> [--json]";
  const [stagingId, ...flags] = args;
  if (stagingId === undefined || stagingId.startsWith("--")) {
    throw new CliUsageError(`Missing staging id. Usage: ${usage}`);
  }
  if (!/^[A-Za-z0-9]{6}$/u.test(stagingId)) {
    throw new CliUsageError(
      `Invalid staging id; expected six ASCII alphanumeric characters. Usage: ${usage}`
    );
  }
  return {
    stagingId,
    json: parseJsonOnlyFlag(flags, usage)
  };
}

function parseAuditRotationRecoveryInspectionFlags(args: string[]): {
  stagingId: string;
  json: boolean;
} {
  const usage = "god-code audit inspect-rotation-recovery <staging-id> [--json]";
  const [stagingId, ...flags] = args;
  if (stagingId === undefined || stagingId.startsWith("--")) {
    throw new CliUsageError(`Missing staging id. Usage: ${usage}`);
  }
  if (!/^[A-Za-z0-9]{6}$/u.test(stagingId)) {
    throw new CliUsageError(
      `Invalid staging id; expected six ASCII alphanumeric characters. Usage: ${usage}`
    );
  }
  return {
    stagingId,
    json: parseJsonOnlyFlag(flags, usage)
  };
}

function parseAuditRotationStagingRecoveryFlags(args: string[]): {
  stagingId: string;
  json: boolean;
  dryRun: boolean;
  expectedAction?:
    | "cleanup_empty_staging"
    | "restore_previous_archive"
    | "rollback_full_rotation";
  expectedRecoveryFingerprint?: string;
} {
  const usage = "god-code audit recover-rotation-staging <staging-id> [--dry-run|--yes --expect-action <action> --expect-recovery <fingerprint>] [--json]";
  const [stagingId, ...flags] = args;
  if (stagingId === undefined || stagingId.startsWith("--")) {
    throw new CliUsageError(`Missing staging id. Usage: ${usage}`);
  }
  if (!/^[A-Za-z0-9]{6}$/u.test(stagingId)) {
    throw new CliUsageError(
      `Invalid staging id; expected six ASCII alphanumeric characters. Usage: ${usage}`
    );
  }

  let json = false;
  let yes = false;
  let explicitDryRun = false;
  let expectedAction:
    | "cleanup_empty_staging"
    | "restore_previous_archive"
    | "rollback_full_rotation"
    | undefined;
  let expectedRecoveryFingerprint: string | undefined;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index]!;
    if (flag === "--json") {
      json = true;
      continue;
    }
    if (flag === "--dry-run") {
      explicitDryRun = true;
      continue;
    }
    if (flag === "--yes") {
      yes = true;
      continue;
    }
    if (flag === "--expect-action") {
      const value = flags[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new CliUsageError(`Missing --expect-action value. Usage: ${usage}`);
      }
      if (expectedAction !== undefined) {
        throw new CliUsageError(`Duplicate --expect-action option. Usage: ${usage}`);
      }
      if (
        value !== "cleanup_empty_staging"
        && value !== "restore_previous_archive"
        && value !== "rollback_full_rotation"
      ) {
        throw new CliUsageError(`Invalid --expect-action value. Usage: ${usage}`);
      }
      expectedAction = value;
      index += 1;
      continue;
    }
    if (flag === "--expect-recovery") {
      const value = flags[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new CliUsageError(`Missing --expect-recovery value. Usage: ${usage}`);
      }
      if (expectedRecoveryFingerprint !== undefined) {
        throw new CliUsageError(`Duplicate --expect-recovery option. Usage: ${usage}`);
      }
      expectedRecoveryFingerprint = value;
      index += 1;
      continue;
    }
    throw new CliUsageError(`Unknown option. Usage: ${usage}`);
  }

  if (explicitDryRun && yes) {
    throw new CliUsageError(
      `--dry-run and --yes are mutually exclusive. Usage: ${usage}`
    );
  }
  if ((expectedAction !== undefined || expectedRecoveryFingerprint !== undefined) && !yes) {
    throw new CliUsageError(
      `--expect-action and --expect-recovery require --yes. Usage: ${usage}`
    );
  }
  if (yes && expectedAction === undefined) {
    throw new CliUsageError(
      `--yes requires --expect-action <action>. Usage: ${usage}`
    );
  }
  if (yes && expectedRecoveryFingerprint === undefined) {
    throw new CliUsageError(
      `--yes requires --expect-recovery <fingerprint>. Usage: ${usage}`
    );
  }
  if (
    expectedRecoveryFingerprint !== undefined
    && !/^[0-9a-f]{32}$/u.test(expectedRecoveryFingerprint)
  ) {
    throw new CliUsageError(
      `Invalid --expect-recovery fingerprint; expected 32 lowercase hexadecimal characters. Usage: ${usage}`
    );
  }
  return {
    stagingId,
    json,
    dryRun: !yes,
    expectedAction,
    expectedRecoveryFingerprint
  };
}

function parseAuditLockDisposalInspectionFlags(args: string[]): {
  quarantineId: string;
  disposalId: string;
  json: boolean;
} {
  const usage = "god-code audit inspect-lock-disposal <quarantine-id> <disposal-id> [--json]";
  const [quarantineId, disposalId, ...flags] = args;
  if (quarantineId === undefined || quarantineId.startsWith("--")) {
    throw new CliUsageError(`Missing quarantine id. Usage: ${usage}`);
  }
  if (!/^[A-Za-z0-9]{6}$/u.test(quarantineId)) {
    throw new CliUsageError(
      `Invalid quarantine id; expected six ASCII alphanumeric characters. Usage: ${usage}`
    );
  }
  if (disposalId === undefined || disposalId.startsWith("--")) {
    throw new CliUsageError(`Missing disposal id. Usage: ${usage}`);
  }
  if (!/^[A-Za-z0-9]{6}$/u.test(disposalId)) {
    throw new CliUsageError(
      `Invalid disposal id; expected six ASCII alphanumeric characters. Usage: ${usage}`
    );
  }
  return {
    quarantineId,
    disposalId,
    json: parseJsonOnlyFlag(flags, usage)
  };
}

function parseAuditLockDisposalCleanupFlags(args: string[]): {
  quarantineId: string;
  disposalId: string;
  json: boolean;
  dryRun: boolean;
  expectedOwnerFingerprint?: string;
} {
  const usage = "god-code audit cleanup-lock-disposal <quarantine-id> <disposal-id> [--dry-run|--yes --expect-owner <fingerprint>] [--json]";
  const [quarantineId, disposalId, ...flags] = args;
  if (quarantineId === undefined || quarantineId.startsWith("--")) {
    throw new CliUsageError(`Missing quarantine id. Usage: ${usage}`);
  }
  if (!/^[A-Za-z0-9]{6}$/u.test(quarantineId)) {
    throw new CliUsageError(
      `Invalid quarantine id; expected six ASCII alphanumeric characters. Usage: ${usage}`
    );
  }
  if (disposalId === undefined || disposalId.startsWith("--")) {
    throw new CliUsageError(`Missing disposal id. Usage: ${usage}`);
  }
  if (!/^[A-Za-z0-9]{6}$/u.test(disposalId)) {
    throw new CliUsageError(
      `Invalid disposal id; expected six ASCII alphanumeric characters. Usage: ${usage}`
    );
  }
  return {
    quarantineId,
    disposalId,
    ...parseOwnerFingerprintCleanupFlags(flags, usage)
  };
}

function parseAuditEmptyLockDisposalCleanupFlags(args: string[]): {
  quarantineId: string;
  disposalId: string;
  json: boolean;
  dryRun: boolean;
  expectedDisposalFingerprint?: string;
} {
  const usage = "god-code audit cleanup-empty-lock-disposal <quarantine-id> <disposal-id> [--dry-run|--yes --expect-disposal <fingerprint>] [--json]";
  const [quarantineId, disposalId, ...flags] = args;
  if (quarantineId === undefined || quarantineId.startsWith("--")) {
    throw new CliUsageError(`Missing quarantine id. Usage: ${usage}`);
  }
  if (!/^[A-Za-z0-9]{6}$/u.test(quarantineId)) {
    throw new CliUsageError(
      `Invalid quarantine id; expected six ASCII alphanumeric characters. Usage: ${usage}`
    );
  }
  if (disposalId === undefined || disposalId.startsWith("--")) {
    throw new CliUsageError(`Missing disposal id. Usage: ${usage}`);
  }
  if (!/^[A-Za-z0-9]{6}$/u.test(disposalId)) {
    throw new CliUsageError(
      `Invalid disposal id; expected six ASCII alphanumeric characters. Usage: ${usage}`
    );
  }

  const parsed = parseDirectoryFingerprintCleanupFlags(
    flags,
    usage,
    "--expect-disposal"
  );
  return {
    quarantineId,
    disposalId,
    json: parsed.json,
    dryRun: parsed.dryRun,
    expectedDisposalFingerprint: parsed.expectedFingerprint
  };
}

function parseAuditEmptyLockQuarantineCleanupFlags(args: string[]): {
  quarantineId: string;
  json: boolean;
  dryRun: boolean;
  expectedQuarantineFingerprint?: string;
} {
  const usage = "god-code audit cleanup-empty-lock-quarantine <quarantine-id> [--dry-run|--yes --expect-quarantine <fingerprint>] [--json]";
  const [quarantineId, ...flags] = args;
  if (quarantineId === undefined || quarantineId.startsWith("--")) {
    throw new CliUsageError(`Missing quarantine id. Usage: ${usage}`);
  }
  if (!/^[A-Za-z0-9]{6}$/u.test(quarantineId)) {
    throw new CliUsageError(
      `Invalid quarantine id; expected six ASCII alphanumeric characters. Usage: ${usage}`
    );
  }
  const parsed = parseDirectoryFingerprintCleanupFlags(
    flags,
    usage,
    "--expect-quarantine"
  );
  return {
    quarantineId,
    json: parsed.json,
    dryRun: parsed.dryRun,
    expectedQuarantineFingerprint: parsed.expectedFingerprint
  };
}

function parseDirectoryFingerprintCleanupFlags(
  args: string[],
  usage: string,
  expectationFlag: "--expect-disposal" | "--expect-quarantine"
): {
  json: boolean;
  dryRun: boolean;
  expectedFingerprint?: string;
} {
  let json = false;
  let yes = false;
  let explicitDryRun = false;
  let expectedFingerprint: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--dry-run") {
      explicitDryRun = true;
      continue;
    }
    if (arg === "--yes") {
      yes = true;
      continue;
    }
    if (arg === expectationFlag) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new CliUsageError(
          `Missing ${expectationFlag} value. Usage: ${usage}`
        );
      }
      if (expectedFingerprint !== undefined) {
        throw new CliUsageError(
          `Duplicate ${expectationFlag} option. Usage: ${usage}`
        );
      }
      expectedFingerprint = value;
      index += 1;
      continue;
    }
    throw new CliUsageError(`Unknown option. Usage: ${usage}`);
  }
  if (explicitDryRun && yes) {
    throw new CliUsageError(
      `--dry-run and --yes are mutually exclusive. Usage: ${usage}`
    );
  }
  if (expectedFingerprint !== undefined && !yes) {
    throw new CliUsageError(`${expectationFlag} requires --yes. Usage: ${usage}`);
  }
  if (yes && expectedFingerprint === undefined) {
    throw new CliUsageError(
      `--yes requires ${expectationFlag} <fingerprint>. Usage: ${usage}`
    );
  }
  if (
    expectedFingerprint !== undefined
    && !/^[0-9a-f]{32}$/u.test(expectedFingerprint)
  ) {
    throw new CliUsageError(
      `Invalid ${expectationFlag} fingerprint; expected 32 lowercase hexadecimal characters. Usage: ${usage}`
    );
  }
  return { json, dryRun: !yes, expectedFingerprint };
}

function parseAuditLockQuarantineRecoveryFlags(args: string[]): {
  quarantineId: string;
  json: boolean;
  dryRun: boolean;
  expectedOwnerFingerprint?: string;
} {
  const usage = "god-code audit recover-lock-quarantine <id> [--dry-run|--yes --expect-owner <fingerprint>] [--json]";
  const [quarantineId, ...flags] = args;
  if (quarantineId === undefined || quarantineId.startsWith("--")) {
    throw new CliUsageError(`Missing quarantine id. Usage: ${usage}`);
  }
  if (!/^[A-Za-z0-9]{6}$/u.test(quarantineId)) {
    throw new CliUsageError(
      `Invalid quarantine id; expected six ASCII alphanumeric characters. Usage: ${usage}`
    );
  }
  return {
    quarantineId,
    ...parseOwnerFingerprintCleanupFlags(flags, usage)
  };
}

function parseOwnerFingerprintCleanupFlags(
  args: string[],
  usage: string
): {
  json: boolean;
  dryRun: boolean;
  expectedOwnerFingerprint?: string;
} {
  let json = false;
  let yes = false;
  let explicitDryRun = false;
  let expectedOwnerFingerprint: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--dry-run") {
      explicitDryRun = true;
      continue;
    }
    if (arg === "--yes") {
      yes = true;
      continue;
    }
    if (arg === "--expect-owner") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new CliUsageError(`Missing --expect-owner value. Usage: ${usage}`);
      }
      if (expectedOwnerFingerprint !== undefined) {
        throw new CliUsageError(`Duplicate --expect-owner option. Usage: ${usage}`);
      }
      expectedOwnerFingerprint = value;
      index += 1;
      continue;
    }
    throw new CliUsageError(`Unknown option. Usage: ${usage}`);
  }

  if (explicitDryRun && yes) {
    throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
  }
  if (expectedOwnerFingerprint !== undefined && !yes) {
    throw new CliUsageError(`--expect-owner requires --yes. Usage: ${usage}`);
  }
  if (yes && expectedOwnerFingerprint === undefined) {
    throw new CliUsageError(`--yes requires --expect-owner <fingerprint>. Usage: ${usage}`);
  }
  if (
    expectedOwnerFingerprint !== undefined
    && !/^[0-9a-f]{32}$/u.test(expectedOwnerFingerprint)
  ) {
    throw new CliUsageError(
      `Invalid --expect-owner fingerprint; expected 32 lowercase hexadecimal characters. Usage: ${usage}`
    );
  }

  return {
    json,
    dryRun: !yes,
    expectedOwnerFingerprint
  };
}

function parseLocalDaemonActionFlags(args: string[], usage: string): {
  json: boolean;
  dryRun: boolean;
  yes: boolean;
} {
  let json = false;
  let dryRun = true;
  let yes = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--dry-run") {
      if (yes) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = true;
      continue;
    }
    if (arg === "--yes") {
      if (args.includes("--dry-run")) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = false;
      yes = true;
      continue;
    }
    throw new CliUsageError(`Unknown option. Usage: ${usage}`);
  }

  return { json, dryRun, yes };
}

function parseLocalModelsListFlags(args: string[]): {
  json: boolean;
  requireConfiguredModel: boolean;
} {
  const usage = "god-code provider local-models list [--require-configured-model] [--json]";
  let json = false;
  let requireConfiguredModel = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--require-configured-model") {
      requireConfiguredModel = true;
      continue;
    }
    throw new CliUsageError(`Unknown option. Usage: ${usage}`);
  }

  return { json, requireConfiguredModel };
}

function parseLocalModelsPullFlags(args: string[]): {
  json: boolean;
  dryRun: boolean;
  yes: boolean;
  model: string;
} {
  const usage = "god-code provider local-models pull <model> [--dry-run|--yes] [--json]";
  let json = false;
  let dryRun = true;
  let yes = false;
  const positionals: string[] = [];

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--dry-run") {
      if (yes) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = true;
      continue;
    }
    if (arg === "--yes") {
      if (args.includes("--dry-run")) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = false;
      yes = true;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new CliUsageError(`Unknown option. Usage: ${usage}`);
    }
    positionals.push(arg);
  }

  if (positionals.length !== 1) {
    throw new CliUsageError(`Usage: ${usage}`);
  }

  return { json, dryRun, yes, model: positionals[0]! };
}

function parseLocalModelsRemoveFlags(args: string[]): {
  json: boolean;
  dryRun: boolean;
  yes: boolean;
  model: string;
} {
  const usage = "god-code provider local-models remove <model> [--dry-run|--yes] [--json]";
  let json = false;
  let dryRun = true;
  let yes = false;
  const positionals: string[] = [];

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--dry-run") {
      if (yes) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = true;
      continue;
    }
    if (arg === "--yes") {
      if (args.includes("--dry-run")) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = false;
      yes = true;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new CliUsageError(`Unknown option. Usage: ${usage}`);
    }
    positionals.push(arg);
  }

  if (positionals.length !== 1) {
    throw new CliUsageError(`Usage: ${usage}`);
  }

  return { json, dryRun, yes, model: positionals[0]! };
}

function parseLocalModelsPruneFlags(args: string[]): {
  json: boolean;
  dryRun: boolean;
  yes: boolean;
  target: string;
} {
  const usage = "god-code provider local-models prune --target <target> [--dry-run|--yes] [--json]";
  let json = false;
  let dryRun = true;
  let yes = false;
  let target: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--dry-run") {
      if (yes) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = true;
      continue;
    }
    if (arg === "--yes") {
      if (args.includes("--dry-run")) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = false;
      yes = true;
      continue;
    }
    if (arg === "--target") {
      const next = args[index + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new CliUsageError(`Usage: ${usage}`);
      }
      if (target !== undefined) {
        throw new CliUsageError(`--target may only be provided once. Usage: ${usage}`);
      }
      target = next;
      index += 1;
      continue;
    }
    if (arg.startsWith("--target=")) {
      const value = arg.slice("--target=".length);
      if (value.length === 0 || target !== undefined) {
        throw new CliUsageError(`Usage: ${usage}`);
      }
      target = value;
      continue;
    }
    throw new CliUsageError(`Unknown option. Usage: ${usage}`);
  }

  if (target === undefined) {
    throw new CliUsageError(`Usage: ${usage}`);
  }

  return { json, dryRun, yes, target };
}

function parseMcpInspectConfigFlags(args: string[]): {
  json: boolean;
  connect: boolean;
  resources: boolean;
  resourceTemplates: boolean;
  prompts: boolean;
} {
  let json = false;
  let connect = false;
  let resources = false;
  let resourceTemplates = false;
  let prompts = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--connect") {
      connect = true;
      continue;
    }
    if (arg === "--resources") {
      resources = true;
      connect = true;
      continue;
    }
    if (arg === "--resource-templates") {
      resourceTemplates = true;
      connect = true;
      continue;
    }
    if (arg === "--prompts") {
      prompts = true;
      connect = true;
      continue;
    }
    throw new CliUsageError("Unknown option. Usage: god-code mcp inspect-config [--connect] [--resources] [--resource-templates] [--prompts] [--json]");
  }

  return { json, connect, resources, resourceTemplates, prompts };
}

function parseMcpReadResourceFlags(args: string[]): { json: boolean; uri: string; serverId?: string } {
  return parseMcpResourceSubscriptionFlags(args, "god-code mcp read-resource <uri> [--server <server_id>] [--json]");
}

function parseMcpResourceSubscriptionFlags(
  args: string[],
  usage: string
): { json: boolean; uri: string; serverId?: string } {
  let json = false;
  let serverId: string | undefined;
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--server") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliUsageError(`Missing --server value. Usage: ${usage}`);
      }
      serverId = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new CliUsageError(`Unknown option. Usage: ${usage}`);
    }
    positionals.push(arg);
  }

  if (positionals.length !== 1) {
    throw new CliUsageError(`Usage: ${usage}`);
  }
  return { json, uri: positionals[0]!, serverId };
}

function parseMcpWaitResourceUpdateFlags(args: string[]): {
  json: boolean;
  uri: string;
  serverId?: string;
  timeoutMs?: number;
} {
  const usage = "god-code mcp wait-resource-update <uri> [--server <server_id>] [--timeout-ms <n>] [--json]";
  let json = false;
  let serverId: string | undefined;
  let timeoutMs: number | undefined;
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--server") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliUsageError(`Missing --server value. Usage: ${usage}`);
      }
      serverId = value;
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new CliUsageError(`Missing --timeout-ms value. Usage: ${usage}`);
      }
      timeoutMs = parsePositiveInteger(value, "--timeout-ms", usage);
      index += 1;
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      timeoutMs = parsePositiveInteger(arg.slice("--timeout-ms=".length), "--timeout-ms", usage);
      continue;
    }
    if (arg.startsWith("--")) {
      throw new CliUsageError(`Unknown option. Usage: ${usage}`);
    }
    positionals.push(arg);
  }

  if (positionals.length !== 1) {
    throw new CliUsageError(`Usage: ${usage}`);
  }
  return { json, uri: positionals[0]!, serverId, timeoutMs };
}

function parseMcpWatchResourceUpdatesFlags(args: string[]): {
  json: boolean;
  uri: string;
  serverId?: string;
  timeoutMs?: number;
  maxEvents?: number;
} {
  const usage = "god-code mcp watch-resource-updates <uri> [--server <server_id>] [--timeout-ms <n>] [--max-events <n>] [--json]";
  let json = false;
  let serverId: string | undefined;
  let timeoutMs: number | undefined;
  let maxEvents: number | undefined;
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--server") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliUsageError(`Missing --server value. Usage: ${usage}`);
      }
      serverId = value;
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new CliUsageError(`Missing --timeout-ms value. Usage: ${usage}`);
      }
      timeoutMs = parsePositiveInteger(value, "--timeout-ms", usage);
      index += 1;
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      timeoutMs = parsePositiveInteger(arg.slice("--timeout-ms=".length), "--timeout-ms", usage);
      continue;
    }
    if (arg === "--max-events") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new CliUsageError(`Missing --max-events value. Usage: ${usage}`);
      }
      maxEvents = parsePositiveInteger(value, "--max-events", usage);
      index += 1;
      continue;
    }
    if (arg.startsWith("--max-events=")) {
      maxEvents = parsePositiveInteger(arg.slice("--max-events=".length), "--max-events", usage);
      continue;
    }
    if (arg.startsWith("--")) {
      throw new CliUsageError(`Unknown option. Usage: ${usage}`);
    }
    positionals.push(arg);
  }

  if (positionals.length !== 1) {
    throw new CliUsageError(`Usage: ${usage}`);
  }
  return { json, uri: positionals[0]!, serverId, timeoutMs, maxEvents };
}

function parseMcpLoopResourceUpdatesFlags(args: string[]): {
  json: boolean;
  uris: string[];
  serverId?: string;
  timeoutMs?: number;
  maxEvents?: number;
} {
  const usage = "god-code mcp loop-resource-updates <uri...> [--server <server_id>] [--timeout-ms <n>] [--max-events <n>] [--json]";
  let json = false;
  let serverId: string | undefined;
  let timeoutMs: number | undefined;
  let maxEvents: number | undefined;
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--server") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliUsageError(`Missing --server value. Usage: ${usage}`);
      }
      serverId = value;
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new CliUsageError(`Missing --timeout-ms value. Usage: ${usage}`);
      }
      timeoutMs = parsePositiveInteger(value, "--timeout-ms", usage);
      index += 1;
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      timeoutMs = parsePositiveInteger(arg.slice("--timeout-ms=".length), "--timeout-ms", usage);
      continue;
    }
    if (arg === "--max-events") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new CliUsageError(`Missing --max-events value. Usage: ${usage}`);
      }
      maxEvents = parsePositiveInteger(value, "--max-events", usage);
      index += 1;
      continue;
    }
    if (arg.startsWith("--max-events=")) {
      maxEvents = parsePositiveInteger(arg.slice("--max-events=".length), "--max-events", usage);
      continue;
    }
    if (arg.startsWith("--")) {
      throw new CliUsageError(`Unknown option. Usage: ${usage}`);
    }
    positionals.push(arg);
  }

  if (positionals.length < 1) {
    throw new CliUsageError(`Usage: ${usage}`);
  }
  return { json, uris: positionals, serverId, timeoutMs, maxEvents };
}

function parseMcpGetPromptFlags(args: string[]): {
  json: boolean;
  name: string;
  arguments?: Record<string, string>;
  serverId?: string;
} {
  let json = false;
  let serverId: string | undefined;
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--server") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliUsageError("Missing --server value. Usage: god-code mcp get-prompt <name> [arguments_json] [--server <server_id>] [--json]");
      }
      serverId = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new CliUsageError("Unknown option. Usage: god-code mcp get-prompt <name> [arguments_json] [--server <server_id>] [--json]");
    }
    positionals.push(arg);
  }

  if (positionals.length < 1 || positionals.length > 2) {
    throw new CliUsageError("Usage: god-code mcp get-prompt <name> [arguments_json] [--server <server_id>] [--json]");
  }

  return {
    json,
    name: positionals[0]!,
    arguments: positionals[1] ? parseMcpPromptArguments(positionals[1]!) : undefined,
    serverId
  };
}

function parseMcpCompletionFlags(args: string[], usage: string): {
  output: McpCompletionOutputFormat;
  ref: string;
  argument: { name: string; value: string };
  context?: Record<string, string>;
  serverId?: string;
} {
  let output: McpCompletionOutputFormat = "text";
  let serverId: string | undefined;
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--json") {
      output = parseMcpCompletionOutputFlag(output, "json", usage);
      continue;
    }
    if (arg === "--values-only") {
      output = parseMcpCompletionOutputFlag(output, "values", usage);
      continue;
    }
    if (arg === "--jsonl") {
      output = parseMcpCompletionOutputFlag(output, "jsonl", usage);
      continue;
    }
    if (arg === "--server") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliUsageError(`Missing --server value. Usage: ${usage}`);
      }
      serverId = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new CliUsageError(`Unknown option. Usage: ${usage}`);
    }
    positionals.push(arg);
  }

  if (positionals.length < 3 || positionals.length > 4) {
    throw new CliUsageError(`Usage: ${usage}`);
  }

  return {
    output,
    ref: positionals[0]!,
    argument: {
      name: positionals[1]!,
      value: positionals[2]!
    },
    context: positionals[3] ? parseMcpPromptArguments(positionals[3]!) : undefined,
    serverId
  };
}

function parseMcpCompletionOutputFlag(
  current: McpCompletionOutputFormat,
  next: McpCompletionOutputFormat,
  usage: string
): McpCompletionOutputFormat {
  if (current !== "text") {
    throw new CliUsageError(`Completion output flags are mutually exclusive. Usage: ${usage}`);
  }
  return next;
}

function parseMcpCompletionScriptFlags(args: string[]): {
  shell: McpCompletionScriptShell;
  programName: string;
} {
  const usage = "god-code mcp completion-script <bash|zsh> [--program <command>]";
  let programName = "god-code";
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--program") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliUsageError(`Missing --program value. Usage: ${usage}`);
      }
      programName = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new CliUsageError(`Unknown option. Usage: ${usage}`);
    }
    positionals.push(arg);
  }

  if (positionals.length !== 1) {
    throw new CliUsageError(`Usage: ${usage}`);
  }
  const shell = positionals[0]!;
  if (shell !== "bash" && shell !== "zsh") {
    throw new CliUsageError(`Unsupported shell ${shell}. Usage: ${usage}`);
  }
  if (programName.trim().length === 0 || /[\r\n\0]/u.test(programName)) {
    throw new CliUsageError(`Invalid --program value. Usage: ${usage}`);
  }

  return {
    shell,
    programName
  };
}

function parseMcpCompletionInstallFlags(args: string[]): {
  shell: McpCompletionScriptShell;
  programName: string;
  rcFile?: string;
  dryRun: boolean;
  json: boolean;
} {
  const usage = "god-code mcp completion-install <bash|zsh> [--program <command>] [--rc-file <path>] [--dry-run|--yes] [--json]";
  let programName = "god-code";
  let rcFile: string | undefined;
  let dryRun = true;
  let writeConfirmed = false;
  let json = false;
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--dry-run") {
      if (writeConfirmed) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = true;
      continue;
    }
    if (arg === "--yes") {
      if (dryRun === true && args.slice(0, index).includes("--dry-run")) {
        throw new CliUsageError(`--dry-run and --yes are mutually exclusive. Usage: ${usage}`);
      }
      dryRun = false;
      writeConfirmed = true;
      continue;
    }
    if (arg === "--program") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliUsageError(`Missing --program value. Usage: ${usage}`);
      }
      programName = value;
      index += 1;
      continue;
    }
    if (arg === "--rc-file") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliUsageError(`Missing --rc-file value. Usage: ${usage}`);
      }
      rcFile = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new CliUsageError(`Unknown option. Usage: ${usage}`);
    }
    positionals.push(arg);
  }

  if (positionals.length !== 1) {
    throw new CliUsageError(`Usage: ${usage}`);
  }
  const shell = positionals[0]!;
  if (shell !== "bash" && shell !== "zsh") {
    throw new CliUsageError(`Unsupported shell ${shell}. Usage: ${usage}`);
  }
  if (programName.trim().length === 0 || /[\r\n\0]/u.test(programName)) {
    throw new CliUsageError(`Invalid --program value. Usage: ${usage}`);
  }
  if (rcFile && /[\r\n\0]/u.test(rcFile)) {
    throw new CliUsageError(`Invalid --rc-file value. Usage: ${usage}`);
  }

  return {
    shell,
    programName,
    rcFile,
    dryRun,
    json
  };
}

function parseMcpPromptArguments(value: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new CliUsageError(`Prompt arguments must be valid JSON object: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isJsonObject(parsed)) {
    throw new CliUsageError("Prompt arguments must be a JSON object with string values");
  }
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(parsed)) {
    if (typeof item !== "string") {
      throw new CliUsageError(`Prompt argument ${key} must be a string`);
    }
    result[key] = item;
  }
  return result;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDeleteSessionFlags(args: string[]): { json: boolean; yes: boolean } {
  let json = false;
  let yes = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--yes") {
      yes = true;
      continue;
    }
    throw new CliUsageError("Unknown option. Usage: god-code sessions delete <session_id> --yes [--json]");
  }

  return { json, yes };
}

function parseCleanupSessionFlags(args: string[]): ParsedCleanupCommand {
  let olderThanDays: number | undefined;
  let action: TranscriptCleanupAction = "dry-run";
  let json = false;
  let yes = false;
  const usage = "god-code sessions cleanup --older-than-days <n> [--archive|--delete] [--yes] [--json]";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--older-than-days") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new CliUsageError(`Missing value for --older-than-days. Usage: ${usage}`);
      }
      olderThanDays = parsePositiveInteger(value, "--older-than-days", usage);
      index += 1;
      continue;
    }
    if (arg.startsWith("--older-than-days=")) {
      olderThanDays = parsePositiveInteger(arg.slice("--older-than-days=".length), "--older-than-days", usage);
      continue;
    }
    if (arg === "--archive") {
      if (action !== "dry-run") {
        throw new CliUsageError(`--archive and --delete are mutually exclusive. Usage: ${usage}`);
      }
      action = "archive";
      continue;
    }
    if (arg === "--delete") {
      if (action !== "dry-run") {
        throw new CliUsageError(`--archive and --delete are mutually exclusive. Usage: ${usage}`);
      }
      action = "delete";
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--yes") {
      yes = true;
      continue;
    }
    throw new CliUsageError(`Unknown option. Usage: ${usage}`);
  }

  if (olderThanDays === undefined) {
    throw new CliUsageError(`Missing --older-than-days. Usage: ${usage}`);
  }

  return {
    olderThanDays,
    action,
    json,
    yes
  };
}

function parseArchiveRestoreFlags(args: string[]): { json: boolean; yes: boolean } {
  let json = false;
  let yes = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--yes") {
      yes = true;
      continue;
    }
    throw new CliUsageError("Unknown option. Usage: god-code sessions archive restore <session_id> --yes [--json]");
  }

  return { json, yes };
}

function parseArchiveDeleteFlags(args: string[]): { json: boolean; yes: boolean } {
  let json = false;
  let yes = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--yes") {
      yes = true;
      continue;
    }
    throw new CliUsageError("Unknown option. Usage: god-code sessions archive delete <session_id> --yes [--json]");
  }

  return { json, yes };
}

function parseArchiveCompressFlags(args: string[]): { json: boolean; yes: boolean } {
  let json = false;
  let yes = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--yes") {
      yes = true;
      continue;
    }
    throw new CliUsageError("Unknown option. Usage: god-code sessions archive compress <session_id> --yes [--json]");
  }

  return { json, yes };
}

function parseIndexBuildFlags(args: string[]): { json: boolean; includeArchive: boolean } {
  let json = false;
  let includeArchive = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--include-archive") {
      includeArchive = true;
      continue;
    }
    throw new CliUsageError("Unknown option. Usage: god-code sessions index build [--include-archive] [--json]");
  }

  return { json, includeArchive };
}

function parseIndexRefreshFlags(args: string[]): { json: boolean; includeArchive: boolean } {
  let json = false;
  let includeArchive = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--include-archive") {
      includeArchive = true;
      continue;
    }
    throw new CliUsageError("Unknown option. Usage: god-code sessions index refresh [--include-archive] [--json]");
  }

  return { json, includeArchive };
}

function parseIndexSearchFlags(args: string[]): {
  json: boolean;
  refresh: boolean;
  includeArchive: boolean;
} {
  let json = false;
  let refresh = false;
  let includeArchive = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--refresh") {
      refresh = true;
      continue;
    }
    if (arg === "--include-archive") {
      includeArchive = true;
      continue;
    }
    throw new CliUsageError("Unknown option. Usage: god-code sessions index search <query> [--refresh] [--include-archive] [--json]");
  }

  return { json, refresh, includeArchive };
}

function parsePositiveInteger(value: string, flagName: string, usage: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliUsageError(`Expected positive integer for ${flagName}. Usage: ${usage}`);
  }
  return parsed;
}

function parseBoundedPositiveInteger(
  value: string,
  flagName: string,
  usage: string,
  maxValue: number
): number {
  const parsed = parsePositiveInteger(value, flagName, usage);
  if (parsed > maxValue) {
    throw new CliUsageError(`Expected ${flagName} to be at most ${maxValue}. Usage: ${usage}`);
  }
  return parsed;
}

function printUsage(): void {
  console.log("Usage:");
  console.log("  god-code run <prompt>");
  console.log("  god-code run --approval-mode prompt <prompt>");
  console.log("  god-code run --json <prompt>");
  console.log("  god-code run --json --raw-events <prompt>");
  console.log("  god-code repl [--approval-mode <never|prompt>]");
  console.log("  god-code tui [--transcript-dir <dir>] [--model-adapter <name>] [--approval-mode <never|prompt>] [--no-stream]");
  console.log("  god-code sessions list");
  console.log("  god-code sessions replay <session_id>");
  console.log("  god-code sessions replay <session_id> --json");
  console.log("  god-code sessions timeline <session_id>");
  console.log("  god-code sessions timeline <session_id> --json");
  console.log("  god-code sessions timeline <session_id> --no-preview");
  console.log("  god-code sessions timeline <session_id> --preview-chars 120");
  console.log("  god-code sessions resume <session_id> <prompt>");
  console.log("  god-code sessions resume <session_id> --json <prompt>");
  console.log("  god-code sessions resume <session_id> --json --raw-events <prompt>");
  console.log("  god-code sessions recover <session_id> --dry-run");
  console.log("  god-code sessions recover <session_id> --json --dry-run");
  console.log("  god-code sessions recover <session_id> --json <prompt>");
  console.log("  god-code sessions search <query>");
  console.log("  god-code sessions search <query> --json");
  console.log("  god-code sessions global-search <query> --root <transcript_dir>");
  console.log("  god-code sessions global-search <query> --search-root <dir> --json");
  console.log("  god-code sessions global-search <query> --include-current --include-archive --json");
  console.log("  god-code sessions roots --search-root <dir>");
  console.log("  god-code sessions roots --include-current --json");
  console.log("  god-code sessions watch --include-current --json");
  console.log("  god-code sessions watch --root <transcript_dir> --max-events 5 --timeout-ms 10000");
  console.log("  god-code sessions cleanup --older-than-days <n>");
  console.log("  god-code sessions cleanup --older-than-days <n> --json");
  console.log("  god-code sessions cleanup --older-than-days <n> --archive --yes");
  console.log("  god-code sessions cleanup --older-than-days <n> --delete --yes");
  console.log("  god-code sessions index build");
  console.log("  god-code sessions index build --include-archive --json");
  console.log("  god-code sessions index refresh");
  console.log("  god-code sessions index refresh --include-archive --json");
  console.log("  god-code sessions index watch-refresh --include-current --refresh-on-timeout --json");
  console.log("  god-code sessions index search <query>");
  console.log("  god-code sessions index search <query> --refresh --include-archive");
  console.log("  god-code sessions index search <query> --json");
  console.log("  god-code sessions archive list");
  console.log("  god-code sessions archive list --json");
  console.log("  god-code sessions archive replay <session_id>");
  console.log("  god-code sessions archive replay <session_id> --json");
  console.log("  god-code sessions archive timeline <session_id>");
  console.log("  god-code sessions archive timeline <session_id> --json");
  console.log("  god-code sessions archive search <query>");
  console.log("  god-code sessions archive search <query> --json");
  console.log("  god-code sessions archive restore <session_id> --yes");
  console.log("  god-code sessions archive restore <session_id> --yes --json");
  console.log("  god-code sessions archive compress <session_id> --yes");
  console.log("  god-code sessions archive compress <session_id> --yes --json");
  console.log("  god-code sessions archive delete <session_id> --yes");
  console.log("  god-code sessions archive delete <session_id> --yes --json");
  console.log("  god-code sessions delete <session_id> --yes");
  console.log("  god-code sessions delete <session_id> --json --yes");
  console.log("  god-code tools list");
  console.log("  god-code tools list --json");
  console.log("  god-code tools inspect <tool_name>");
  console.log("  god-code tools inspect <tool_name> --json");
  console.log("  god-code doctor");
  console.log("  god-code doctor --json");
  console.log("  god-code doctor provider-health");
  console.log("  god-code doctor provider-health --json");
  console.log("  god-code audit inspect-config");
  console.log("  god-code audit inspect-config --json");
  console.log("  god-code audit inspect-path");
  console.log("  god-code audit inspect-path --json");
  console.log("  god-code audit inspect-rotation-stagings");
  console.log("  god-code audit inspect-rotation-stagings --json");
  console.log("  god-code audit inspect-rotation-staging <staging-id>");
  console.log("  god-code audit inspect-rotation-staging <staging-id> --json");
  console.log("  god-code audit inspect-rotation-recovery <staging-id>");
  console.log("  god-code audit inspect-rotation-recovery <staging-id> --json");
  console.log("  god-code audit recover-rotation-staging <staging-id> --dry-run --json");
  console.log("  god-code audit recover-rotation-staging <staging-id> --yes --expect-action <action> --expect-recovery <fingerprint> --json");
  console.log("  god-code audit inspect-lock-quarantines");
  console.log("  god-code audit inspect-lock-quarantines --json");
  console.log("  god-code audit inspect-lock-quarantine <quarantine-id>");
  console.log("  god-code audit inspect-lock-quarantine <quarantine-id> --json");
  console.log("  god-code audit inspect-lock-disposals");
  console.log("  god-code audit inspect-lock-disposals --json");
  console.log("  god-code audit inspect-lock-disposal <quarantine-id> <disposal-id>");
  console.log("  god-code audit inspect-lock-disposal <quarantine-id> <disposal-id> --json");
  console.log("  god-code audit cleanup-lock-disposal <quarantine-id> <disposal-id> --dry-run --json");
  console.log("  god-code audit cleanup-lock-disposal <quarantine-id> <disposal-id> --yes --expect-owner <fingerprint> --json");
  console.log("  god-code audit cleanup-empty-lock-disposal <quarantine-id> <disposal-id> --dry-run --json");
  console.log("  god-code audit cleanup-empty-lock-disposal <quarantine-id> <disposal-id> --yes --expect-disposal <fingerprint> --json");
  console.log("  god-code audit cleanup-lock --dry-run --json");
  console.log("  god-code audit cleanup-lock --yes --expect-owner <fingerprint> --json");
  console.log("  god-code audit cleanup-lock-quarantine <id> --dry-run --json");
  console.log("  god-code audit cleanup-lock-quarantine <id> --yes --expect-owner <fingerprint> --json");
  console.log("  god-code audit cleanup-empty-lock-quarantine <quarantine-id> --dry-run --json");
  console.log("  god-code audit cleanup-empty-lock-quarantine <quarantine-id> --yes --expect-quarantine <fingerprint> --json");
  console.log("  god-code audit recover-lock-quarantine <id> --dry-run --json");
  console.log("  god-code audit recover-lock-quarantine <id> --yes --expect-owner <fingerprint> --json");
  console.log("  god-code mcp inspect-config");
  console.log("  god-code mcp inspect-config --json");
  console.log("  god-code mcp inspect-config --connect");
  console.log("  god-code mcp inspect-config --connect --json");
  console.log("  god-code mcp inspect-config --connect --resources --resource-templates --prompts --json");
  console.log("  god-code mcp inspect-context --json");
  console.log("  god-code mcp read-resource <uri>");
  console.log("  god-code mcp read-resource <uri> --server <server_id> --json");
  console.log("  god-code mcp get-prompt <name> [arguments_json]");
  console.log("  god-code mcp get-prompt <name> [arguments_json] --server <server_id> --json");
  console.log("  god-code mcp subscribe-resource <uri> --json");
  console.log("  god-code mcp unsubscribe-resource <uri> --json");
  console.log("  god-code mcp wait-resource-update <uri> --timeout-ms <n> --json");
  console.log("  god-code mcp watch-resource-updates <uri> --max-events <n> --timeout-ms <n> --json");
  console.log("  god-code mcp loop-resource-updates <uri...> --max-events <n> --timeout-ms <n> --json");
  console.log("  god-code mcp complete-prompt <name> <argument_name> <argument_value> [context_json] --json");
  console.log("  god-code mcp complete-prompt <name> <argument_name> <argument_value> [context_json] --values-only");
  console.log("  god-code mcp complete-prompt <name> <argument_name> <argument_value> [context_json] --jsonl");
  console.log("  god-code mcp complete-resource-template <uri_template> <argument_name> <argument_value> [context_json] --json");
  console.log("  god-code mcp complete-resource-template <uri_template> <argument_name> <argument_value> [context_json] --values-only");
  console.log("  god-code mcp complete-resource-template <uri_template> <argument_name> <argument_value> [context_json] --jsonl");
  console.log("  god-code mcp completion-script <bash|zsh> [--program <command>]");
  console.log("  god-code mcp completion-install <bash|zsh> [--program <command>] [--rc-file <path>] [--dry-run|--yes] [--json]");
  console.log("  god-code plugins validate <manifest_or_dir>");
  console.log("  god-code plugins validate <manifest_or_dir> --json");
  console.log("  god-code plugins inspect-config");
  console.log("  god-code plugins inspect-config --json");
  console.log("  god-code plugins list");
  console.log("  god-code plugins list --json");
  console.log("  god-code plugins inspect <plugin_id>");
  console.log("  god-code plugins inspect <plugin_id> --json");
  console.log("  god-code plugins install <plugin_or_skill_dir> --registry-file <path> --dry-run");
  console.log("  god-code plugins install <plugin_or_skill_dir> --registry-file <path> --yes --json");
  console.log("  god-code plugins uninstall <plugin_id> --registry-file <path> --dry-run");
  console.log("  god-code plugins uninstall <plugin_id> --registry-file <path> --yes --json");
  console.log("  god-code plugins disable <plugin_id> --registry-file <path> --dry-run");
  console.log("  god-code plugins disable <plugin_id> --registry-file <path> --yes --json");
  console.log("  god-code plugins enable <plugin_id> --registry-file <path> --dry-run");
  console.log("  god-code plugins enable <plugin_id> --registry-file <path> --yes --json");
  console.log("  god-code plugins tags <plugin_id> --registry-file <path> --add <tag> --dry-run");
  console.log("  god-code plugins tags <plugin_id> --registry-file <path> --remove <tag> --yes --json");
  console.log("  god-code plugins tags <plugin_id> --registry-file <path> --set <tag1,tag2> --yes --json");
  console.log("  god-code plugins schema");
  console.log("  god-code plugins schema --json");
  console.log("  god-code provider inspect-config");
  console.log("  god-code provider inspect-config --json");
  console.log("  god-code provider contract-test");
  console.log("  god-code provider contract-test --json");
  console.log("  god-code provider local-daemon status");
  console.log("  god-code provider local-daemon status --json");
  console.log("  god-code provider local-daemon start --dry-run --json");
  console.log("  god-code provider local-daemon start --yes --json");
  console.log("  god-code provider local-daemon stop --dry-run --json");
  console.log("  god-code provider local-daemon stop --yes --json");
  console.log("  god-code provider local-models list");
  console.log("  god-code provider local-models list --json");
  console.log("  god-code provider local-models list --require-configured-model --json");
  console.log("  god-code provider local-models pull <model> --dry-run --json");
  console.log("  god-code provider local-models pull <model> --yes --json");
  console.log("  god-code provider local-models remove <model> --dry-run --json");
  console.log("  god-code provider local-models remove <model> --yes --json");
  console.log("  god-code provider local-models prune --target <target> --dry-run --json");
  console.log("  god-code provider local-models prune --target <target> --yes --json");
  console.log("  god-code rpc-smoke");
}

function printTuiUsage(): void {
  console.log("Usage:");
  console.log("  god-code tui");
  console.log("  god-code tui --transcript-dir <dir>");
  console.log("  god-code tui --model-adapter <name>");
  console.log("  god-code tui --approval-mode <never|prompt>");
  console.log("  god-code tui --no-stream");
  console.log("");
  console.log("TUI requires an interactive terminal and does not support --json.");
}

class CliUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = error instanceof CliUsageError ? 2 : 1;
});
