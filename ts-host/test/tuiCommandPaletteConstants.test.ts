import { describe, expect, it } from "vitest";
import * as commandPaletteConstants from "../src/cli/tuiCommandPaletteConstants.js";
import * as tuiState from "../src/cli/tuiState.js";

describe("TUI command palette constants", () => {
  it("keeps the extracted constants module intentionally narrow", () => {
    expect(Object.keys(commandPaletteConstants)).toHaveLength(28);
    expect(commandPaletteConstants.LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_ADAPTIVE_WIDTH)
      .toBe(120);
    expect(commandPaletteConstants.LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_PROFILE_SHORTCUT)
      .toBe("`");
    expect(commandPaletteConstants.LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_SHORTCUT)
      .toBe(":");
    expect(commandPaletteConstants.LIVE_SESSION_COMMAND_LATEST_WIDTH_BUCKET_LABEL_VISIBILITY_SHORTCUT)
      .toBe("F2");
  });

  it("preserves every legacy tuiState export", () => {
    for (const [name, value] of Object.entries(commandPaletteConstants)) {
      expect(tuiState[name as keyof typeof tuiState], name).toBe(value);
    }
  });
});
