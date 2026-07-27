import { describe, expect, it } from "vitest";
import { runTuiPtySmoke } from "../src/cli/tuiPtySmoke.js";
import { TUI_SCREEN_SEQUENCE } from "../src/cli/tuiScreen.js";

class RecordingOutput {
  public readonly chunks: string[] = [];
  public readonly isTTY = true;
  public readonly columns = 72;
  public readonly rows = 20;

  public write(text: string): void {
    this.chunks.push(text);
  }

  public toString(): string {
    return this.chunks.join("");
  }
}

describe("TUI PTY smoke harness", () => {
  it("renders a deterministic frame through the screen lifecycle", () => {
    const output = new RecordingOutput();
    const result = runTuiPtySmoke({
      output,
      now: () => "2026-07-06T00:00:00.000Z"
    });

    const text = output.toString();
    expect(result).toMatchObject({
      status: "passed",
      dimensions: {
        columns: 72,
        rows: 20
      }
    });
    expect(result.renderedLines).toBeGreaterThan(0);
    expect(text).toContain(TUI_SCREEN_SEQUENCE.enterAlternate);
    expect(text).toContain(TUI_SCREEN_SEQUENCE.hideCursor);
    expect(text).toContain(TUI_SCREEN_SEQUENCE.home + TUI_SCREEN_SEQUENCE.clear);
    expect(text).toContain("GOD-code");
    expect(text).toContain("tui-smoke-session");
    expect(text).toContain("TUI PTY smoke event");
    expect(text).toContain(TUI_SCREEN_SEQUENCE.showCursor + TUI_SCREEN_SEQUENCE.leaveAlternate);
  });

  it("skips when TTY output is required but unavailable", () => {
    const output = new RecordingOutput();
    Object.defineProperty(output, "isTTY", { value: false });

    const result = runTuiPtySmoke({ output });

    expect(result).toMatchObject({
      status: "skipped",
      reason: "TUI PTY smoke requires TTY output.",
      renderedLines: 0
    });
    expect(output.toString()).toBe("");
  });
});
