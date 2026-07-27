import { renderTuiFrame, type TuiDimensions } from "./tuiRenderer.js";
import { TuiScreen, type TuiScreenOutput } from "./tuiScreen.js";
import { reduceTuiState } from "./tuiConfiguredReducer.js";
import { createInitialTuiState, createTuiEvent } from "./tuiStateFactory.js";

export interface TuiPtySmokeOptions {
  output?: TuiScreenOutput;
  requireTty?: boolean;
  dimensions?: Partial<TuiDimensions>;
  now?: () => string;
}

export interface TuiPtySmokeResult {
  status: "passed" | "skipped";
  reason?: string;
  dimensions: TuiDimensions;
  renderedLines: number;
}

type TuiPtySmokeOperationOutcome =
  | { status: "fulfilled"; value: TuiPtySmokeResult }
  | { status: "rejected"; reason: unknown };

const TUI_PTY_SMOKE_CLEANUP_FAILURE_MESSAGE =
  "TUI PTY smoke cleanup failed";

export function runTuiPtySmoke(options: TuiPtySmokeOptions = {}): TuiPtySmokeResult {
  const output = options.output ?? process.stdout;
  const requireTty = options.requireTty ?? true;
  const dimensions = normalizeDimensions({
    columns: options.dimensions?.columns ?? output.columns,
    rows: options.dimensions?.rows ?? output.rows
  });

  if (requireTty && output.isTTY !== true) {
    return {
      status: "skipped",
      reason: "TUI PTY smoke requires TTY output.",
      dimensions,
      renderedLines: 0
    };
  }

  const screen = new TuiScreen({
    write: (text) => output.write(text),
    columns: dimensions.columns,
    rows: dimensions.rows,
    isTTY: output.isTTY
  });
  const frame = renderTuiFrame(createSmokeState(options.now), dimensions);
  screen.start();

  let operation: TuiPtySmokeOperationOutcome;
  try {
    screen.render(frame);
    operation = {
      status: "fulfilled",
      value: {
        status: "passed",
        dimensions,
        renderedLines: frame.split("\n").filter((line) => line.length > 0).length
      }
    };
  } catch (reason) {
    operation = { status: "rejected", reason };
  }
  const screenStopped = invokeTuiPtySmokeFinalizer(() => screen.stop());

  if (operation.status === "rejected") {
    throw operation.reason;
  }
  if (!screenStopped) {
    throw new Error(TUI_PTY_SMOKE_CLEANUP_FAILURE_MESSAGE);
  }
  return operation.value;
}

function createSmokeState(now: (() => string) | undefined) {
  let state = createInitialTuiState(now);
  state = reduceTuiState(state, { type: "session_started", sessionId: "tui-smoke-session" });
  state = reduceTuiState(state, {
    type: "append_event",
    event: createTuiEvent("system", "TUI PTY smoke event", now)
  });
  state = reduceTuiState(state, { type: "append_prompt", text: "smoke prompt" });
  return state;
}

function normalizeDimensions(dimensions: Partial<TuiDimensions>): TuiDimensions {
  return {
    columns: dimensions.columns ?? 80,
    rows: dimensions.rows ?? 24
  };
}

function invokeTuiPtySmokeFinalizer(finalizer: () => void): boolean {
  try {
    finalizer();
    return true;
  } catch {
    return false;
  }
}
