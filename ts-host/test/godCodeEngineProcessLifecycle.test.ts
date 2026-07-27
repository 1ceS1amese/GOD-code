import { EventEmitter } from "node:events";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GodCodeEngineProcess } from "../src/ipc/godCodeEngineProcess.js";
import type { JsonRpcPeer } from "../src/ipc/jsonRpc.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GodCodeEngineProcess terminal lifecycle", () => {
  it("memoizes stop while transferring process and turn state before shutdown settles", async () => {
    const shutdownGate = createDeferred<unknown>();
    const peer = createSyntheticPeer(() => shutdownGate.promise);
    const child = createSyntheticChild(() => child.emitExit(0, null));
    const engine = new GodCodeEngineProcess();
    const internals = installSyntheticGeneration(engine, child.child, peer.peer);
    const controller = new AbortController();
    internals.initialized = true;
    internals.turnAbortControllers.set("turn", controller);
    internals.turnInFlightRequests.set("turn", 1);
    internals.finishedTurnKeys.add("turn");
    internals.finalizedTurnKeys.set("turn", true);
    internals.turnEventSequences.set("turn", 1);
    let firstStop: Promise<void> | undefined;
    let secondStop: Promise<void> | undefined;

    try {
      firstStop = engine.stop();
      secondStop = engine.stop();
      await Promise.resolve();

      expect(secondStop).toBe(firstStop);
      expect(internals.child).toBeUndefined();
      expect(internals.peer).toBeUndefined();
      expect(internals.initialized).toBe(false);
      expect(controller.signal.aborted).toBe(true);
      expect(internals.turnAbortControllers.size).toBe(0);
      expect(internals.turnInFlightRequests.size).toBe(0);
      expect(internals.finishedTurnKeys.size).toBe(0);
      expect(internals.finalizedTurnKeys.size).toBe(0);
      expect(internals.turnEventSequences.size).toBe(0);
      expect(peer.request).toHaveBeenCalledTimes(1);

      shutdownGate.resolve({ status: "shutting_down" });
      await Promise.all([firstStop, secondStop]);
      expect(engine.stop()).toBe(firstStop);
      expect(child.stdinEnd).toHaveBeenCalledTimes(1);
      expect(peer.close).toHaveBeenCalledTimes(1);
    } finally {
      shutdownGate.resolve({ status: "shutting_down" });
      child.emitExit(0, null);
      await Promise.allSettled([
        ...(firstStop === undefined ? [] : [firstStop]),
        ...(secondStop === undefined ? [] : [secondStop])
      ]);
    }
  });

  it("bounds a permanently pending shutdown and observes its late rejection", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const shutdown = createDeferred<unknown>();
    const peer = createSyntheticPeer(() => shutdown.promise);
    const child = createSyntheticChild(() => child.emitExit(0, null));
    const engine = new GodCodeEngineProcess();
    installSyntheticGeneration(engine, child.child, peer.peer);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    const stop = engine.stop();
    let settled = false;
    void stop.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );

    try {
      await vi.advanceTimersByTimeAsync(4_999);
      expect(settled).toBe(false);
      expect(child.stdinEnd).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      await expect(stop).resolves.toBeUndefined();
      expect(child.stdinEnd).toHaveBeenCalledTimes(1);
      expect(peer.close).toHaveBeenCalledTimes(1);

      shutdown.reject(new Error("late engine shutdown rejection"));
      await vi.advanceTimersByTimeAsync(0);
      expect(unhandled).toEqual([]);
    } finally {
      shutdown.reject(new Error("final engine shutdown release"));
      child.emitExit(0, null);
      await vi.runAllTimersAsync();
      await Promise.allSettled([stop]);
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("waits for child exit after a graceful timeout sends SIGKILL", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const peer = createSyntheticPeer(async () => ({ status: "shutting_down" }));
    const child = createSyntheticChild();
    const engine = new GodCodeEngineProcess();
    installSyntheticGeneration(engine, child.child, peer.peer);
    const stop = engine.stop();
    let settled = false;
    void stop.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );

    try {
      await vi.advanceTimersByTimeAsync(2_000);
      expect(child.kill).toHaveBeenCalledTimes(1);
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");
      expect(settled).toBe(false);
      expect(peer.close).not.toHaveBeenCalled();

      child.emitExit(null, "SIGKILL");
      await expect(stop).resolves.toBeUndefined();
      expect(peer.close).toHaveBeenCalledTimes(1);
    } finally {
      child.emitExit(null, "SIGKILL");
      await vi.runAllTimersAsync();
      await Promise.allSettled([stop]);
    }
  });

  it("rejects a forced-exit timeout while retaining the terminal stop identity", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const peerFailure = new Error("injected engine peer close secondary");
    const peer = createSyntheticPeer(
      async () => ({ status: "shutting_down" }),
      () => {
        throw peerFailure;
      }
    );
    const child = createSyntheticChild();
    const engine = new GodCodeEngineProcess();
    installSyntheticGeneration(engine, child.child, peer.peer);
    const stop = engine.stop();
    const observedStop = stop.then(
      () => undefined,
      (error: unknown) => error
    );

    try {
      await vi.advanceTimersByTimeAsync(4_000);
      const failure = await observedStop;
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe(
        "GOD-code engine process did not exit after SIGKILL within 2000 ms."
      );
      expect(failure).not.toBe(peerFailure);
      expect(engine.stop()).toBe(stop);
      expect(child.kill).toHaveBeenCalledTimes(1);
      expect(peer.close).toHaveBeenCalledTimes(1);

      const startGeneration = vi.spyOn(
        engine as unknown as { startEngineProcessGeneration(): void },
        "startEngineProcessGeneration"
      );
      const restartFailure = await engine.start().then(
        () => undefined,
        (error: unknown) => error
      );
      expect(restartFailure).toBe(failure);
      expect(startGeneration).not.toHaveBeenCalled();
    } finally {
      child.emitExit(null, "SIGKILL");
      await vi.runAllTimersAsync();
      await observedStop;
    }
  });

  it("propagates peer close failure only after process exit succeeds", async () => {
    const peerFailure = new Error("injected engine peer close failure");
    const peer = createSyntheticPeer(
      async () => ({ status: "shutting_down" }),
      () => {
        throw peerFailure;
      }
    );
    const child = createSyntheticChild(() => child.emitExit(0, null));
    const engine = new GodCodeEngineProcess();
    installSyntheticGeneration(engine, child.child, peer.peer);

    const stop = engine.stop();
    await expect(stop).rejects.toBe(peerFailure);
    expect(engine.stop()).toBe(stop);
    expect(child.stdinEnd).toHaveBeenCalledTimes(1);
    expect(peer.close).toHaveBeenCalledTimes(1);
  });

  it("binds an exit callback to the peer from the child generation", async () => {
    const engine = new GodCodeEngineProcess();
    let originalPeer: JsonRpcPeer | undefined;
    let child: ChildProcessWithoutNullStreams | undefined;

    try {
      await engine.start();
      const internals = engine as unknown as {
        child?: ChildProcessWithoutNullStreams;
        peer?: JsonRpcPeer;
      };
      child = internals.child;
      originalPeer = internals.peer;
      if (!child || !originalPeer) {
        throw new Error("engine generation was not created");
      }
      const originalClose = vi.spyOn(originalPeer, "close");
      const replacementClose = vi.fn();
      internals.peer = {
        close: replacementClose
      } as unknown as JsonRpcPeer;

      child.emit("exit", 91, null);

      expect(originalClose).toHaveBeenCalledTimes(1);
      expect(replacementClose).not.toHaveBeenCalled();
      internals.peer = originalPeer;
    } finally {
      const internals = engine as unknown as { peer?: JsonRpcPeer };
      if (originalPeer) {
        internals.peer = originalPeer;
      }
      child?.kill("SIGTERM");
      await engine.stop().catch(() => undefined);
    }
  }, 10_000);

  it("memoizes concurrent start and creates a fresh lifecycle after normal stop", async () => {
    const engine = new GodCodeEngineProcess();
    let firstStart: Promise<void> | undefined;
    let secondStart: Promise<void> | undefined;
    let firstStop: Promise<void> | undefined;

    try {
      firstStart = engine.start();
      secondStart = engine.start();
      expect(secondStart).toBe(firstStart);
      await Promise.all([firstStart, secondStart]);

      firstStop = engine.stop();
      expect(engine.stop()).toBe(firstStop);
      await firstStop;
      expect(engine.stop()).toBe(firstStop);

      const restart = engine.start();
      expect(restart).not.toBe(firstStart);
      await restart;
      expect(engine.getLastExitInfo()).toBeUndefined();
      await engine.initialize({
        protocol_version: "2.0",
        host_info: { name: "phase592-test", version: "0.1.0" },
        capabilities: {}
      });
      const finalStop = engine.stop();
      expect(finalStop).not.toBe(firstStop);
      await finalStop;
    } finally {
      await Promise.allSettled([
        ...(firstStart === undefined ? [] : [firstStart]),
        ...(secondStart === undefined ? [] : [secondStart]),
        ...(firstStop === undefined ? [] : [firstStop])
      ]);
      await engine.stop().catch(() => undefined);
    }
  }, 15_000);
});

function createSyntheticPeer(
  requestImpl: () => Promise<unknown>,
  closeImpl: () => void = () => undefined
): {
  peer: JsonRpcPeer;
  request: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  let closed = false;
  const request = vi.fn(requestImpl);
  const close = vi.fn(() => {
    closed = true;
    closeImpl();
  });
  return {
    peer: {
      isClosed: () => closed,
      request,
      close
    } as unknown as JsonRpcPeer,
    request,
    close
  };
}

function createSyntheticChild(onStdinEnd: () => void = () => undefined): {
  child: ChildProcessWithoutNullStreams;
  stdinEnd: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  emitExit(code: number | null, signal: NodeJS.Signals | null): void;
} {
  const emitter = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    killed: boolean;
    stdin: {
      destroyed: boolean;
      writableEnded: boolean;
      end: ReturnType<typeof vi.fn>;
    };
    kill: ReturnType<typeof vi.fn>;
  };
  const stdinEnd = vi.fn(() => {
    emitter.stdin.writableEnded = true;
    onStdinEnd();
  });
  const kill = vi.fn(() => {
    emitter.killed = true;
    return true;
  });
  emitter.exitCode = null;
  emitter.killed = false;
  emitter.stdin = {
    destroyed: false,
    writableEnded: false,
    end: stdinEnd
  };
  emitter.kill = kill;

  return {
    child: emitter as unknown as ChildProcessWithoutNullStreams,
    stdinEnd,
    kill,
    emitExit(code, signal) {
      if (emitter.exitCode !== null) {
        return;
      }
      emitter.exitCode = code ?? 0;
      emitter.emit("exit", code, signal);
    }
  };
}

function installSyntheticGeneration(
  engine: GodCodeEngineProcess,
  child: ChildProcessWithoutNullStreams,
  peer: JsonRpcPeer
): {
  child?: ChildProcessWithoutNullStreams;
  peer?: JsonRpcPeer;
  initialized: boolean;
  turnAbortControllers: Map<string, AbortController>;
  turnInFlightRequests: Map<string, number>;
  finishedTurnKeys: Set<string>;
  finalizedTurnKeys: Map<string, true>;
  turnEventSequences: Map<string, number>;
} {
  const internals = engine as unknown as {
    child?: ChildProcessWithoutNullStreams;
    peer?: JsonRpcPeer;
    initialized: boolean;
    turnAbortControllers: Map<string, AbortController>;
    turnInFlightRequests: Map<string, number>;
    finishedTurnKeys: Set<string>;
    finalizedTurnKeys: Map<string, true>;
    turnEventSequences: Map<string, number>;
  };
  internals.child = child;
  internals.peer = peer;
  return internals;
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
} {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}
