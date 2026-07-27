import { describe, expect, it } from "vitest";
import { TerminalRenderer } from "../src/rendering/terminalRenderer.js";

class RecordingOutput {
  public readonly chunks: string[] = [];

  public write(text: string): void {
    this.chunks.push(text);
  }

  public toString(): string {
    return this.chunks.join("");
  }
}

describe("TerminalRenderer", () => {
  it("prints assistant deltas immediately and avoids repeating the final message", () => {
    const output = new RecordingOutput();
    const renderer = new TerminalRenderer(output);

    renderer.onAssistantDelta("hel");
    renderer.onAssistantDelta("lo");
    renderer.onAssistantMessage({ role: "assistant", content: "hello" });
    renderer.finish();

    expect(output.toString()).toBe("hello\n");
  });

  it("resets streamed text when a tool call interrupts the current model round", () => {
    const output = new RecordingOutput();
    const renderer = new TerminalRenderer(output);

    renderer.onAssistantDelta("Planning");
    renderer.onToolCallRequested();
    renderer.onAssistantDelta("Done");
    renderer.onAssistantMessage({ role: "assistant", content: "Done reading." });
    renderer.finish();

    expect(output.toString()).toBe("Planning\nDone reading.\n");
  });

  it("prints the final assistant message when no delta was streamed", () => {
    const output = new RecordingOutput();
    const renderer = new TerminalRenderer(output);

    renderer.onAssistantMessage({ role: "assistant", content: "Final answer." });
    renderer.finish();

    expect(output.toString()).toBe("Final answer.\n");
  });
});
