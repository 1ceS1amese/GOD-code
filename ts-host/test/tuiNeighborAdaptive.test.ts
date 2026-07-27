import { describe, expect, it } from "vitest";
import * as neighborAdaptive from "../src/cli/tuiNeighborAdaptive.js";
import * as legacyTuiState from "../src/cli/tuiState.js";

describe("TUI neighbor adaptive helpers", () => {
  it("exports the complete twelve-helper foundation", () => {
    expect(Object.keys(neighborAdaptive)).toHaveLength(12);
    expect(neighborAdaptive.liveSessionCommandNeighborAdaptiveThresholds("dense"))
      .toEqual({ standard: 72, full: 112 });
    expect(neighborAdaptive.liveSessionCommandNeighborAdaptiveThresholds("balanced"))
      .toEqual({ standard: 88, full: 128 });
    expect(neighborAdaptive.liveSessionCommandNeighborAdaptiveThresholds("spacious"))
      .toEqual({ standard: 104, full: 144 });
  });

  it("caps preferred visibility at each configured width boundary", () => {
    const resolve = neighborAdaptive.resolveLiveSessionCommandNeighborVisibilityProfile;

    expect(resolve("full", 87)).toBe("compact");
    expect(resolve("full", 88)).toBe("standard");
    expect(resolve("full", 127)).toBe("standard");
    expect(resolve("full", 128)).toBe("full");
    expect(resolve("standard", 200)).toBe("standard");
    expect(resolve("compact", 200)).toBe("compact");
    expect(resolve("full", 72, "dense")).toBe("standard");
  });

  it("reports target, distance, progress, buckets, and compact help consistently", () => {
    const {
      liveSessionCommandNeighborAdaptiveThresholdDistance: distance,
      liveSessionCommandNeighborAdaptiveThresholdTarget: target,
      liveSessionCommandNeighborAdaptiveThresholdProgress: progress,
      liveSessionCommandNeighborAdaptiveThresholdProgressBucket: bucket
    } = neighborAdaptive;

    expect(target("compact", 80, "balanced")).toBe("standard");
    expect(distance("compact", 80, "balanced")).toBe(8);
    expect(progress("compact", 44, "balanced")).toBe(50);
    expect(target("standard", 100, "balanced")).toBe("full");
    expect(distance("standard", 100, "balanced")).toBe(28);
    expect(progress("standard", 108, "balanced")).toBe(50);
    expect(progress("full", 200, "balanced")).toBeNull();
    expect([bucket(32), bucket(33), bucket(65), bucket(66)]).toEqual(["L", "M", "M", "H"]);
    expect(neighborAdaptive.liveSessionCommandNeighborProgressBucketHelpCompactIndicator(true)).toBe("bucket:on@|");
    expect(neighborAdaptive.liveSessionCommandNeighborProgressBucketHelpCompactLegend())
      .toBe(" bucket:L/M/H=low/mid/high");
  });

  it("preserves every tuiState compatibility export by reference", () => {
    for (const [exportName, value] of Object.entries(neighborAdaptive)) {
      expect(legacyTuiState[exportName as keyof typeof legacyTuiState], exportName).toBe(value);
    }
  });
});
