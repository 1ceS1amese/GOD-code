import { describe, expect, it } from "vitest";
import { TUI_SCREEN_SEQUENCE, TuiScreen } from "../src/cli/tuiScreen.js";

class RecordingOutput {
  public readonly chunks: string[] = [];
  public readonly columns = 100;
  public readonly rows = 30;

  public write(text: string): void {
    this.chunks.push(text);
  }

  public toString(): string {
    return this.chunks.join("");
  }
}

describe("TuiScreen", () => {
  it("enters alternate screen, renders in place, and restores terminal state", () => {
    const output = new RecordingOutput();
    const screen = new TuiScreen(output);

    screen.start();
    screen.render("frame one\n");
    screen.stop();
    screen.stop();

    const text = output.toString();
    expect(text).toContain(TUI_SCREEN_SEQUENCE.enterAlternate);
    expect(text).toContain(TUI_SCREEN_SEQUENCE.hideCursor);
    expect(text).toContain(TUI_SCREEN_SEQUENCE.home + TUI_SCREEN_SEQUENCE.clear + "frame one\n");
    expect(text).toContain(TUI_SCREEN_SEQUENCE.showCursor + TUI_SCREEN_SEQUENCE.leaveAlternate);
    expect(text.match(/\x1b\[\?1049l/gu)).toHaveLength(1);
    expect(screen.isActive()).toBe(false);
  });

  it("suspends and resumes without marking the screen inactive", () => {
    const output = new RecordingOutput();
    const screen = new TuiScreen(output);

    screen.start();
    screen.suspend();
    screen.resume();

    expect(screen.isActive()).toBe(true);
    expect(output.toString()).toContain(TUI_SCREEN_SEQUENCE.showCursor + TUI_SCREEN_SEQUENCE.leaveAlternate);
    expect(output.toString()).toContain(TUI_SCREEN_SEQUENCE.enterAlternate + TUI_SCREEN_SEQUENCE.hideCursor);
  });

  it("reports terminal dimensions with defaults", () => {
    const output = new RecordingOutput();
    const screen = new TuiScreen(output);

    expect(screen.getDimensions()).toEqual({
      columns: 100,
      rows: 30
    });
  });
});
