import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreparedGodCodeHost } from "../src/headless/godCodeHostSetup.js";
import type { HostToolRegistry } from "../src/host_tools/registry.js";
import type { ToolCatalogEntry } from "../src/types/godCodeProtocol.js";

const hostSetupMocks = vi.hoisted(() => ({
  prepareGodCodeHost: vi.fn()
}));

vi.mock("../src/headless/godCodeHostSetup.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../src/headless/godCodeHostSetup.js")
  >();
  return {
    ...actual,
    prepareGodCodeHost: hostSetupMocks.prepareGodCodeHost
  };
});

import { listHostTools } from "../src/cli/tools.js";

beforeEach(() => {
  hostSetupMocks.prepareGodCodeHost.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CLI tools prepared host cleanup lifecycle", () => {
  it("returns the original tool catalog after successful cleanup", async () => {
    const tools = createTools(2);
    const close = vi.fn().mockResolvedValue(undefined);
    hostSetupMocks.prepareGodCodeHost.mockResolvedValue(createPreparedHost(tools, close));

    const result = await listHostTools();

    expect(result).toBe(tools);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("projects a fixed error when prepared host cleanup rejects", async () => {
    const cleanupSecondary = new Error("injected tools host cleanup secondary");
    const close = vi.fn().mockRejectedValue(cleanupSecondary);
    hostSetupMocks.prepareGodCodeHost.mockResolvedValue(
      createPreparedHost(createTools(3), close)
    );

    const failure = await captureFailure(listHostTools());

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("tool catalog loaded but host cleanup failed");
    expect((failure as Error).message).not.toContain(cleanupSecondary.message);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("normalizes a synchronous prepared host close throw", async () => {
    const cleanupSecondary = new Error("injected synchronous tools cleanup secondary");
    const close = vi.fn(() => {
      throw cleanupSecondary;
    });
    hostSetupMocks.prepareGodCodeHost.mockResolvedValue(
      createPreparedHost(createTools(4), close)
    );

    const failure = await captureFailure(listHostTools());

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("tool catalog loaded but host cleanup failed");
    expect((failure as Error).message).not.toContain(cleanupSecondary.message);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("preserves a tool catalog primary across prepared host cleanup failure", async () => {
    const catalogPrimary = new Error("injected CLI tools catalog primary");
    const cleanupSecondary = new Error("injected CLI tools cleanup replacement");
    const close = vi.fn().mockRejectedValue(cleanupSecondary);
    const host = createPreparedHost(createTools(0), close);
    Object.defineProperty(host, "toolCatalog", {
      configurable: true,
      get() {
        throw catalogPrimary;
      }
    });
    hostSetupMocks.prepareGodCodeHost.mockResolvedValue(host);

    const failure = await captureFailure(listHostTools());

    expect(failure).toBe(catalogPrimary);
    expect(close).toHaveBeenCalledTimes(1);
  });
});

function createTools(count: number): ToolCatalogEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `TestTool${index}`,
    description: "test tool",
    input_schema: { type: "object" }
  }));
}

function createPreparedHost(
  toolCatalog: ToolCatalogEntry[],
  close: () => Promise<void>
): PreparedGodCodeHost {
  return {
    registry: {} as HostToolRegistry,
    toolCatalog,
    initialMessages: [],
    close
  };
}

async function captureFailure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to fail.");
}
