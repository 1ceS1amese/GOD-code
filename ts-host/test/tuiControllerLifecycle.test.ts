import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  TuiController,
  type TuiInput,
  type TuiOutput,
  type TuiSessionLike
} from "../src/cli/tuiSession.js";
import { TUI_SCREEN_SEQUENCE } from "../src/cli/tuiScreen.js";
import type { TurnResult } from "../src/types/godCodeProtocol.js";

const tempDirs: string[] = [];
const now = () => "2026-07-26T00:00:00.000Z";

class LifecycleInput extends PassThrough implements TuiInput {
  public readonly isTTY = true;
  public readonly rawModeCalls: boolean[] = [];

  public constructor(private readonly rawModeHook?: (mode: boolean) => void) {
    super();
  }

  public setRawMode(mode: boolean): this {
    this.rawModeCalls.push(mode);
    this.rawModeHook?.(mode);
    return this;
  }
}

class LifecycleOutput implements TuiOutput {
  public readonly isTTY = true;
  public readonly columns = 80;
  public readonly rows = 24;
  public readonly chunks: string[] = [];
  public writeCalls = 0;
  public screenStopAttempts = 0;

  public constructor(private readonly writeHook?: (text: string, call: number) => void) {}

  public write(text: string): void {
    this.writeCalls += 1;
    this.chunks.push(text);
    if (text.includes(TUI_SCREEN_SEQUENCE.showCursor + TUI_SCREEN_SEQUENCE.leaveAlternate)) {
      this.screenStopAttempts += 1;
    }
    this.writeHook?.(text, this.writeCalls);
  }
}

class LifecycleSession implements TuiSessionLike {
  public startCalls = 0;
  public stopCalls = 0;
  public cancelCalls = 0;

  public constructor(
    private readonly sessionId: string,
    private readonly startHook: () => Promise<void> = async () => undefined,
    private readonly stopHook: () => Promise<void> = async () => undefined,
    private readonly cancelHook: () => Promise<boolean> = async () => true
  ) {}

  public start(): Promise<void> {
    this.startCalls += 1;
    return this.startHook();
  }

  public async submit(_prompt: string): Promise<TurnResult> {
    return { status: "success", messages: [] };
  }

  public cancelCurrentTurn(): Promise<boolean> {
    this.cancelCalls += 1;
    return this.cancelHook();
  }

  public stop(): Promise<void> {
    this.stopCalls += 1;
    return this.stopHook();
  }

  public getSessionId(): string {
    return this.sessionId;
  }
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

describe("TUI controller composite lifecycle", () => {
  it("preserves a session start primary while stopping the candidate exactly once", async () => {
    const startPrimary = { kind: "tui-session-start-primary-phase599" };
    const session = new LifecycleSession(
      "phase599-start-session",
      () => Promise.reject(startPrimary),
      () => Promise.reject(new Error("tui-session-start-cleanup-secondary-phase599"))
    );
    const controller = await createController({
      output: new LifecycleOutput(),
      sessionFactory: () => session
    });

    const caught = await captureRejection(controller.start());

    expect(caught).toBe(startPrimary);
    expect(session.startCalls).toBe(1);
    expect(session.stopCalls).toBe(1);
  });

  it("preserves first-render primary while attempting session and screen cleanup", async () => {
    const renderPrimary = { kind: "tui-first-render-primary-phase599" };
    let renderFailed = false;
    const output = new LifecycleOutput((text) => {
      if (!renderFailed && text.includes("phase599-render-session")) {
        renderFailed = true;
        throw renderPrimary;
      }
      if (text.includes(TUI_SCREEN_SEQUENCE.showCursor + TUI_SCREEN_SEQUENCE.leaveAlternate)) {
        throw new Error("tui-screen-stop-secondary-phase599");
      }
    });
    const input = new LifecycleInput();
    const session = new LifecycleSession(
      "phase599-render-session",
      async () => undefined,
      () => Promise.reject(new Error("tui-render-session-stop-secondary-phase599"))
    );
    const controller = await createController({ input, output, sessionFactory: () => session });

    const caught = await captureRejection(controller.start());

    expect(caught).toBe(renderPrimary);
    expect(session.stopCalls).toBe(1);
    expect(output.screenStopAttempts).toBe(1);
  });

  it("memoizes concurrent and repeated stop while finalizing each resource once", async () => {
    const output = new LifecycleOutput();
    const input = new LifecycleInput();
    const stopDeferred = createDeferred<void>();
    const session = new LifecycleSession(
      "phase599-stop-session",
      async () => undefined,
      () => stopDeferred.promise
    );
    const controller = await createController({ input, output, sessionFactory: () => session });
    await controller.start();

    const firstStop = controller.stop();
    const concurrentStop = controller.stop();

    expect(concurrentStop).toBe(firstStop);
    await Promise.resolve();
    expect(session.stopCalls).toBe(1);

    stopDeferred.resolve();
    await firstStop;

    expect(controller.stop()).toBe(firstStop);
    expect(session.stopCalls).toBe(1);
    expect(output.screenStopAttempts).toBe(1);
  });

  it("all-settles session and screen failures and exposes only a fixed stop error", async () => {
    const output = new LifecycleOutput((text) => {
      if (text.includes(TUI_SCREEN_SEQUENCE.showCursor + TUI_SCREEN_SEQUENCE.leaveAlternate)) {
        throw new Error("tui-explicit-screen-stop-secret-phase599");
      }
    });
    const input = new LifecycleInput();
    const first = new LifecycleSession(
      "phase599-stop-first",
      async () => undefined,
      () => {
        throw new Error("tui-explicit-first-stop-secret-phase599");
      }
    );
    const second = new LifecycleSession(
      "phase599-stop-second",
      async () => undefined,
      () => Promise.reject(new Error("tui-explicit-second-stop-secret-phase599"))
    );
    const sessions = [first, second];
    const controller = await createController({
      input,
      output,
      sessionFactory: () => sessions.shift()!
    });
    await controller.start();
    await controller.createLiveSession();

    const caught = await captureRejection(controller.stop());

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("GOD-code TUI cleanup failed.");
    expect((caught as Error).message).not.toContain("secret-phase599");
    expect(first.stopCalls).toBe(1);
    expect(second.stopCalls).toBe(1);
    expect(output.screenStopAttempts).toBe(1);
  });

  it("preserves input setup primary while finalizing the started session and screen", async () => {
    const inputPrimary = { kind: "tui-input-setup-primary-phase599" };
    const input = new LifecycleInput((mode) => {
      if (mode) {
        throw inputPrimary;
      }
    });
    const output = new LifecycleOutput();
    const session = new LifecycleSession("phase599-input-primary-session");
    const controller = await createController({ input, output, sessionFactory: () => session });

    const caught = await captureRejection(controller.run());

    expect(caught).toBe(inputPrimary);
    expect(session.stopCalls).toBe(1);
    expect(output.screenStopAttempts).toBe(1);
  });

  it("projects successful run cleanup failure through a fixed error", async () => {
    const input = new LifecycleInput((mode) => {
      if (!mode) {
        throw new Error("tui-raw-mode-cleanup-secret-phase599");
      }
    });
    const output = new LifecycleOutput();
    const session = new LifecycleSession(
      "phase599-run-cleanup-session",
      async () => {
        setImmediate(() => input.emit("keypress", undefined, { name: "c", ctrl: true }));
      }
    );
    const controller = await createController({ input, output, sessionFactory: () => session });

    const caught = await captureRejection(controller.run());

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("GOD-code TUI cleanup failed.");
    expect((caught as Error).message).not.toContain("raw-mode-cleanup-secret");
    expect(input.rawModeCalls).toEqual([true, false]);
    expect(session.stopCalls).toBe(1);
    expect(output.screenStopAttempts).toBe(1);
  });

  it("observes rejected pending actions without leaking a derivative rejection", async () => {
    const input = new LifecycleInput();
    const output = new LifecycleOutput();
    const initial = new LifecycleSession(
      "phase599-pending-initial",
      async () => {
        setImmediate(() => {
          input.emit("keypress", undefined, { name: "n", ctrl: true });
          setImmediate(() => input.emit("keypress", undefined, { name: "c", ctrl: true }));
        });
      }
    );
    const rejectedCandidate = new LifecycleSession(
      "phase599-pending-rejected",
      () => Promise.reject(new Error("tui-pending-action-primary-phase599"))
    );
    const sessions = [initial, rejectedCandidate];
    const controller = await createController({
      input,
      output,
      sessionFactory: () => sessions.shift()!
    });

    await expect(controller.run()).resolves.toBeUndefined();

    expect(initial.stopCalls).toBe(1);
    expect(rejectedCandidate.stopCalls).toBe(1);
  });

  it("attempts every inactive session stop after the first synchronous failure", async () => {
    const firstStopPrimary = { kind: "tui-inactive-stop-primary-phase599" };
    const first = new LifecycleSession("phase599-inactive-first", async () => undefined, () => {
      throw firstStopPrimary;
    });
    const second = new LifecycleSession("phase599-inactive-second");
    const active = new LifecycleSession("phase599-active-third");
    const sessions = [first, second, active];
    const controller = await createController({
      output: new LifecycleOutput(),
      sessionFactory: () => sessions.shift()!
    });
    await controller.start();
    await controller.createLiveSession();
    await controller.createLiveSession();

    const caught = await captureRejection(controller.closeInactiveLiveSessions());

    expect(caught).toBe(firstStopPrimary);
    expect(first.stopCalls).toBe(1);
    expect(second.stopCalls).toBe(1);
    expect(active.stopCalls).toBe(0);

    await controller.stop().catch(() => undefined);
  });
});

async function createController(options: {
  input?: LifecycleInput;
  output: LifecycleOutput;
  sessionFactory: () => LifecycleSession;
}): Promise<TuiController> {
  const transcriptDir = await fs.mkdtemp(path.join(os.tmpdir(), "god-code-tui-phase599-"));
  tempDirs.push(transcriptDir);
  return new TuiController(transcriptDir, {
    input: options.input,
    output: options.output,
    transcriptDir,
    interactive: true,
    sessionFactory: () => options.sessionFactory(),
    now
  });
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject.");
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve(value?: T): void;
} {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value?: T) => resolvePromise(value as T)
  };
}
