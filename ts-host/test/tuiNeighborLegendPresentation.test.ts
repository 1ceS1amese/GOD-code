import { describe, expect, it } from "vitest";
import * as presentation from "../src/cli/tuiNeighborLegendPresentation.js";
import * as legacyTuiState from "../src/cli/tuiState.js";

describe("TUI neighbor legend presentation", () => {
  it("exports the complete forty-eight-member presentation family", () => {
    expect(Object.keys(presentation)).toHaveLength(48);
  });

  it("preserves adaptive legend and width metric boundaries", () => {
    expect(presentation.resolveLiveSessionCommandNeighborProgressBucketHelpLegendProfile("adaptive", 119))
      .toBe("compact");
    expect(presentation.resolveLiveSessionCommandNeighborProgressBucketHelpLegendProfile("adaptive", 120))
      .toBe("full");
    expect(presentation.liveSessionCommandNeighborProgressBucketHelpLegendThresholdDistance("adaptive", 80))
      .toBe(40);
    expect(presentation.liveSessionCommandNeighborProgressBucketHelpLegendThresholdDistance("full", 80))
      .toBeNull();
    expect(presentation.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentage(80)).toBe(66);
    expect(presentation.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucket(80)).toBe("H");
    expect(presentation.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabel(80))
      .toBe("high");
  });

  it("keeps representative shallow and deepest presentation output stable", () => {
    expect(
      presentation.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityIndicator(
        "adaptive",
        80,
        true
      )
    ).toBe("bucket_labels:adaptive>hidden+40[80/120=66%H(high)]@*");

    expect(
      presentation.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(
        80,
        true
      )
    ).toBe("80/120=66%H(high)");
  });

  it("preserves every tuiState compatibility export by reference", () => {
    for (const [exportName, value] of Object.entries(presentation)) {
      expect(legacyTuiState[exportName as keyof typeof legacyTuiState], exportName).toBe(value);
    }
  });
});
