import { describe, expect, it, vi } from "vitest";
import {
  formatTuiAdaptiveVisibilityIndicator,
  resolveTuiAdaptiveVisibilityProfile,
  tuiAdaptiveVisibilityThresholdDistance
} from "../src/cli/tuiAdaptiveVisibility.js";

describe("TUI adaptive visibility formatter", () => {
  it("resolves explicit and adaptive profiles at the threshold", () => {
    expect(resolveTuiAdaptiveVisibilityProfile("shown", 80, 120)).toBe("shown");
    expect(resolveTuiAdaptiveVisibilityProfile("hidden", 180, 120)).toBe("hidden");
    expect(resolveTuiAdaptiveVisibilityProfile("adaptive", 119, 120)).toBe("hidden");
    expect(resolveTuiAdaptiveVisibilityProfile("adaptive", 120, 120)).toBe("shown");
  });

  it("reports distance only while adaptive width is below threshold", () => {
    expect(tuiAdaptiveVisibilityThresholdDistance("adaptive", 80, 120)).toBe(40);
    expect(tuiAdaptiveVisibilityThresholdDistance("adaptive", 119, 120)).toBe(1);
    expect(tuiAdaptiveVisibilityThresholdDistance("adaptive", 120, 120)).toBeNull();
    expect(tuiAdaptiveVisibilityThresholdDistance("shown", 80, 120)).toBeNull();
    expect(tuiAdaptiveVisibilityThresholdDistance("compact", 80, 120)).toBeNull();
  });

  it("formats adaptive details and skips width work for explicit profiles", () => {
    const widthIndicator = vi.fn(() => "119/120=99%H(high)");
    expect(formatTuiAdaptiveVisibilityIndicator({
      name: "demo",
      profile: "adaptive",
      maxWidth: 119,
      threshold: 120,
      shortcut: "F2",
      widthIndicator
    })).toBe("demo:adaptive>hidden+1[119/120=99%H(high)]@F2");
    expect(widthIndicator).toHaveBeenCalledOnce();

    widthIndicator.mockClear();
    expect(formatTuiAdaptiveVisibilityIndicator({
      name: "demo",
      profile: "shown",
      maxWidth: 80,
      threshold: 120,
      shortcut: "F2",
      widthIndicator
    })).toBe("demo:shown@F2");
    expect(widthIndicator).not.toHaveBeenCalled();
  });

  it("accepts explicit effective profiles for non-visibility adaptive domains", () => {
    expect(formatTuiAdaptiveVisibilityIndicator({
      name: "legend",
      profile: "adaptive",
      maxWidth: 119,
      threshold: 120,
      shortcut: "`",
      widthIndicator: () => "119/120=99%H(high)",
      effectiveProfile: "compact",
      thresholdDistance: 1
    })).toBe("legend:adaptive>compact+1[119/120=99%H(high)]@`");

    expect(formatTuiAdaptiveVisibilityIndicator({
      name: "legend",
      profile: "adaptive",
      maxWidth: 120,
      threshold: 120,
      shortcut: "`",
      widthIndicator: () => "120/120=100%H(high)",
      effectiveProfile: "full",
      thresholdDistance: null
    })).toBe("legend:adaptive>full[120/120=100%H(high)]@`");
  });
});
