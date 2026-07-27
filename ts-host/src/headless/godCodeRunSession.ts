import { randomUUID } from "node:crypto";
import { GodCodeEngineProcess } from "../ipc/godCodeEngineProcess.js";
import type { TurnRenderer } from "../rendering/terminalRenderer.js";
import type { ToolApprovalMode, ToolApprovalPrompt } from "../policy/approval.js";
import {
  buildTranscriptRecoveryPlan,
  buildTranscriptResumeMessages,
  readTranscriptEntriesForSession,
  resolveTranscriptDir,
  transcriptEnvForCwd,
  type TranscriptRecoveryOptions,
  type TranscriptRecoveryStrategy,
  type TranscriptRecoveryWarning
} from "../transcripts/history.js";
import type { GodCodeEventEnvelope, ModelHistoryMessage, TurnResult } from "../types/godCodeProtocol.js";
import {
  buildGodCodeCreateSessionRequest,
  buildGodCodeInitializeRequest,
  type PreparedGodCodeHost,
  prepareGodCodeHost
} from "./godCodeHostSetup.js";

export interface GodCodeRunSessionOptions {
  renderer?: TurnRenderer;
  stream?: boolean;
  transcriptDir?: string;
  onEvent?: (event: GodCodeEventEnvelope) => void;
  approvalMode?: ToolApprovalMode;
  approvalPrompt?: ToolApprovalPrompt;
}

export type GodCodeResumedSessionResult = TurnResult & {
  resumed_from_session_id: string;
  restored_message_count: number;
};

export type GodCodeRecoveredSessionResult = TurnResult & {
  recovered_from_session_id: string;
  recovery_strategy: TranscriptRecoveryStrategy;
  restored_message_count: number;
  skipped_entry_count: number;
  recovery_warnings: TranscriptRecoveryWarning[];
};

export async function runGodCodeSession(
  prompt: string,
  cwd: string,
  options: GodCodeRunSessionOptions = {}
): Promise<TurnResult> {
  return await runGodCodeTurn(prompt, cwd, options, {
    sessionId: randomUUID()
  });
}

export async function runGodCodeResumedSession(
  resumeSessionId: string,
  prompt: string,
  cwd: string,
  options: GodCodeRunSessionOptions = {}
): Promise<GodCodeResumedSessionResult> {
  const transcriptDir = options.transcriptDir ?? resolveTranscriptDir(cwd);
  const entries = await readTranscriptEntriesForSession(transcriptDir, resumeSessionId);
  const initialMessages = buildTranscriptResumeMessages(entries);
  if (initialMessages.length === 0) {
    throw new Error(`Transcript session cannot be resumed because it has no replayable messages: ${resumeSessionId}`);
  }

  const result = await runGodCodeTurn(prompt, cwd, { ...options, transcriptDir }, {
    sessionId: randomUUID(),
    initialMessages
  });

  return {
    ...result,
    resumed_from_session_id: resumeSessionId,
    restored_message_count: initialMessages.length
  };
}

export async function runGodCodeRecoveredSession(
  recoverSessionId: string,
  prompt: string,
  cwd: string,
  recoveryOptions: TranscriptRecoveryOptions = {},
  options: GodCodeRunSessionOptions = {}
): Promise<GodCodeRecoveredSessionResult> {
  const transcriptDir = options.transcriptDir ?? resolveTranscriptDir(cwd);
  const plan = await buildTranscriptRecoveryPlan(transcriptDir, recoverSessionId, recoveryOptions);
  if (!plan.recoverable || plan.initialMessages.length === 0) {
    throw new Error(`Transcript session cannot be recovered: ${recoverSessionId}`);
  }

  const result = await runGodCodeTurn(prompt, cwd, { ...options, transcriptDir }, {
    sessionId: randomUUID(),
    initialMessages: plan.initialMessages
  });

  return {
    ...result,
    recovered_from_session_id: recoverSessionId,
    recovery_strategy: plan.strategy,
    restored_message_count: plan.restoredMessageCount,
    skipped_entry_count: plan.skippedEntryCount,
    recovery_warnings: plan.warnings
  };
}

interface GodCodeTurnSeed {
  sessionId: string;
  initialMessages?: ModelHistoryMessage[];
}

async function runGodCodeTurn(
  prompt: string,
  cwd: string,
  options: GodCodeRunSessionOptions,
  seed: GodCodeTurnSeed
): Promise<TurnResult> {
  const defaultTranscriptEnv = transcriptEnvForCwd(cwd);
  const engine = new GodCodeEngineProcess({
    env: {
      ...defaultTranscriptEnv,
      GOD_CODE_TRANSCRIPT_DIR: options.transcriptDir ?? defaultTranscriptEnv.GOD_CODE_TRANSCRIPT_DIR
    }
  });
  const host = await prepareGodCodeHost({
    approvalMode: options.approvalMode,
    approvalPrompt: options.approvalPrompt
  });

  let finalResultResolver: ((value: TurnResult) => void) | undefined;
  let finalResultRejecter: ((reason?: unknown) => void) | undefined;
  let expectedTurnId: string | undefined;

  const finalResult = new Promise<TurnResult>((resolve, reject) => {
    finalResultResolver = resolve;
    finalResultRejecter = reject;
  });

  const onGodCodeEvent = (event: GodCodeEventEnvelope) => {
    if (expectedTurnId && event.turn_id !== expectedTurnId) {
      return;
    }

    options.onEvent?.(event);

    if (event.event_type === "assistant_delta") {
      options.renderer?.onAssistantDelta(event.payload.delta.text);
      return;
    }

    if (event.event_type === "assistant_message") {
      options.renderer?.onAssistantMessage(event.payload.message);
      return;
    }

    if (event.event_type === "tool_call_requested") {
      options.renderer?.onToolCallRequested();
      return;
    }

    if (event.event_type !== "turn_finished") {
      return;
    }
    finalResultResolver?.(event.payload);
  };

  const onExit = (error: unknown) => {
    finalResultRejecter?.(error);
  };

  let operationFailed = false;
  try {
    engine.setToolExecutor(async (request, abortSignal) => {
      return await host.registry.executeRequest(request, { cwd, abortSignal });
    });
    engine.on("god_code_event", onGodCodeEvent);
    engine.once("exit", onExit);
    await engine.start();
    await engine.initialize(buildGodCodeInitializeRequest());
    const initialMessages = [...host.initialMessages, ...(seed.initialMessages ?? [])];
    await engine.createSession(
      buildGodCodeCreateSessionRequest(
        seed.sessionId,
        cwd,
        host.toolCatalog,
        "fake",
        initialMessages
      )
    );
    const submitResponse = await engine.submitTurn({
      session_id: seed.sessionId,
      prompt: {
        role: "user",
        content: prompt
      },
      turn_options: options.stream ? { stream: true } : {}
    });
    expectedTurnId = submitResponse.turn_id;
    return await finalResult;
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    engine.off("god_code_event", onGodCodeEvent);
    engine.off("exit", onExit);
    const finalization = await finalizeGodCodeHeadlessResources(
      engine,
      host,
      options.renderer
    );
    if (!operationFailed && !finalization.ok) {
      throw finalization.reason;
    }
  }
}

export async function runGodCodeRpcSmoke(cwd: string): Promise<void> {
  const engine = new GodCodeEngineProcess();
  const host = await prepareGodCodeHost();
  let operationFailed = false;
  try {
    await engine.start();
    await engine.initialize(buildGodCodeInitializeRequest());
    await engine.createSession(
      buildGodCodeCreateSessionRequest(randomUUID(), cwd, host.toolCatalog, "fake", host.initialMessages)
    );
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    const finalization = await finalizeGodCodeHeadlessResources(engine, host);
    if (!operationFailed && !finalization.ok) {
      throw finalization.reason;
    }
  }
}

type GodCodeHeadlessFinalizationOutcome =
  | { ok: true }
  | { ok: false; reason: unknown };

async function finalizeGodCodeHeadlessResources(
  engine: GodCodeEngineProcess,
  host: PreparedGodCodeHost,
  renderer?: TurnRenderer
): Promise<GodCodeHeadlessFinalizationOutcome> {
  const engineStop = invokeGodCodeHeadlessFinalizer(() => engine.stop());
  const hostClose = invokeGodCodeHeadlessFinalizer(() => host.close());
  const rendererFinish = invokeGodCodeHeadlessFinalizer(() => renderer?.finish());
  const settlements = await Promise.allSettled([
    rendererFinish,
    hostClose,
    engineStop
  ]);
  for (const settlement of settlements) {
    if (settlement.status === "rejected") {
      return { ok: false, reason: settlement.reason };
    }
  }
  return { ok: true };
}

function invokeGodCodeHeadlessFinalizer(action: () => unknown): Promise<void> {
  return Promise.resolve()
    .then(action)
    .then(() => undefined);
}
