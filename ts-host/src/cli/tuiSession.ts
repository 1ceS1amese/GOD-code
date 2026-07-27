import readline from "node:readline";
import type { Readable } from "node:stream";
import { GodCodeReplSession } from "./repl.js";
import type { ToolApprovalMode, ToolApprovalPrompt } from "../policy/approval.js";
import { listTranscriptSessions, readTranscriptTimelineForSession, resolveTranscriptDir } from "../transcripts/history.js";
import type { GodCodeEventEnvelope, TurnResult } from "../types/godCodeProtocol.js";
import { TuiModalApprovalPrompt } from "./tuiApproval.js";
import { mapKeypressToTuiAction, mapLineToTuiAction, type TuiKeyInfo } from "./tuiInput.js";
import { renderTuiFrame, type TuiDimensions } from "./tuiRenderer.js";
import { TuiScreen } from "./tuiScreen.js";
import { selectedLiveSessionCommand } from "./tuiCommandSelectors.js";
import { reduceTuiState } from "./tuiConfiguredReducer.js";
import { createInitialTuiState, createTuiEvent } from "./tuiStateFactory.js";
import type { TuiAction, TuiHistoryItem, TuiState, TuiTimelineSummary } from "./tuiTypes.js";

export interface TuiOutput {
  write(text: string): void;
  columns?: number;
  rows?: number;
  isTTY?: boolean;
}

export interface TuiInput extends Readable {
  isTTY?: boolean;
  setRawMode?(mode: boolean): this;
}

export interface TuiSessionLike {
  start(): Promise<void>;
  submit(prompt: string): Promise<TurnResult>;
  cancelCurrentTurn(): Promise<boolean>;
  stop(): Promise<void>;
  getSessionId?(): string;
}

export interface TuiControllerOptions {
  input?: TuiInput;
  output?: TuiOutput;
  stream?: boolean;
  modelAdapter?: string;
  transcriptDir?: string;
  approvalMode?: ToolApprovalMode;
  approvalPrompt?: ToolApprovalPrompt;
  interactive?: boolean;
  sessionFactory?: (callbacks: { onEvent(event: GodCodeEventEnvelope): void }) => TuiSessionLike;
  now?: () => string;
}

const TUI_CONTROLLER_CLEANUP_FAILURE_MESSAGE =
  "GOD-code TUI cleanup failed.";
const TUI_CONTROLLER_STOPPING_MESSAGE =
  "GOD-code TUI controller is stopping.";

export class TuiController {
  private state: TuiState;
  private session?: TuiSessionLike;
  private readonly liveSessions = new Map<string, TuiSessionLike>();
  private screen?: TuiScreen;
  private modalApprovalPrompt?: TuiModalApprovalPrompt;
  private rawModeEnabled = false;
  private stopping = false;
  private stopSettlement?: Promise<void>;

  public constructor(private readonly cwd: string, private readonly options: TuiControllerOptions = {}) {
    this.state = createInitialTuiState(options.now);
  }

  public getState(): TuiState {
    return this.state;
  }

  public applyAction(action: TuiAction): void {
    this.state = reduceTuiState(this.state, action);
  }

  public async start(): Promise<void> {
    if (this.stopping || this.stopSettlement !== undefined) {
      throw new Error(TUI_CONTROLLER_STOPPING_MESSAGE);
    }
    try {
      this.assertInteractive();
      this.startScreenIfSupported();
      await this.loadHistory();
      await this.startLiveSession();
      this.render();
    } catch (error) {
      if (this.hasOwnedResources() || this.stopSettlement !== undefined) {
        await Promise.allSettled([this.stop()]);
      }
      throw error;
    }
  }

  public async createLiveSession(): Promise<TuiSessionLike> {
    if (this.state.status === "running" || this.state.status === "stopping") {
      throw new Error("Cannot create a live TUI session while a turn is running.");
    }
    const session = await this.startLiveSession();
    const sessionId = session.getSessionId?.() ?? this.state.sessionId ?? "-";
    this.applyAction({
      type: "append_event",
      event: createTuiEvent("system", `Live session started: ${sessionId}`, this.options.now)
    });
    this.render();
    return session;
  }

  public switchLiveSession(direction: -1 | 1): boolean {
    const previousSessionId = this.state.sessionId;
    this.applyAction({ type: "switch_live_session", direction });
    return this.activateCurrentLiveSession(previousSessionId, "Switched live session");
  }

  public activateSelectedLiveSession(): boolean {
    const previousSessionId = this.state.sessionId;
    this.applyAction({ type: "activate_live_session" });
    return this.activateCurrentLiveSession(previousSessionId, "Activated live session");
  }

  public async closeSelectedLiveSession(): Promise<boolean> {
    const sessionId = this.state.liveSessions[this.state.selectedLiveSessionIndex]?.sessionId;
    this.applyAction({ type: "close_live_session" });
    return this.stopClosedLiveSession(sessionId);
  }

  public async closeInactiveLiveSessions(): Promise<string[]> {
    const sessionIds = this.state.liveSessions
      .filter((session, index) =>
        index !== this.state.activeLiveSessionIndex && session.status !== "running" && session.status !== "stopping"
      )
      .map((session) => session.sessionId);
    this.applyAction({ type: "close_inactive_live_sessions" });
    return this.stopClosedLiveSessions(sessionIds);
  }

  private activateCurrentLiveSession(previousSessionId: string | undefined, label: string): boolean {
    const nextSessionId = this.state.sessionId;
    if (!nextSessionId || nextSessionId === previousSessionId) {
      this.render();
      return false;
    }
    const nextSession = this.liveSessions.get(nextSessionId);
    if (!nextSession) {
      this.applyAction({ type: "set_error", error: `Live session not found: ${nextSessionId}` });
      this.render();
      return false;
    }
    this.session = nextSession;
    this.applyAction({
      type: "append_event",
      event: createTuiEvent("system", `${label}: ${nextSessionId}`, this.options.now)
    });
    this.render();
    return true;
  }

  private async stopClosedLiveSession(sessionId: string | undefined): Promise<boolean> {
    if (!sessionId || this.state.liveSessions.some((session) => session.sessionId === sessionId)) {
      this.render();
      return false;
    }
    const closedSession = this.liveSessions.get(sessionId);
    if (closedSession) {
      await invokeTuiControllerFinalizer(() => closedSession.stop());
      this.liveSessions.delete(sessionId);
    }
    this.session = this.state.sessionId ? this.liveSessions.get(this.state.sessionId) : undefined;
    this.applyAction({
      type: "append_event",
      event: createTuiEvent("system", `Closed live session: ${sessionId}`, this.options.now)
    });
    this.render();
    return Boolean(closedSession);
  }

  private async stopClosedLiveSessions(sessionIds: string[]): Promise<string[]> {
    const candidates: Array<{ sessionId: string; session: TuiSessionLike }> = [];
    for (const sessionId of sessionIds) {
      if (this.state.liveSessions.some((session) => session.sessionId === sessionId)) {
        continue;
      }
      const session = this.liveSessions.get(sessionId);
      if (session) {
        candidates.push({ sessionId, session });
      }
    }
    const results = await Promise.allSettled(
      candidates.map(({ session }) => invokeTuiControllerFinalizer(() => session.stop()))
    );
    const closedSessionIds: string[] = [];
    let firstFailure: unknown;
    let failed = false;
    for (const [index, result] of results.entries()) {
      const candidate = candidates[index];
      if (!candidate) {
        continue;
      }
      if (result.status === "fulfilled") {
        if (this.liveSessions.get(candidate.sessionId) === candidate.session) {
          this.liveSessions.delete(candidate.sessionId);
        }
        closedSessionIds.push(candidate.sessionId);
      } else if (!failed) {
        failed = true;
        firstFailure = result.reason;
      }
    }
    this.session = this.state.sessionId ? this.liveSessions.get(this.state.sessionId) : undefined;
    if (failed) {
      throw firstFailure;
    }
    if (closedSessionIds.length > 0) {
      this.applyAction({
        type: "append_event",
        event: createTuiEvent("system", `Closed inactive live sessions: ${closedSessionIds.join(", ")}`, this.options.now)
      });
    }
    this.render();
    return closedSessionIds;
  }

  public async submitPrompt(prompt: string): Promise<TurnResult> {
    if (!this.session) {
      throw new Error("TUI session is not started.");
    }
    this.applyAction({
      type: "append_event",
      event: createTuiEvent("system", `Submitted prompt: ${prompt}`, this.options.now)
    });
    this.render();
    try {
      const result = await this.session.submit(prompt);
      this.applyAction({
        type: "turn_finished",
        status: result.status,
        error: result.error?.message
      });
      this.applyAction({
        type: "append_event",
        event: createTuiEvent("system", `Turn finished: ${result.status}`, this.options.now)
      });
      await this.loadHistory();
      this.render();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.applyAction({ type: "set_error", error: message });
      this.render();
      throw error;
    }
  }

  public async cancelCurrentTurn(): Promise<boolean> {
    if (!this.session) {
      return false;
    }
    const cancelled = await this.session.cancelCurrentTurn();
    this.applyAction({
      type: "append_event",
      event: createTuiEvent("system", cancelled ? "Cancel requested." : "No running turn.", this.options.now)
    });
    this.render();
    return cancelled;
  }

  public stop(): Promise<void> {
    if (this.stopSettlement !== undefined) {
      return this.stopSettlement;
    }
    let resolveStop!: () => void;
    let rejectStop!: (reason: unknown) => void;
    const settlement = new Promise<void>((resolve, reject) => {
      resolveStop = resolve;
      rejectStop = reject;
    });
    this.stopSettlement = settlement;
    void invokeTuiControllerFinalizer(() => this.performStop()).then(resolveStop, rejectStop);
    return settlement;
  }

  private async performStop(): Promise<void> {
    this.stopping = true;
    const input = this.options.input ?? process.stdin;
    const rawModeOwned = this.rawModeEnabled;
    this.rawModeEnabled = false;
    const sessions = [...new Set(
      [...this.liveSessions.values(), this.session]
        .filter((session): session is TuiSessionLike => Boolean(session))
    )];
    this.liveSessions.clear();
    this.session = undefined;
    const screen = this.screen;
    this.screen = undefined;

    const settlements: Promise<void>[] = [
      invokeTuiControllerFinalizer(() => {
        this.applyAction({ type: "request_exit" });
        this.render(screen);
      })
    ];
    if (rawModeOwned) {
      settlements.push(
        invokeTuiControllerFinalizer(() => {
          input.setRawMode?.(false);
        })
      );
    }
    settlements.push(
      ...sessions.map((session) => invokeTuiControllerFinalizer(() => session.stop()))
    );
    if (screen) {
      settlements.push(
        invokeTuiControllerFinalizer(() => screen.stop())
      );
    }

    const results = await Promise.allSettled(settlements);
    if (results.some((result) => result.status === "rejected")) {
      throw new Error(TUI_CONTROLLER_CLEANUP_FAILURE_MESSAGE);
    }
  }

  public async run(): Promise<void> {
    const input = this.options.input ?? process.stdin;
    const pending = new Set<Promise<unknown>>();
    let inputFinalizer: (() => void) | undefined;
    let operationFailed = false;
    let operationFailure: unknown;

    try {
      await this.start();

      if (input.isTTY && input.setRawMode) {
        readline.emitKeypressEvents(input);
        this.rawModeEnabled = true;
        input.setRawMode(true);
        input.resume();
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          let attached = false;
          const onKeypress = (text: string | undefined, key: TuiKeyInfo | undefined): void => {
            if (settled) {
              return;
            }
            try {
              trackTuiPendingAction(pending, this.handleKey(text, key));
              if (this.state.exitRequested) {
                settled = true;
                resolve();
              }
            } catch (error) {
              settled = true;
              reject(error);
            }
          };
          inputFinalizer = (): void => {
            if (!attached) {
              return;
            }
            attached = false;
            input.off("keypress", onKeypress);
          };
          attached = true;
          input.on("keypress", onKeypress);
        });
      } else {
        const rl = readline.createInterface({
          input,
          terminal: false
        });
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          let attached = false;
          let closed = false;
          let closeAttempted = false;
          const detach = (): void => {
            if (!attached) {
              return;
            }
            attached = false;
            rl.off("line", onLine);
            rl.off("SIGINT", onSigint);
            rl.off("close", onClose);
          };
          const settleSuccess = (): void => {
            if (settled) {
              return;
            }
            settled = true;
            detach();
            resolve();
          };
          const settleFailure = (reason: unknown): void => {
            if (settled) {
              return;
            }
            settled = true;
            detach();
            reject(reason);
          };
          const requestClose = (): void => {
            if (closed || closeAttempted) {
              settleSuccess();
              return;
            }
            closeAttempted = true;
            try {
              rl.close();
              if (!settled) {
                settleSuccess();
              }
            } catch {
              settleFailure(new Error(TUI_CONTROLLER_CLEANUP_FAILURE_MESSAGE));
            }
          };
          const onLine = (line: string): void => {
            if (settled) {
              return;
            }
            try {
              for (const action of mapLineToTuiAction(line)) {
                trackTuiPendingAction(pending, this.handleAction(action));
              }
            } catch (error) {
              settleFailure(error);
            }
          };
          const onSigint = (): void => {
            if (settled) {
              return;
            }
            try {
              trackTuiPendingAction(
                pending,
                this.handleAction(
                  this.state.status === "running" ? { type: "request_cancel" } : { type: "request_exit" }
                )
              );
              if (this.state.exitRequested) {
                requestClose();
              }
            } catch (error) {
              settleFailure(error);
            }
          };
          const onClose = (): void => {
            closed = true;
            settleSuccess();
          };
          inputFinalizer = (): void => {
            if (!closed && !closeAttempted) {
              closeAttempted = true;
              try {
                rl.close();
              } finally {
                detach();
              }
              return;
            }
            detach();
          };
          attached = true;
          rl.on("line", onLine);
          rl.on("SIGINT", onSigint);
          rl.on("close", onClose);
        });
      }
    } catch (error) {
      operationFailed = true;
      operationFailure = error;
    }

    const inputSettlement = inputFinalizer === undefined
      ? Promise.resolve()
      : invokeTuiControllerFinalizer(inputFinalizer);
    const stopSettlement = this.stopSettlement !== undefined || this.hasOwnedResources()
      ? this.stop()
      : Promise.resolve();
    const pendingSettlement = Promise.allSettled([...pending]);
    const [inputResult, stopResult] = await Promise.allSettled([
      inputSettlement,
      stopSettlement
    ]);
    await pendingSettlement;

    if (operationFailed) {
      throw operationFailure;
    }
    if (inputResult.status === "rejected" || stopResult.status === "rejected") {
      throw new Error(TUI_CONTROLLER_CLEANUP_FAILURE_MESSAGE);
    }
  }

  private handleKey(text: string | undefined, key: TuiKeyInfo | undefined): Promise<unknown> | undefined {
    if (this.modalApprovalPrompt?.isPending()) {
      this.modalApprovalPrompt.handleKey(text, key);
      this.render();
      return undefined;
    }
    const action = mapKeypressToTuiAction(text, key, {
      status: this.state.status,
      activePane: this.state.activePane,
      liveSessionCommandPaletteVisible: this.state.liveSessionCommandPaletteVisible,
      selectedLiveSessionCommand: selectedLiveSessionCommand(this.state)
    });
    if (!action) {
      return undefined;
    }
    return this.handleAction(action);
  }

  private handleAction(action: TuiAction): Promise<unknown> | undefined {
    const previousSessionId = this.state.sessionId;
    const closingSessionId = action.type === "close_live_session"
      ? this.state.liveSessions[this.state.selectedLiveSessionIndex]?.sessionId
      : undefined;
    const closingInactiveSessionIds = action.type === "close_inactive_live_sessions"
      ? this.state.liveSessions
        .filter((session, index) =>
          index !== this.state.activeLiveSessionIndex && session.status !== "running" && session.status !== "stopping"
        )
        .map((session) => session.sessionId)
      : [];
    this.applyAction(action);
    this.render();
    if (action.type === "request_cancel") {
      return this.cancelCurrentTurn();
    }
    if (action.type === "create_live_session") {
      return this.createLiveSession();
    }
    if (action.type === "switch_live_session") {
      this.activateCurrentLiveSession(previousSessionId, "Switched live session");
      return undefined;
    }
    if (action.type === "select_live_session") {
      return undefined;
    }
    if (action.type === "activate_live_session") {
      this.activateCurrentLiveSession(previousSessionId, "Activated live session");
      return undefined;
    }
    if (action.type === "close_live_session") {
      return this.stopClosedLiveSession(closingSessionId);
    }
    if (action.type === "close_inactive_live_sessions") {
      return this.stopClosedLiveSessions(closingInactiveSessionIds);
    }
    if (action.type === "select_history") {
      return this.loadSelectedTimeline();
    }
    if (action.type === "activate_history_session") {
      return this.loadSelectedTimeline();
    }
    if (this.state.submitRequested) {
      const prompt = this.state.submitRequested;
      this.state = {
        ...this.state,
        submitRequested: undefined
      };
      return this.submitPrompt(prompt);
    }
    return undefined;
  }

  private async loadHistory(): Promise<void> {
    try {
      const transcriptDir = this.options.transcriptDir ?? resolveTranscriptDir(this.cwd);
      const summaries = await listTranscriptSessions(transcriptDir);
      const history: TuiHistoryItem[] = summaries.slice(0, 5).map((summary) => ({
        sessionId: summary.sessionId,
        firstPrompt: summary.firstPrompt,
        lastTimestamp: summary.lastTimestamp,
        entryCount: summary.entryCount,
        turnCount: summary.turnCount
      }));
      this.applyAction({ type: "set_history", history });
      await this.loadSelectedTimeline();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.applyAction({
        type: "append_event",
        event: createTuiEvent("error", `History unavailable: ${message}`, this.options.now)
      });
    }
  }

  private async loadSelectedTimeline(): Promise<void> {
    const selected = this.state.history[this.state.selectedHistoryIndex];
    if (!selected) {
      this.applyAction({ type: "set_selected_timeline", timeline: undefined });
      this.render();
      return;
    }

    this.applyAction({ type: "set_history_loading", loading: true });
    this.render();
    try {
      const transcriptDir = this.options.transcriptDir ?? resolveTranscriptDir(this.cwd);
      const timeline = await readTranscriptTimelineForSession(transcriptDir, selected.sessionId, {
        includePreview: true,
        previewChars: 80
      });
      const summary: TuiTimelineSummary = {
        sessionId: timeline.sessionId,
        entryCount: timeline.entryCount,
        turnCount: timeline.turnCount,
        firstTimestamp: timeline.firstTimestamp,
        lastTimestamp: timeline.lastTimestamp,
        entries: timeline.entries.slice(0, 8).map((entry) => ({
          index: entry.index,
          timestamp: entry.timestamp,
          type: entry.type,
          turnId: entry.turnId,
          status: entry.status,
          toolName: entry.toolName,
          preview: entry.preview
        }))
      };
      this.applyAction({ type: "set_selected_timeline", timeline: summary });
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.applyAction({ type: "set_selected_timeline", timeline: undefined });
      this.applyAction({
        type: "append_event",
        event: createTuiEvent("error", `Timeline unavailable: ${message}`, this.options.now)
      });
      this.render();
    }
  }

  private createSession(): TuiSessionLike {
    if (this.options.sessionFactory) {
      return this.options.sessionFactory({
        onEvent: (event) => this.handleGodCodeEvent(event)
      });
    }
    return new GodCodeReplSession(this.cwd, {
      stream: this.options.stream,
      modelAdapter: this.options.modelAdapter,
      transcriptDir: this.options.transcriptDir,
      approvalMode: this.options.approvalMode,
      approvalPrompt: this.createApprovalPrompt(),
      onEvent: (event) => this.handleGodCodeEvent(event)
    });
  }

  private async startLiveSession(): Promise<TuiSessionLike> {
    if (this.stopping || this.stopSettlement !== undefined) {
      throw new Error(TUI_CONTROLLER_STOPPING_MESSAGE);
    }
    const session = this.createSession();
    let sessionId: string | undefined;
    try {
      await session.start();
      if (this.stopping || this.stopSettlement !== undefined) {
        throw new Error(TUI_CONTROLLER_STOPPING_MESSAGE);
      }
      sessionId = session.getSessionId?.() ?? `live-${this.liveSessions.size + 1}`;
      this.liveSessions.set(sessionId, session);
      this.session = session;
      this.applyAction({ type: "session_started", sessionId });
      return session;
    } catch (error) {
      if (sessionId !== undefined && this.liveSessions.get(sessionId) === session) {
        this.liveSessions.delete(sessionId);
      }
      if (this.session === session) {
        this.session = undefined;
      }
      await Promise.allSettled([
        invokeTuiControllerFinalizer(() => session.stop())
      ]);
      throw error;
    }
  }

  private createApprovalPrompt(): ToolApprovalPrompt | undefined {
    const prompt = this.options.approvalPrompt;
    if (!this.screen) {
      return prompt;
    }
    this.modalApprovalPrompt = new TuiModalApprovalPrompt({
      show: (modal) => {
        this.applyAction({ type: "show_approval_modal", modal });
        this.render();
      },
      hide: () => {
        this.applyAction({ type: "hide_approval_modal" });
        this.render();
      }
    });
    return this.modalApprovalPrompt;
  }

  private handleGodCodeEvent(event: GodCodeEventEnvelope): void {
    const action = tuiActionForGodCodeEvent(event, this.options.now);
    if (!action) {
      return;
    }
    this.applyAction(action);
    this.render();
  }

  private render(screen: TuiScreen | undefined = this.screen): void {
    const output = this.options.output ?? process.stdout;
    const frame = renderTuiFrame(this.state, screen?.getDimensions() ?? getDimensions(output));
    if (screen) {
      screen.render(frame);
      return;
    }
    output.write(frame);
  }

  private hasOwnedResources(): boolean {
    return this.rawModeEnabled
      || this.screen !== undefined
      || this.session !== undefined
      || this.liveSessions.size > 0;
  }

  private startScreenIfSupported(): void {
    const input = this.options.input ?? process.stdin;
    const output = this.options.output ?? process.stdout;
    if (!input.isTTY || !input.setRawMode || !output.isTTY) {
      return;
    }
    this.screen = new TuiScreen(output);
    this.screen.start();
  }

  private assertInteractive(): void {
    if (this.options.interactive === true) {
      return;
    }
    const input = this.options.input ?? process.stdin;
    const output = this.options.output ?? process.stdout;
    if (!input.isTTY || !output.isTTY) {
      throw new Error("god-code tui requires an interactive terminal.");
    }
  }
}

function trackTuiPendingAction(
  pending: Set<Promise<unknown>>,
  action: Promise<unknown> | undefined
): void {
  if (!action) {
    return;
  }
  pending.add(action);
  void action.then(
    () => pending.delete(action),
    () => pending.delete(action)
  );
}

function invokeTuiControllerFinalizer(
  finalizer: () => void | Promise<void>
): Promise<void> {
  try {
    return Promise.resolve(finalizer());
  } catch (error) {
    return Promise.reject(error);
  }
}

export async function runGodCodeTui(cwd: string, options: TuiControllerOptions = {}): Promise<void> {
  const controller = new TuiController(cwd, options);
  await controller.run();
}

function getDimensions(output: TuiOutput): TuiDimensions {
  return {
    columns: output.columns ?? 80,
    rows: output.rows ?? 24
  };
}

function tuiActionForGodCodeEvent(event: GodCodeEventEnvelope, now: (() => string) | undefined): TuiAction | undefined {
  if (event.event_type === "assistant_delta") {
    return event.payload.delta.text
      ? {
          type: "append_assistant_delta",
          sessionId: event.session_id,
          event: createTuiEvent("assistant", event.payload.delta.text, now)
        }
      : undefined;
  }
  if (event.event_type === "assistant_message") {
    return {
      type: "finalize_assistant_message",
      sessionId: event.session_id,
      event: createTuiEvent("assistant", event.payload.message.content, now)
    };
  }
  if (event.event_type === "tool_call_requested") {
    return {
      type: "append_event",
      sessionId: event.session_id,
      event: createTuiEvent("tool_call", `Tool requested: ${event.payload.tool_call.tool_name}`, now)
    };
  }
  if (event.event_type === "tool_result_received") {
    const status = event.payload.result.ok ? "ok" : "error";
    return {
      type: "append_event",
      sessionId: event.session_id,
      event: createTuiEvent("tool_result", `Tool result: ${event.payload.tool_name} ${status}`, now)
    };
  }
  if (event.event_type === "god_code_error") {
    return {
      type: "append_event",
      sessionId: event.session_id,
      event: createTuiEvent("error", event.payload.error.message, now)
    };
  }
  return undefined;
}
