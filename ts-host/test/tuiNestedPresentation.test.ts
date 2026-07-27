import { describe, expect, it } from "vitest";
import * as presentation from "../src/cli/tuiNestedPresentation.js";
import * as legacyTuiState from "../src/cli/tuiState.js";

describe("TUI nested presentation", () => {
  it("exports the complete remaining nested/latest presentation surface", () => {
    expect(Object.keys(presentation)).toHaveLength(104);
  });

  it("preserves deepest nested profile and width boundaries", () => {
    expect(presentation.resolveLiveSessionCommandDeepestNestedBucketLabelVisibilityProfile("adaptive", 119))
      .toBe("hidden");
    expect(presentation.resolveLiveSessionCommandDeepestNestedBucketLabelVisibilityProfile("adaptive", 120))
      .toBe("shown");
    expect(presentation.liveSessionCommandDeepestNestedBucketLabelVisibilityThresholdDistance("adaptive", 80))
      .toBe(40);
    expect(presentation.liveSessionCommandDeepestNestedBucketLabelVisibilityWidthIndicator(80, true))
      .toBe("80/120=66%H(high)");
  });

  it("keeps representative deepest, latest, and F2 output stable", () => {
    expect(presentation.liveSessionCommandDeepestNestedBucketLabelIndicator("adaptive", 80, true))
      .toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+40[80/120=66%H(high)]@:");
    expect(presentation.liveSessionCommandDeepestNestedBucketLabelTextIndicator("adaptive", 80, true))
      .toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+40[80/120=66%H(high)]@,");
    expect(presentation.liveSessionCommandLatestDeepestBucketLabelTextIndicator("adaptive", 80, true))
      .toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+40[80/120=66%H(high)]@8");
    expect(presentation.liveSessionCommandLatestWidthBucketLabelVisibilityIndicator("adaptive", 80))
      .toBe("latest_width_bucket_label:adaptive>hidden+40[80/120=66%H(high)]@F2");
  });

  it("preserves every tuiState compatibility export by reference", () => {
    for (const [exportName, value] of Object.entries(presentation)) {
      expect(legacyTuiState[exportName as keyof typeof legacyTuiState], exportName).toBe(value);
    }
  });
});
