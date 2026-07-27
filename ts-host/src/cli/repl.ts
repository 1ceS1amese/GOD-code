import { randomUUID } from "node:crypto";
import readline from "node:readline";
import type { Readable } from "node:stream";
import { GodCodeEngineProcess, type GodCodeEngineExitInfo } from "../ipc/godCodeEngineProcess.js";
import type { ToolApprovalMode, ToolApprovalPrompt } from "../policy/approval.js";
import { TerminalRenderer, type RenderOutput, type TurnRenderer } from "../rendering/terminalRenderer.js";
import { transcriptEnvForCwd } from "../transcripts/history.js";
import type { GodCodeEventEnvelope, ToolCatalogEntry, TurnResult } from "../types/godCodeProtocol.js";
import {
  buildGodCodeCreateSessionRequest,
  buildGodCodeInitializeRequest,
  type PreparedGodCodeHost,
  prepareGodCodeHost
} from "../headless/godCodeHostSetup.js";

export type ReplStatus = "idle" | "running" | "stopped";

interface ActiveTurn {
  turnId?: string;
  resolve(value: TurnResult): void;
  reject(reason?: unknown): void;
}

type ReplCleanupOutcome =
  | { ok: true }
  | { ok: false; reason: unknown };

const REPL_ACTIVE_TURN_STOP_REASON =
  "GOD-code REPL session stopped during an active turn.";

export interface GodCodeReplSessionOptions {
  renderer?: TurnRenderer;
  stream?: boolean;
  modelAdapter?: string;
  transcriptDir?: string;
  approvalMode?: ToolApprovalMode;
  approvalPrompt?: ToolApprovalPrompt;
  onEvent?: (event: GodCodeEventEnvelope) => void;
}

export interface GodCodeReplRunOptions extends GodCodeReplSessionOptions {
  input?: Readable;
  output?: RenderOutput;
}

export class GodCodeReplSession {
  private readonly sessionId = randomUUID();
  private readonly renderer?: TurnRenderer;
  private readonly stream: boolean;
  private readonly modelAdapter: string;
  private readonly transcriptDir?: string;
  private readonly approvalMode?: ToolApprovalMode;
  private readonly approvalPrompt?: ToolApprovalPrompt;
  private readonly onEvent?: (event: GodCodeEventEnvelope) => void;
  private readonly engine: GodCodeEngineProcess;
  private host?: PreparedGodCodeHost;
  private status: ReplStatus = "stopped";
  private activeTurn?: ActiveTurn;
  private started = false;
  private startSettlement?: Promise<void>;
  private stopSettlement?: Promise<void>;
  private cleanupSettlement?: Promise<ReplCleanupOutcome>;

  public constructor(private readonly cwd: string, options: GodCodeReplSessionOptions = {}) {
    this.renderer = options.renderer;
    this.stream = options.stream ?? true;
    this.modelAdapter = options.modelAdapter ?? "fake";
    this.transcriptDir = options.transcriptDir;
    this.approvalMode = options.approvalMode;
    this.approvalPrompt = options.approvalPrompt;
    this.onEvent = options.onEvent;
    const defaultTranscriptEnv = transcriptEnvForCwd(cwd);
    this.engine = new GodCodeEngineProcess({
      env: {
        ...defaultTranscriptEnv,
        GOD_CODE_TRANSCRIPT_DIR: this.transcriptDir ?? defaultTranscriptEnv.GOD_CODE_TRANSCRIPT_DIR
      }
    });
  }

  public start(): Promise<void> {
    if (this.startSettlement) {
      return this.startSettlement;
    }
    if (this.started) {
      return Promise.resolve();
    }

    const previousStopSettlement = this.stopSettlement;
    this.stopSettlement = undefined;

    let resolveStart!: () => void;
    let rejectStart!: (reason?: unknown) => void;
    const settlement = new Promise<void>((resolve, reject) => {
      resolveStart = resolve;
      rejectStart = reject;
    });
    this.startSettlement = settlement;

    void this.startReplSessionLifecycle(previousStopSettlement).then(resolveStart, rejectStart);
    const clearStartSettlement = (): void => {
      if (this.startSettlement === settlement) {
        this.startSettlement = undefined;
      }
    };
    void settlement.then(clearStartSettlement, clearStartSettlement);
    return settlement;
  }

  private async startReplSessionLifecycle(
    previousStopSettlement: Promise<void> | undefined
  ): Promise<void> {
    if (previousStopSettlement) {
      await previousStopSettlement;
    }

    const previousCleanupSettlement = this.cleanupSettlement;
    if (previousCleanupSettlement) {
      const previousCleanup = await previousCleanupSettlement;
      if (!previousCleanup.ok) {
        throw previousCleanup.reason;
      }
      if (this.cleanupSettlement === previousCleanupSettlement) {
        this.cleanupSettlement = undefined;
      }
    }

    if (this.host || this.activeTurn || this.status !== "stopped") {
      const staleCleanupSettlement = this.beginReplCleanup();
      const staleCleanup = await staleCleanupSettlement;
      if (!staleCleanup.ok) {
        throw staleCleanup.reason;
      }
      if (this.cleanupSettlement === staleCleanupSettlement) {
        this.cleanupSettlement = undefined;
      }
    }

    try {
      const host = await prepareGodCodeHost({
        approvalMode: this.approvalMode,
        approvalPrompt: this.approvalPrompt
      });
      this.host = host;
      this.engine.setToolExecutor(async (request, abortSignal) => {
        return await this.requireHost().registry.executeRequest(request, {
          cwd: this.cwd,
          abortSignal
        });
      });
      this.engine.off("god_code_event", this.onGodCodeEvent);
      this.engine.off("exit", this.onEngineExit);
      this.engine.on("god_code_event", this.onGodCodeEvent);
      this.engine.on("exit", this.onEngineExit);

      await this.engine.start();
      await this.engine.initialize(buildGodCodeInitializeRequest("repl"));
      await this.engine.createSession(
        buildGodCodeCreateSessionRequest(
          this.sessionId,
          this.cwd,
          host.toolCatalog,
          this.modelAdapter,
          host.initialMessages
        )
      );
      this.started = true;
      this.status = "idle";
    } catch (error) {
      await this.beginReplCleanup();
      throw error;
    }
  }

  public async submit(prompt: string): Promise<TurnResult> {
    if (!this.started || this.status === "stopped") {
      throw new Error("REPL session is not started.");
    }
    if (this.activeTurn) {
      throw new Error("A turn is already running.");
    }

    let resolveTurn!: (value: TurnResult) => void;
    let rejectTurn!: (reason?: unknown) => void;
    const resultPromise = new Promise<TurnResult>((resolve, reject) => {
      resolveTurn = resolve;
      rejectTurn = reject;
    });
    const activeTurn: ActiveTurn = {
      resolve: resolveTurn,
      reject: rejectTurn
    };
    this.activeTurn = activeTurn;
    this.status = "running";

    try {
      const submitResponse = await this.engine.submitTurn({
        session_id: this.sessionId,
        prompt: {
          role: "user",
          content: prompt
        },
        turn_options: this.stream ? { stream: true } : {}
      });
      if (this.activeTurn === activeTurn) {
        activeTurn.turnId = submitResponse.turn_id;
      }
      return await resultPromise;
    } catch (error) {
      try {
        this.clearActiveTurn(activeTurn);
      } catch {
        // The submit/result failure remains the turn primary.
      }
      throw error;
    }
  }

  public async cancelCurrentTurn(): Promise<boolean> {
    if (!this.activeTurn?.turnId) {
      return false;
    }
    await this.engine.cancelTurn({
      session_id: this.sessionId,
      turn_id: this.activeTurn.turnId
    });
    return true;
  }

  public getStatus(): ReplStatus {
    return this.status;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public listTools(): ToolCatalogEntry[] {
    return [...this.requireHost().toolCatalog];
  }

  public stop(): Promise<void> {
    if (this.stopSettlement) {
      return this.stopSettlement;
    }

    const activeStartSettlement = this.startSettlement;
    let resolveStop!: () => void;
    let rejectStop!: (reason?: unknown) => void;
    const settlement = new Promise<void>((resolve, reject) => {
      resolveStop = resolve;
      rejectStop = reject;
    });
    this.stopSettlement = settlement;
    void this.stopReplSessionLifecycle(activeStartSettlement).then(resolveStop, rejectStop);
    return settlement;
  }

  private async stopReplSessionLifecycle(
    activeStartSettlement: Promise<void> | undefined
  ): Promise<void> {
    if (activeStartSettlement) {
      await activeStartSettlement.catch(() => undefined);
    }

    this.requestActiveTurnCancellation();
    const cleanup = await this.beginReplCleanup();
    if (!cleanup.ok) {
      throw cleanup.reason;
    }
  }

  private readonly onGodCodeEvent = (event: GodCodeEventEnvelope): void => {
    this.onEvent?.(event);
    const activeTurn = this.activeTurn;
    if (!activeTurn || typeof event.turn_id !== "string") {
      return;
    }

    if (!activeTurn.turnId) {
      activeTurn.turnId = event.turn_id;
    }
    if (event.turn_id !== activeTurn.turnId) {
      return;
    }

    if (event.event_type === "assistant_delta") {
      this.renderer?.onAssistantDelta(event.payload.delta.text);
      return;
    }

    if (event.event_type === "assistant_message") {
      this.renderer?.onAssistantMessage(event.payload.message);
      return;
    }

    if (event.event_type === "tool_call_requested") {
      this.renderer?.onToolCallRequested();
      return;
    }

    if (event.event_type !== "turn_finished") {
      return;
    }

    try {
      this.clearActiveTurn(activeTurn);
    } catch (error) {
      activeTurn.reject(error);
      return;
    }
    activeTurn.resolve(event.payload);
  };

  private readonly onEngineExit = (info: GodCodeEngineExitInfo): void => {
    const activeTurn = this.activeTurn;
    if (this.activeTurn === activeTurn) {
      this.activeTurn = undefined;
    }
    this.status = "stopped";
    this.started = false;
    this.engine.off("god_code_event", this.onGodCodeEvent);
    this.engine.off("exit", this.onEngineExit);
    if (!activeTurn) {
      return;
    }

    try {
      this.renderer?.finish();
    } catch {
      // Engine exit remains the active turn primary.
    }
    activeTurn.reject(
      new Error(`GOD-code engine exited during REPL turn: ${info.stderr.trim()}`)
    );
  };

  private clearActiveTurn(expected: ActiveTurn): void {
    if (this.activeTurn !== expected) {
      return;
    }

    this.activeTurn = undefined;
    if (this.status !== "stopped") {
      this.status = "idle";
    }
    this.renderer?.finish();
  }

  private requestActiveTurnCancellation(): void {
    const turnId = this.activeTurn?.turnId;
    if (!turnId) {
      return;
    }

    const cancellation = invokeGodCodeReplFinalizer(async () => {
      await this.engine.cancelTurn({
        session_id: this.sessionId,
        turn_id: turnId
      });
    });
    void cancellation.catch(() => undefined);
  }

  private beginReplCleanup(): Promise<ReplCleanupOutcome> {
    if (this.cleanupSettlement) {
      return this.cleanupSettlement;
    }

    let resolveCleanup!: (outcome: ReplCleanupOutcome) => void;
    const settlement = new Promise<ReplCleanupOutcome>((resolve) => {
      resolveCleanup = resolve;
    });
    this.cleanupSettlement = settlement;

    try {
      void this.finalizeReplResources().then(
        resolveCleanup,
        (reason: unknown) => resolveCleanup({ ok: false, reason })
      );
    } catch (reason) {
      resolveCleanup({ ok: false, reason });
    }
    return settlement;
  }

  private finalizeReplResources(): Promise<ReplCleanupOutcome> {
    const host = this.host;
    const activeTurn = this.activeTurn;
    this.engine.off("god_code_event", this.onGodCodeEvent);
    this.engine.off("exit", this.onEngineExit);
    this.host = undefined;
    this.activeTurn = undefined;
    this.status = "stopped";
    this.started = false;

    activeTurn?.reject(new Error(REPL_ACTIVE_TURN_STOP_REASON));

    const rendererSettlement = invokeGodCodeReplFinalizer(() => this.renderer?.finish());
    const hostSettlement = invokeGodCodeReplFinalizer(async () => {
      await host?.close();
    });
    const engineSettlement = invokeGodCodeReplFinalizer(async () => {
      await this.engine.stop();
    });

    return Promise.allSettled([
      rendererSettlement,
      hostSettlement,
      engineSettlement
    ]).then(([rendererResult, hostResult, engineResult]) => {
      for (const result of [rendererResult, hostResult, engineResult]) {
        if (result.status === "rejected") {
          return { ok: false, reason: result.reason };
        }
      }
      return { ok: true };
    });
  }

  private requireHost(): PreparedGodCodeHost {
    if (!this.host) {
      throw new Error("REPL host is not prepared.");
    }
    return this.host;
  }

}

function invokeGodCodeReplFinalizer(finalizer: () => void | Promise<void>): Promise<void> {
  try {
    return Promise.resolve(finalizer());
  } catch (error) {
    return Promise.reject(error);
  }
}

export async function runGodCodeRepl(
  cwd: string,
  options: GodCodeReplRunOptions = {}
): Promise<void> {
  const output = options.output ?? process.stdout;
  const renderer = options.renderer ?? new TerminalRenderer(output);
  const session = new GodCodeReplSession(cwd, {
    renderer,
    stream: options.stream,
    modelAdapter: options.modelAdapter,
    transcriptDir: options.transcriptDir,
    approvalMode: options.approvalMode,
    approvalPrompt: options.approvalPrompt
  });
  const input = options.input ?? process.stdin;
  const interfaceInput = input as NodeJS.ReadableStream;
  const rl = readline.createInterface({
    input: interfaceInput,
    terminal: false
  });
  const pendingTurns = new Set<Promise<void>>();
  let operationFailed = false;
  rl.pause();

  const writeLine = (text: string): void => {
    output.write(`${text}\n`);
  };

  try {
    const closePromise = new Promise<void>((resolve) => {
      rl.on("line", (line) => {
        const pending = handleReplLine(line, session, writeLine, rl);
        if (pending) {
          pendingTurns.add(pending);
          void pending.then(
            () => pendingTurns.delete(pending),
            () => pendingTurns.delete(pending)
          );
        }
      });
      rl.on("SIGINT", () => {
        if (session.getStatus() === "running") {
          const pending = session.cancelCurrentTurn().then((cancelled) => {
            writeLine(cancelled ? "Cancel requested." : "No running turn.");
          });
          pendingTurns.add(pending);
          void pending.then(
            () => pendingTurns.delete(pending),
            () => pendingTurns.delete(pending)
          );
          return;
        }
        rl.close();
      });
      rl.on("close", resolve);
    });
    await session.start();
    writeLine("GOD-code REPL. Type /help for commands, /exit to quit.");
    rl.resume();
    await closePromise;
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    try {
      rl.close();
    } catch {
      // Readline closure is best-effort during composite finalization.
    }
    const stopSettlement = invokeGodCodeReplFinalizer(() => session.stop());
    const pendingSettlement = Promise.allSettled([...pendingTurns]);
    const [stopResult] = await Promise.allSettled([stopSettlement]);
    await pendingSettlement;
    if (!operationFailed && stopResult.status === "rejected") {
      throw stopResult.reason;
    }
  }
}

function handleReplLine(
  line: string,
  session: GodCodeReplSession,
  writeLine: (text: string) => void,
  rl: readline.Interface
): Promise<void> | undefined {
  const text = line.trim();
  if (text.length === 0) {
    return undefined;
  }

  if (text.startsWith("/")) {
    return handleSlashCommand(text, session, writeLine, rl);
  }

  if (session.getStatus() === "running") {
    writeLine("A turn is already running.");
    return undefined;
  }

  return session
    .submit(text)
    .then((result) => {
      if (result.status === "success") {
        return;
      }
      if (result.status === "cancelled") {
        writeLine("Turn cancelled.");
        return;
      }
      writeLine(result.error?.message ?? "Turn failed.");
    })
    .catch((error: unknown) => {
      writeLine(error instanceof Error ? error.message : String(error));
    });
}

function handleSlashCommand(
  command: string,
  session: GodCodeReplSession,
  writeLine: (text: string) => void,
  rl: readline.Interface
): Promise<void> | undefined {
  if (command === "/help") {
    writeLine("Commands:");
    writeLine("  /help    Show this help.");
    writeLine("  /status  Show current REPL status.");
    writeLine("  /tools   List available tools.");
    writeLine("  /cancel  Cancel the current turn.");
    writeLine("  /exit    Exit the REPL.");
    return undefined;
  }

  if (command === "/status") {
    writeLine(`Status: ${session.getStatus()}`);
    return undefined;
  }

  if (command === "/tools") {
    for (const tool of session.listTools()) {
      writeLine(`${tool.name} - ${tool.description}`);
    }
    return undefined;
  }

  if (command === "/cancel") {
    return session.cancelCurrentTurn().then((cancelled) => {
      writeLine(cancelled ? "Cancel requested." : "No running turn.");
    });
  }

  if (command === "/exit") {
    rl.close();
    return undefined;
  }

  writeLine(`Unknown command: ${command}. Type /help for commands.`);
  return undefined;
}
