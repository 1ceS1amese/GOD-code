import { describe, expect, it } from "vitest";
import {
  formatTuiWidthMetrics,
  tuiWidthPercentage,
  tuiWidthPercentageBucket,
  tuiWidthPercentageBucketLabel
} from "../src/cli/tuiWidthMetrics.js";
import {
  liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentage,
  liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucketLabel,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentage,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucket,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabel
} from "../src/cli/tuiState.js";

describe("TUI width metrics", () => {
  it("normalizes percentages and preserves bucket boundaries", () => {
    const cases = [
      [0, 0, "L"],
      [39, 32, "L"],
      [40, 33, "M"],
      [79, 65, "M"],
      [80, 66, "H"],
      [119, 99, "H"],
      [120, 100, "H"],
      [180, 100, "H"]
    ] as const;

    for (const [width, percentage, bucket] of cases) {
      expect(tuiWidthPercentage(width, 120)).toBe(percentage);
      expect(tuiWidthPercentageBucket(percentage)).toBe(bucket);
    }
  });

  it("maps bucket labels", () => {
    expect(tuiWidthPercentageBucketLabel("L")).toBe("low");
    expect(tuiWidthPercentageBucketLabel("M")).toBe("mid");
    expect(tuiWidthPercentageBucketLabel("H")).toBe("high");
  });

  it("formats visible and hidden labels while preserving real width", () => {
    expect(formatTuiWidthMetrics(119, 120)).toBe("119/120=99%H(high)");
    expect(formatTuiWidthMetrics(120, 120)).toBe("120/120=100%H(high)");
    expect(formatTuiWidthMetrics(180, 120)).toBe("180/120=100%H(high)");
    expect(formatTuiWidthMetrics(80, 120, false)).toBe("80/120=66%H");
  });

  it("exports compatibility accessors as direct root aliases", () => {
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentage)
      .toBe(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentage);
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucket)
      .toBe(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucket);
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucketLabel)
      .toBe(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabel);

    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucket(119)).toBe("H");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucketLabel(119)).toBe("high");
  });
});
