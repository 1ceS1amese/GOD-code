import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { TuiController, type TuiSessionLike } from "../src/cli/tuiSession.js";
import { mapKeypressToTuiAction, mapLineToTuiAction } from "../src/cli/tuiInput.js";
import { buildTuiDebugLines } from "../src/cli/tuiDebug.js";
import { buildTuiHelpLines } from "../src/cli/tuiHelp.js";
import { renderTuiFrame } from "../src/cli/tuiRenderer.js";
import {
  createInitialTuiState,
  createTuiEvent,
  liveSessionCommandDeepestNestedBucketLabelIndicator,
  liveSessionCommandDeepestNestedBucketLabelTextIndicator,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityThresholdDistance,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthIndicator,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentage,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucket,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabel,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityIndicator,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator,
  liveSessionCommandLatestDeepestBucketLabelVisibilityThresholdDistance,
  liveSessionCommandLatestDeepestBucketLabelVisibilityWidthIndicator,
  liveSessionCommandLatestDeepestBucketLabelTextIndicator,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityThresholdDistance,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthIndicator,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentage,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucket,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabel,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelIndicator,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandLatestWidthBucketLabelVisibilityIndicator,
  liveSessionCommandLatestWidthBucketLabelVisibilityThresholdDistance,
  liveSessionCommandLatestWidthBucketLabelVisibilityWidthIndicator,
  liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentage,
  liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentageBucketLabel,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel,
  resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityProfile,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile,
  liveSessionCommandDeepestNestedBucketLabelVisibilityThresholdDistance,
  liveSessionCommandDeepestNestedBucketLabelVisibilityWidthIndicator,
  liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentage,
  liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucketLabel,
  liveSessionCommandNeighborAdaptiveThresholdDistance,
  liveSessionCommandNeighborAdaptiveThresholdLabel,
  liveSessionCommandNeighborAdaptiveThresholdProgress,
  liveSessionCommandNeighborAdaptiveThresholdProgressBucket,
  liveSessionCommandNeighborAdaptiveThresholdProgressBucketLabel,
  liveSessionCommandNeighborAdaptiveThresholdTarget,
  liveSessionCommandNeighborProgressBucketHelpCompactIndicator,
  liveSessionCommandNeighborProgressBucketHelpCompactLegend,
  liveSessionCommandNeighborProgressBucketHelpLegend,
  liveSessionCommandNeighborProgressBucketHelpLegendProfileIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendThresholdDistance,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentage,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucket,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabel,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityThresholdDistance,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthIndicator,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucket,
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel,
  liveSessionCommandNeighborProgressBucketHelpIndicator,
  liveSessionCommandNeighborProgressBucketHelpStatusLabel,
  liveSessionCommandNeighborAdaptiveThresholds,
  reduceTuiState,
  resolveLiveSessionCommandDeepestNestedBucketLabelVisibilityProfile,
  resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityProfile,
  resolveLiveSessionCommandNeighborProgressBucketHelpLegendProfile,
  resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile,
  resolveLiveSessionCommandNeighborVisibilityProfile,
  tuiActionForLiveSessionCommand
} from "../src/cli/tuiState.js";
import type { GodCodeEventEnvelope, TurnResult } from "../src/types/godCodeProtocol.js";

const tempDirs: string[] = [];
const now = () => "2026-07-06T00:00:00.000Z";

class RecordingOutput {
  public readonly chunks: string[] = [];
  public readonly isTTY = true;
  public readonly columns = 80;
  public readonly rows = 24;

  public write(text: string): void {
    this.chunks.push(text);
  }

  public toString(): string {
    return this.chunks.join("");
  }
}

class FakeTuiSession implements TuiSessionLike {
  public started = false;
  public stopped = false;
  public cancelled = false;
  public readonly prompts: string[] = [];

  public constructor(
    private readonly callbacks: { onEvent(event: GodCodeEventEnvelope): void },
    private readonly result: TurnResult = { status: "success", messages: [] },
    private readonly sessionId = "fake-session"
  ) {}

  public async start(): Promise<void> {
    this.started = true;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public emit(event: GodCodeEventEnvelope): void {
    this.callbacks.onEvent(event);
  }

  public async submit(prompt: string): Promise<TurnResult> {
    this.prompts.push(prompt);
    this.callbacks.onEvent({
      event_type: "assistant_delta",
      session_id: this.sessionId,
      turn_id: "turn",
      sequence: 1,
      timestamp: now(),
      payload: {
        delta: {
          text: "fake "
        }
      }
    });
    this.callbacks.onEvent({
      event_type: "assistant_delta",
      session_id: this.sessionId,
      turn_id: "turn",
      sequence: 2,
      timestamp: now(),
      payload: {
        delta: {
          text: "response"
        }
      }
    });
    this.callbacks.onEvent({
      event_type: "assistant_message",
      session_id: this.sessionId,
      turn_id: "turn",
      sequence: 3,
      timestamp: now(),
      payload: {
        message: {
          role: "assistant",
          content: "fake response"
        }
      }
    });
    return this.result;
  }

  public async cancelCurrentTurn(): Promise<boolean> {
    this.cancelled = true;
    return true;
  }

  public async stop(): Promise<void> {
    this.stopped = true;
  }
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "god-code-tui-"));
  tempDirs.push(dir);
  return dir;
}

async function writeTranscript(transcriptDir: string, sessionId: string): Promise<void> {
  await fs.mkdir(transcriptDir, { recursive: true });
  const entries = [
    {
      session_id: sessionId,
      turn_id: "turn-1",
      type: "user",
      timestamp: "2026-07-06T00:00:00.000Z",
      payload: {
        message: {
          role: "user",
          content: "read fixture"
        }
      }
    },
    {
      session_id: sessionId,
      turn_id: "turn-1",
      type: "assistant_message",
      timestamp: "2026-07-06T00:00:01.000Z",
      payload: {
        message: {
          role: "assistant",
          content: "done"
        }
      }
    }
  ];
  await fs.writeFile(
    path.join(transcriptDir, `${sessionId}.jsonl`),
    `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8"
  );
}

describe("TUI state reducer", () => {
  it("moves through idle, running, finished, cancel, and exit states", () => {
    let state = createInitialTuiState(now);

    state = reduceTuiState(state, { type: "session_started", sessionId: "s1" });
    expect(state.status).toBe("idle");
    expect(state.sessionId).toBe("s1");

    state = reduceTuiState(state, { type: "append_prompt", text: "hello" });
    state = reduceTuiState(state, { type: "submit_prompt" });
    expect(state.status).toBe("running");
    expect(state.submitRequested).toBe("hello");

    state = reduceTuiState(state, { type: "request_cancel" });
    expect(state.status).toBe("stopping");
    expect(state.cancelRequested).toBe(true);

    state = reduceTuiState(state, { type: "turn_finished", status: "cancelled" });
    expect(state.status).toBe("idle");

    state = reduceTuiState(state, { type: "request_exit" });
    expect(state.exitRequested).toBe(true);
    expect(state.status).toBe("stopped");
  });

  it("shows approval modal and blocks prompt editing until hidden", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "s1" });
    state = reduceTuiState(state, {
      type: "show_approval_modal",
      modal: {
        toolName: "Write",
        reason: "Write modifies files.",
        cwd: "/workspace",
        sessionId: "s1",
        turnId: "t1",
        toolCallId: "tc1",
        inputLines: [{ label: "path", value: "demo.txt" }],
        truncated: false,
        redacted: true
      }
    });

    state = reduceTuiState(state, { type: "append_prompt", text: "blocked" });
    expect(state.promptBuffer).toBe("");
    expect(state.approvalModal?.toolName).toBe("Write");

    state = reduceTuiState(state, { type: "hide_approval_modal" });
    state = reduceTuiState(state, { type: "append_prompt", text: "allowed" });
    expect(state.promptBuffer).toBe("allowed");
  });

  it("keeps history selection bounded", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, {
      type: "set_history",
      history: [
        { sessionId: "a", firstPrompt: "first", lastTimestamp: now(), entryCount: 1, turnCount: 1 },
        { sessionId: "b", firstPrompt: "second", lastTimestamp: now(), entryCount: 1, turnCount: 1 }
      ]
    });

    state = reduceTuiState(state, { type: "select_history", direction: 1 });
    state = reduceTuiState(state, { type: "select_history", direction: 1 });
    expect(state.selectedHistoryIndex).toBe(1);

    state = reduceTuiState(state, { type: "select_history", direction: -1 });
    state = reduceTuiState(state, { type: "select_history", direction: -1 });
    expect(state.selectedHistoryIndex).toBe(0);
  });

  it("activates the selected history session as the viewed session", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, {
      type: "set_history",
      history: [
        { sessionId: "a", firstPrompt: "first", lastTimestamp: now(), entryCount: 1, turnCount: 1 },
        { sessionId: "b", firstPrompt: "second", lastTimestamp: now(), entryCount: 1, turnCount: 1 }
      ]
    });
    state = reduceTuiState(state, { type: "select_history", direction: 1 });
    state = reduceTuiState(state, { type: "activate_history_session" });

    expect(state.viewedSessionId).toBe("b");
    expect(state.activePane).toBe("timeline");
    expect(state.timelineScrollOffset).toBe(0);
  });

  it("registers and switches live TUI sessions", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, {
      type: "append_event",
      event: createTuiEvent("system", "live-1 event", now)
    });
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-2" });
    state = reduceTuiState(state, {
      type: "append_event",
      event: createTuiEvent("system", "live-2 event", now)
    });
    state = reduceTuiState(state, {
      type: "append_event",
      sessionId: "live-1",
      event: createTuiEvent("system", "live-1 background event", now)
    });

    expect(state.liveSessions.map((session) => session.sessionId)).toEqual(["live-1", "live-2"]);
    expect(state.liveSessions.map((session) => session.status)).toEqual(["idle", "idle"]);
    expect(state.sessionId).toBe("live-2");
    expect(state.activeLiveSessionIndex).toBe(1);
    expect(state.selectedLiveSessionIndex).toBe(1);
    expect(state.events.map((event) => event.text)).toEqual(["live-2 event"]);
    expect(state.eventsBySessionId["live-1"]?.map((event) => event.text)).toContain("live-1 background event");
    expect(state.liveSessions[0]?.unreadCount).toBe(1);
    expect(state.liveSessions[1]?.unreadCount).toBe(0);

    state = reduceTuiState(state, { type: "switch_live_session", direction: -1 });
    expect(state.sessionId).toBe("live-1");
    expect(state.activeLiveSessionIndex).toBe(0);
    expect(state.selectedLiveSessionIndex).toBe(0);
    expect(state.liveSessions[0]?.unreadCount).toBe(0);
    expect(state.events.map((event) => event.text)).toContain("live-1 background event");
    expect(state.events.map((event) => event.text)).not.toContain("live-2 event");

    state = reduceTuiState(state, { type: "select_live_session", direction: 1 });
    expect(state.selectedLiveSessionIndex).toBe(1);
    state = reduceTuiState(state, { type: "activate_live_session" });
    expect(state.sessionId).toBe("live-2");
    expect(state.activeLiveSessionIndex).toBe(1);

    state = reduceTuiState(state, { type: "append_prompt", text: "running prompt" });
    state = reduceTuiState(state, { type: "submit_prompt" });
    expect(state.liveSessions[1]?.status).toBe("running");
    state = reduceTuiState(state, { type: "switch_live_session", direction: -1 });
    expect(state.sessionId).toBe("live-2");
    state = reduceTuiState(state, { type: "turn_finished", status: "success" });
    expect(state.liveSessions[1]?.status).toBe("idle");
  });

  it("closes selected idle live sessions and preserves the fallback active session", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, {
      type: "append_event",
      event: createTuiEvent("system", "live-1 event", now)
    });
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-2" });
    state = reduceTuiState(state, {
      type: "append_event",
      event: createTuiEvent("system", "live-2 event", now)
    });
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-3" });
    state = reduceTuiState(state, { type: "select_live_session", direction: -1 });
    state = reduceTuiState(state, { type: "close_live_session" });

    expect(state.liveSessions.map((session) => session.sessionId)).toEqual(["live-1", "live-3"]);
    expect(state.sessionId).toBe("live-3");
    expect(state.activeLiveSessionIndex).toBe(1);
    expect(state.selectedLiveSessionIndex).toBe(1);
    expect(state.eventsBySessionId["live-2"]).toBeUndefined();

    state = reduceTuiState(state, { type: "close_live_session" });
    expect(state.liveSessions.map((session) => session.sessionId)).toEqual(["live-1"]);
    expect(state.sessionId).toBe("live-1");
    expect(state.activeLiveSessionIndex).toBe(0);
    expect(state.selectedLiveSessionIndex).toBe(0);
    expect(state.events.map((event) => event.text)).toContain("live-1 event");
    expect(state.eventsBySessionId["live-3"]).toBeUndefined();

    const unchanged = reduceTuiState(state, { type: "close_live_session" });
    expect(unchanged).toBe(state);
  });

  it("pins selected live sessions to the top without changing active identity", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-2" });
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-3" });

    state = reduceTuiState(state, { type: "select_live_session", direction: -1 });
    state = reduceTuiState(state, { type: "toggle_live_session_pin" });

    expect(state.liveSessions.map((session) => `${session.sessionId}:${session.pinned}`)).toEqual([
      "live-2:true",
      "live-1:false",
      "live-3:false"
    ]);
    expect(state.sessionId).toBe("live-3");
    expect(state.activeLiveSessionIndex).toBe(2);
    expect(state.selectedLiveSessionIndex).toBe(0);

    state = reduceTuiState(state, { type: "toggle_live_session_pin" });
    expect(state.liveSessions.map((session) => `${session.sessionId}:${session.pinned}`)).toEqual([
      "live-2:false",
      "live-1:false",
      "live-3:false"
    ]);
    expect(state.activeLiveSessionIndex).toBe(2);
  });

  it("renames selected live sessions without changing session identity", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-2" });
    state = reduceTuiState(state, { type: "select_live_session", direction: -1 });
    state = reduceTuiState(state, { type: "append_prompt", text: "  research   worker  " });
    state = reduceTuiState(state, { type: "rename_live_session" });

    expect(state.liveSessions.map((session) => `${session.sessionId}:${session.displayName ?? "-"}`)).toEqual([
      "live-1:research worker",
      "live-2:-"
    ]);
    expect(state.sessionId).toBe("live-2");
    expect(state.activeLiveSessionIndex).toBe(1);
    expect(state.selectedLiveSessionIndex).toBe(0);
    expect(state.promptBuffer).toBe("");

    state = reduceTuiState(state, { type: "rename_live_session", label: "active runner" });
    expect(state.liveSessions[0]?.displayName).toBe("active runner");
    expect(state.liveSessions[0]?.sessionId).toBe("live-1");
  });

  it("filters live sessions by prompt text and keeps selection within visible rows", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "alpha" });
    state = reduceTuiState(state, { type: "session_started", sessionId: "beta" });
    state = reduceTuiState(state, { type: "rename_live_session", label: "worker beta" });
    state = reduceTuiState(state, { type: "session_started", sessionId: "gamma" });
    state = reduceTuiState(state, { type: "append_prompt", text: "worker" });
    state = reduceTuiState(state, { type: "set_live_session_filter" });

    expect(state.liveSessionFilter).toBe("worker");
    expect(state.promptBuffer).toBe("");
    expect(state.selectedLiveSessionIndex).toBe(1);

    state = reduceTuiState(state, { type: "select_live_session", direction: 1 });
    expect(state.selectedLiveSessionIndex).toBe(1);

    state = reduceTuiState(state, { type: "clear_live_session_filter" });
    expect(state.liveSessionFilter).toBe("");
    state = reduceTuiState(state, { type: "select_live_session", direction: 1 });
    expect(state.selectedLiveSessionIndex).toBe(2);
  });

  it("cycles live session sort modes and moves selection through sorted visible rows", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "zeta" });
    state = reduceTuiState(state, { type: "session_started", sessionId: "alpha" });
    state = reduceTuiState(state, { type: "rename_live_session", label: "Alpha worker" });
    state = reduceTuiState(state, { type: "session_started", sessionId: "middle" });

    expect(state.liveSessionSortMode).toBe("manual");
    state = reduceTuiState(state, { type: "cycle_live_session_sort_mode" });
    expect(state.liveSessionSortMode).toBe("name");
    expect(state.selectedLiveSessionIndex).toBe(2);

    state = reduceTuiState(state, { type: "select_live_session", direction: -1 });
    expect(state.selectedLiveSessionIndex).toBe(1);
    state = reduceTuiState(state, { type: "select_live_session", direction: 1 });
    expect(state.selectedLiveSessionIndex).toBe(2);
    state = reduceTuiState(state, { type: "select_live_session", direction: 1 });
    expect(state.selectedLiveSessionIndex).toBe(0);

    state = reduceTuiState(state, { type: "cycle_live_session_sort_mode" });
    expect(state.liveSessionSortMode).toBe("status");
    state = reduceTuiState(state, { type: "cycle_live_session_sort_mode" });
    expect(state.liveSessionSortMode).toBe("unread");
    state = reduceTuiState(state, { type: "cycle_live_session_sort_mode" });
    expect(state.liveSessionSortMode).toBe("manual");
  });

  it("applies live session bulk actions without changing the active identity", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-2" });
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-3" });
    state = reduceTuiState(state, { type: "select_live_session", direction: -1 });
    state = reduceTuiState(state, { type: "toggle_live_session_pin" });
    state = reduceTuiState(state, {
      type: "append_event",
      sessionId: "live-1",
      event: createTuiEvent("system", "background live-1", now)
    });
    state = reduceTuiState(state, {
      type: "append_event",
      sessionId: "live-2",
      event: createTuiEvent("system", "background live-2", now)
    });

    expect(state.sessionId).toBe("live-3");
    expect(state.liveSessions.some((session) => session.pinned)).toBe(true);
    expect(state.liveSessions.filter((session) => session.unreadCount > 0).map((session) => session.sessionId)).toEqual([
      "live-2",
      "live-1"
    ]);

    state = reduceTuiState(state, { type: "clear_all_live_session_unread" });
    expect(state.liveSessions.map((session) => session.unreadCount)).toEqual([0, 0, 0]);

    state = reduceTuiState(state, { type: "unpin_all_live_sessions" });
    expect(state.liveSessions.map((session) => `${session.sessionId}:${session.pinned}`)).toEqual([
      "live-2:false",
      "live-1:false",
      "live-3:false"
    ]);
    expect(state.sessionId).toBe("live-3");
    expect(state.activeLiveSessionIndex).toBe(2);

    state = reduceTuiState(state, { type: "close_inactive_live_sessions" });
    expect(state.liveSessions.map((session) => session.sessionId)).toEqual(["live-3"]);
    expect(state.sessionId).toBe("live-3");
    expect(state.activeLiveSessionIndex).toBe(0);
    expect(state.selectedLiveSessionIndex).toBe(0);
    expect(state.eventsBySessionId["live-1"]).toBeUndefined();
    expect(state.eventsBySessionId["live-2"]).toBeUndefined();
  });

  it("opens and navigates the live session command palette", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });

    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.activePane).toBe("live");
    expect(state.liveSessionCommandPaletteVisible).toBe(true);
    expect(state.selectedLiveSessionCommandIndex).toBe(0);

    state = reduceTuiState(state, { type: "select_live_session_command", direction: 1 });
    state = reduceTuiState(state, { type: "select_live_session_command", direction: 1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(2);

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    expect(state.liveSessionCommandPaletteVisible).toBe(false);

    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, { type: "toggle_live_session_pin" });
    expect(state.liveSessionCommandPaletteVisible).toBe(false);
  });

  it("filters live session command palette entries by local search", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });

    state = reduceTuiState(state, { type: "append_live_session_command_search", text: "unpin all" });
    expect(state.liveSessionCommandSearch).toBe("unpin all");
    expect(state.selectedLiveSessionCommandIndex).toBe(7);

    state = reduceTuiState(state, { type: "backspace_live_session_command_search" });
    expect(state.liveSessionCommandSearch).toBe("unpin al");

    state = reduceTuiState(state, { type: "clear_live_session_command_search" });
    expect(state.liveSessionCommandSearch).toBe("");
    expect(state.selectedLiveSessionCommandIndex).toBe(0);
  });

  it("keeps selected palette commands visible and pages by visible command index", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });

    for (let step = 0; step < 3; step += 1) {
      state = reduceTuiState(state, { type: "select_live_session_command", direction: 1 });
    }
    expect(state.selectedLiveSessionCommandIndex).toBe(3);
    expect(state.liveSessionCommandScrollOffset).toBe(0);
    const followedSelectionFrame = renderTuiFrame(state, { columns: 170, rows: 12 });
    expect(followedSelectionFrame).toContain("command:4/9");
    expect(followedSelectionFrame).toContain("scroll:<3-4/9>");
    expect(followedSelectionFrame).toContain("-- view commands --");
    expect(followedSelectionFrame).toContain("> 4 [view] Cycle sort mode");
    expect(followedSelectionFrame).not.toContain("> 1 [session] Activate selected session");

    state = reduceTuiState(state, { type: "scroll_live_session_command_palette", direction: 1, amount: 5 });
    expect(state.selectedLiveSessionCommandIndex).toBe(8);
    expect(state.liveSessionCommandScrollOffset).toBe(8);
    const pagedDownFrame = renderTuiFrame(state, { columns: 170, rows: 12 });
    expect(pagedDownFrame).toContain("command:9/9");
    expect(pagedDownFrame).toContain("scroll:<9-9/9");
    expect(pagedDownFrame).toContain("-- bulk commands --");
    expect(pagedDownFrame).toContain("> A [bulk] Mark all sessions read");

    state = reduceTuiState(state, { type: "scroll_live_session_command_palette", direction: -1, amount: 5 });
    expect(state.selectedLiveSessionCommandIndex).toBe(3);
    expect(state.liveSessionCommandScrollOffset).toBe(3);
    const pagedUpFrame = renderTuiFrame(state, { columns: 170, rows: 12 });
    expect(pagedUpFrame).toContain("scroll:<4-6/9>");
    expect(pagedUpFrame).toContain("> 4 [view] Cycle sort mode");

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "scroll_live_session_command_palette", direction: 1, amount: 5 });
    expect(state.liveSessionCommandScrollOffset).toBe(3);
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandScrollOffset).toBe(0);
  });

  it("cycles command palette page sizes and uses them for paging", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "cycle_live_session_command_page_size" });
    expect(state.liveSessionCommandPageSize).toBe(5);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });

    state = reduceTuiState(state, { type: "scroll_live_session_command_palette", direction: 1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(5);
    expect(state.liveSessionCommandScrollOffset).toBe(5);

    state = reduceTuiState(state, { type: "cycle_live_session_command_page_size" });
    expect(state.liveSessionCommandPageSize).toBe(7);
    state = reduceTuiState(state, { type: "scroll_live_session_command_palette", direction: -1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(0);

    state = reduceTuiState(state, { type: "cycle_live_session_command_page_size" });
    expect(state.liveSessionCommandPageSize).toBe(3);
    state = reduceTuiState(state, { type: "scroll_live_session_command_palette", direction: 1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(3);
    expect(renderTuiFrame(state, { columns: 170, rows: 12 })).toContain("page:3");

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandPageSize).toBe(3);
    state = reduceTuiState(state, { type: "cycle_live_session_command_page_size" });
    expect(state.liveSessionCommandPageSize).toBe(5);
  });

  it("jumps to command palette bounds within the current visible scope", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "jump_live_session_command_palette", target: "last" });
    expect(state.selectedLiveSessionCommandIndex).toBe(0);
    expect(state.liveSessionCommandScrollOffset).toBe(0);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });

    state = reduceTuiState(state, { type: "jump_live_session_command_palette", target: "last" });
    expect(state.selectedLiveSessionCommandIndex).toBe(8);
    expect(state.liveSessionCommandScrollOffset).toBe(8);
    const lastCommandFrame = renderTuiFrame(state, { columns: 110, rows: 12 });
    expect(lastCommandFrame).toContain("command:9/9");
    expect(lastCommandFrame).toContain("neighbors(full>standard+F20/50%M):view(3)@4/-");
    expect(lastCommandFrame).toContain("scroll:<9-9/9");
    expect(lastCommandFrame).toContain("> A [bulk] Mark all sessions read");

    state = reduceTuiState(state, { type: "jump_live_session_command_palette", target: "first" });
    expect(state.selectedLiveSessionCommandIndex).toBe(0);
    expect(state.liveSessionCommandScrollOffset).toBe(0);
    expect(renderTuiFrame(state, { columns: 52, rows: 12 })).toContain("> 1 [session] Activate selected session");

    state = reduceTuiState(state, { type: "cycle_live_session_command_category" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_category" });
    expect(state.liveSessionCommandCategory).toBe("view");
    state = reduceTuiState(state, { type: "jump_live_session_command_palette", target: "last" });
    expect(state.selectedLiveSessionCommandIndex).toBe(5);
    expect(state.liveSessionCommandScrollOffset).toBe(2);
    expect(renderTuiFrame(state, { columns: 110, rows: 12 })).toContain("command:3/3 group:1/1:view(3/3) neighbors(full>standard+F20/50%M):-/- scroll:<3-3/3");

    state = reduceTuiState(state, { type: "jump_live_session_command_palette", target: "first" });
    expect(state.selectedLiveSessionCommandIndex).toBe(3);
    expect(state.liveSessionCommandScrollOffset).toBe(0);
    expect(renderTuiFrame(state, { columns: 110, rows: 12 })).toContain("command:1/3 group:1/1:view(1/3) neighbors(full>standard+F20/50%M):-/- scroll:1-3/3");
  });

  it("optionally wraps command selection across visible scope boundaries", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "toggle_live_session_command_selection_wrap" });
    expect(state.liveSessionCommandSelectionWrap).toBe(false);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });

    state = reduceTuiState(state, { type: "select_live_session_command", direction: -1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(0);
    expect(state.liveSessionCommandScrollOffset).toBe(0);

    state = reduceTuiState(state, { type: "toggle_live_session_command_selection_wrap" });
    expect(state.liveSessionCommandSelectionWrap).toBe(true);
    state = reduceTuiState(state, { type: "select_live_session_command", direction: -1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(8);
    expect(state.liveSessionCommandScrollOffset).toBe(8);
    const wrappedLastFrame = renderTuiFrame(state, { columns: 140, rows: 12 });
    expect(wrappedLastFrame).toContain("wrap:on");
    expect(wrappedLastFrame).toContain("command:9/9 group:4/4:bulk(3/3) neighbors(full):view(3)@4#4:sort/favorite(1)@1#1:activate scroll:<9-9/9");

    state = reduceTuiState(state, { type: "select_live_session_command", direction: 1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(0);
    expect(state.liveSessionCommandScrollOffset).toBe(0);
    expect(renderTuiFrame(state, { columns: 190, rows: 12 })).toContain("neighbors(full):bulk(3)@x#7:close_inactive/session(2)@2#2:pin");

    state = reduceTuiState(state, { type: "cycle_live_session_command_category" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_category" });
    expect(state.liveSessionCommandCategory).toBe("view");
    state = reduceTuiState(state, { type: "select_live_session_command", direction: -1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(5);
    expect(state.liveSessionCommandScrollOffset).toBe(2);
    state = reduceTuiState(state, { type: "select_live_session_command", direction: 1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(3);
    expect(state.liveSessionCommandScrollOffset).toBe(0);

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandSelectionWrap).toBe(true);
    state = reduceTuiState(state, { type: "toggle_live_session_command_selection_wrap" });
    expect(state.liveSessionCommandSelectionWrap).toBe(false);
    state = reduceTuiState(state, { type: "jump_live_session_command_palette", target: "last" });
    state = reduceTuiState(state, { type: "select_live_session_command", direction: 1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(8);
  });

  it("jumps between command groups and reuses selection wrapping at group boundaries", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "jump_live_session_command_group", direction: 1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(0);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(renderTuiFrame(state, { columns: 180, rows: 12 })).toContain("neighbors(full):-/session(2)@2#2:pin");

    state = reduceTuiState(state, { type: "jump_live_session_command_group", direction: 1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(1);
    expect(state.liveSessionCommandScrollOffset).toBe(1);
    expect(renderTuiFrame(state, { columns: 190, rows: 12 })).toContain("group:2/4:session(1/2) neighbors(full):favorite(1)@1#1:activate/view(3)@4#4:sort");
    state = reduceTuiState(state, { type: "jump_live_session_command_group", direction: 1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(3);
    expect(state.liveSessionCommandScrollOffset).toBe(3);
    expect(renderTuiFrame(state, { columns: 200, rows: 12 })).toContain("group:3/4:view(1/3) neighbors(full):session(2)@2#2:pin/bulk(3)@x#7:close_inactive");
    state = reduceTuiState(state, { type: "select_live_session_command", direction: 1 });
    expect(renderTuiFrame(state, { columns: 100, rows: 12 })).toContain("group:3/4:view(2/3)");
    state = reduceTuiState(state, { type: "jump_live_session_command_group", direction: -1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(1);

    state = reduceTuiState(state, { type: "jump_live_session_command_palette", target: "first" });
    state = reduceTuiState(state, { type: "jump_live_session_command_group", direction: -1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(0);
    expect(state.liveSessionCommandScrollOffset).toBe(0);

    state = reduceTuiState(state, { type: "jump_live_session_command_palette", target: "last" });
    state = reduceTuiState(state, { type: "jump_live_session_command_group", direction: -1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(3);
    expect(state.liveSessionCommandScrollOffset).toBe(3);

    state = reduceTuiState(state, { type: "toggle_live_session_command_selection_wrap" });
    state = reduceTuiState(state, { type: "jump_live_session_command_palette", target: "first" });
    state = reduceTuiState(state, { type: "jump_live_session_command_group", direction: -1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(6);
    expect(state.liveSessionCommandScrollOffset).toBe(6);
    const wrappedGroupFrame = renderTuiFrame(state, { columns: 180, rows: 12 });
    expect(wrappedGroupFrame).toContain("command:7/9");
    expect(wrappedGroupFrame).toContain("group:4/4:bulk(1/3)");
    expect(wrappedGroupFrame).toContain("neighbors(full):view(3)@4#4:sort/favorite(1)@1#1:activate");
    expect(wrappedGroupFrame).toContain("-- bulk commands --");
    expect(wrappedGroupFrame).toContain("> x [bulk] Close inactive sessions");

    state = reduceTuiState(state, { type: "jump_live_session_command_group", direction: 1 });
    expect(state.selectedLiveSessionCommandIndex).toBe(0);
    expect(state.liveSessionCommandScrollOffset).toBe(0);

    state = reduceTuiState(state, { type: "cycle_live_session_command_category" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_category" });
    expect(state.liveSessionCommandCategory).toBe("view");
    const singleGroupState = reduceTuiState(state, { type: "jump_live_session_command_group", direction: 1 });
    expect(singleGroupState.selectedLiveSessionCommandIndex).toBe(3);
    expect(singleGroupState.liveSessionCommandScrollOffset).toBe(0);
    expect(renderTuiFrame(singleGroupState, { columns: 100, rows: 12 })).toContain("group:1/1:view(1/3) neighbors(full>standard+F30/25%L):-/-");

    const emptyGroupState = reduceTuiState(singleGroupState, {
      type: "append_live_session_command_search",
      text: "no-command-matches"
    });
    expect(renderTuiFrame(emptyGroupState, { columns: 110, rows: 12 })).toContain(
      "command:0/0 group:0/0:-(0/0) neighbors(full>standard+F20/50%M):-/- scroll:0-0/0"
    );
  });

  it("cycles and persists command group neighbor visibility profiles", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "cycle_live_session_command_neighbor_visibility_profile" });
    expect(state.liveSessionCommandNeighborVisibilityProfile).toBe("full");
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });

    state = reduceTuiState(state, { type: "cycle_live_session_command_neighbor_visibility_profile" });
    expect(state.liveSessionCommandNeighborVisibilityProfile).toBe("compact");
    const compactFrame = renderTuiFrame(state, { columns: 120, rows: 12 });
    expect(compactFrame).toContain("neighbors(compact):-/session");
    expect(compactFrame).not.toContain("session(2)@2");
    expect(buildTuiDebugLines(state)).toContain(
      "live_command_palette=open selected=0 group=1/4:favorite(1/1) neighbor_profile=compact neighbor_threshold=balanced[88/128] bucket_help=on@|/legend:compact@`/labels:shown@_/bucket_labels:shown@*/visibility_bucket_labels:shown@&/visibility_bucket_labels_labels:shown@(/visibility_bucket_labels_labels_labels:shown@)/visibility_bucket_labels_labels_labels_labels:shown@</visibility_bucket_labels_labels_labels_labels_labels:shown@>/visibility_bucket_labels_labels_labels_labels_labels_labels:shown@?/visibility_bucket_labels_labels_labels_labels_labels_labels_labels:shown@:/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:shown@,/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@./visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@-/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@#/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@$/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@0/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@9/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@8/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@7/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@6/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@5/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@4/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@3/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@2/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@1/latest_width_bucket_label:shown@F2 neighbors=-/session scroll=0 page=5 wrap=off category=all sort=catalog ranking=on/3/single/2 summary=history profile=all search=-"
    );

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandNeighborVisibilityProfile).toBe("compact");

    state = reduceTuiState(state, { type: "cycle_live_session_command_neighbor_visibility_profile" });
    expect(state.liveSessionCommandNeighborVisibilityProfile).toBe("standard");
    const standardFrame = renderTuiFrame(state, { columns: 140, rows: 12 });
    expect(standardFrame).toContain("neighbors(standard):-/session(2)@2");
    expect(standardFrame).not.toContain("#2:pin");

    state = reduceTuiState(state, { type: "cycle_live_session_command_neighbor_visibility_profile" });
    expect(state.liveSessionCommandNeighborVisibilityProfile).toBe("full");
    expect(renderTuiFrame(state, { columns: 180, rows: 12 })).toContain(
      "neighbors(full):-/session(2)@2#2:pin"
    );
  });

  it("cycles and persists the deepest nested bucket label visibility profile", () => {
    let state = createInitialTuiState();
    expect(state.liveSessionCommandDeepestNestedBucketLabelVisibilityProfile).toBe("shown");
    expect(reduceTuiState(state, { type: "cycle_live_session_command_deepest_nested_bucket_label_visibility_profile" })).toBe(state);

    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_deepest_nested_bucket_label_visibility_profile" });
    expect(state.liveSessionCommandDeepestNestedBucketLabelVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels:shown@?");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels:hidden@:");
    expect(buildTuiDebugLines(state).some((line) => line.includes("visibility_bucket_labels_labels_labels_labels_labels_labels_labels:hidden@:"))).toBe(true);

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandDeepestNestedBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, { type: "cycle_live_session_command_deepest_nested_bucket_label_visibility_profile" });
    expect(state.liveSessionCommandDeepestNestedBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@:");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@:");
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).some((line) => line.includes("visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@:"))).toBe(true);
    expect(buildTuiDebugLines(state, { maxWidth: 120 }).some((line) => line.includes("visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@:"))).toBe(true);
    state = reduceTuiState(state, { type: "cycle_live_session_command_deepest_nested_bucket_label_visibility_profile" });
    expect(state.liveSessionCommandDeepestNestedBucketLabelVisibilityProfile).toBe("shown");
  });

  it("cycles and persists the deepest nested bucket label text visibility profile", () => {
    let state = createInitialTuiState();
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityProfile).toBe("shown");
    expect(reduceTuiState(state, { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_profile" })).toBe(state);

    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_deepest_nested_bucket_label_visibility_profile" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_deepest_nested_bucket_label_visibility_profile" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_profile" });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H]@:");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:hidden@,");
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).some((line) => line.includes("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:hidden@,"))).toBe(true);

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_profile" });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@,");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@,");
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).some((line) => line.includes("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@,"))).toBe(true);
    expect(buildTuiDebugLines(state, { maxWidth: 120 }).some((line) => line.includes("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@,"))).toBe(true);
    state = reduceTuiState(state, { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_profile" });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityProfile).toBe("shown");
  });

  it("cycles and persists the deepest nested bucket label text visibility width percentage bucket label profile", () => {
    let state = createInitialTuiState();
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityIndicator("shown")).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@."
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityIndicator("hidden")).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@."
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 119)).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@."
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 120)).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@."
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 180)).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[180/120=100%H(high)]@."
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(0)).toBe(0);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(40)).toBe(33);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(80)).toBe(66);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(120)).toBe(100);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(180)).toBe(100);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(39)).toBe("L");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(79)).toBe("M");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(119)).toBe("H");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(180)).toBe("H");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(39)).toBe("low");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(79)).toBe("mid");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(119)).toBe("high");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(180)).toBe("high");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("hidden", 80)).toBeNull();
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_profile"
    })).toBe(state);

    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_profile" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_profile" });
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H]@,"
    );
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@."
    );
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).some((line) =>
      line.includes("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@.")
    )).toBe(true);

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain(
      ".=adaptive>hidden+1[119/120=99%H(high)]"
    );
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@."
    );
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("119/120=99%H]@,");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("120/120=100%H(high)]@,");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
  });

  it("cycles and persists the deepest nested bucket label text visibility width percentage bucket label profile", () => {
    let state = createInitialTuiState();
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("shown")).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@$"
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("hidden")).toContain("hidden@$");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 119)).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@$"
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 120)).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@$"
    );
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("hidden", 80)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    })).toBe(state);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("shown")).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@#"
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("hidden")).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@#"
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 119)).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@#"
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 120)).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@#"
    );
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("hidden", 80)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(0)).toBe(0);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(40)).toBe(33);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(80)).toBe(66);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(120)).toBe(100);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(180)).toBe(100);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(39)).toBe("L");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(79)).toBe("M");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("shown")).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@-"
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("hidden")).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@-"
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 119)).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@-"
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 120)).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@-"
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(0)).toBe(0);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(40)).toBe(33);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(80)).toBe(66);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(120)).toBe(100);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(180)).toBe(100);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(39)).toBe("L");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(79)).toBe("M");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(119)).toBe("H");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(180)).toBe("H");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(39)).toBe("low");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(79)).toBe("mid");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(119)).toBe("high");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(180)).toBe("high");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("hidden", 80)).toBeNull();
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    })).toBe(state);
    expect(reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    })).toBe(state);

    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines({
      ...state,
      liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile: "adaptive"
    }, { maxWidth: 119 }).join("\n")).toContain("#=adaptive>hidden+1[119/120=99%H]");
    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("$=adaptive>hidden+1[119/120=99%H(high)]");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("$=adaptive>shown[120/120=100%H(high)]");
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).join("\n")).toContain("adaptive>hidden+1[119/120=99%H(high)]@$");
    expect(buildTuiDebugLines(state, { maxWidth: 120 }).join("\n")).toContain("adaptive>shown[120/120=100%H(high)]@$");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@#"
    );
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_profile"
    });
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_profile"
    });
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@-"
    );
    expect(buildTuiDebugLines(state, { maxWidth: 120 }).some((line) =>
      line.includes("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@-")
    )).toBe(true);

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain(
      "#=adaptive>hidden+1[119/120=99%H(high)]"
    );
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain(
      "#=adaptive>shown[120/120=100%H(high)]"
    );
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain(
      "-=adaptive>hidden+1[119/120=99%H(high)]"
    );
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain(
      "-=adaptive>shown[120/120=100%H(high)]"
    );
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("119/120=99%H]@.");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("120/120=100%H(high)]@.");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
  });

  it("cycles and persists the latest deepest bucket label visibility profile", () => {
    let state = createInitialTuiState();
    const action = {
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" as const
    };
    const labelProfileAction = {
      type: "cycle_live_session_command_latest_deepest_bucket_label_visibility_profile" as const
    };
    const cycleLatestLabelTextProfileAction = {
      type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_profile" as const
    };
    const cycleLatestBucketLabelProfileAction = {
      type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_profile" as const
    };
    const cycleLatestNestedBucketLabelProfileAction = {
      type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" as const
    };
    const toggleLatestNestedBucketLabelTextAction = {
      type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" as const
    };
    const toggleLatestDeepestBucketLabelTextAction = {
      type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" as const
    };
    const toggleLatestDeepestBucketLabelAction = {
      type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" as const
    };
    const toggleLatestDeepestBucketLabelWidthAction = {
      type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" as const
    };
    const toggleLatestDeepestBucketLabelWidthLabelAction = {
      type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" as const
    };

    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityProfile).toBe("shown");
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("shown")).toContain("shown@1");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("hidden")).toContain("hidden@1");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(0)).toBe(0);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(40)).toBe(33);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(80)).toBe(66);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(120)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(180)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(39)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(79)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(120)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(80)).toBe("80/120=66%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 80)).toContain("adaptive>hidden+40[80/120=66%H(high)]@1");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 119)).toContain("adaptive>hidden+1[119/120=99%H(high)]@1");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 120)).toContain("adaptive>shown[120/120=100%H(high)]@1");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("shown")).toContain("shown@2");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("hidden")).toContain("hidden@2");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(0)).toBe(0);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(40)).toBe(33);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(80)).toBe(66);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(120)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(180)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(39)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(79)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(120)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(80)).toBe("80/120=66%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 80)).toContain("adaptive>hidden+40[80/120=66%H(high)]@2");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 119)).toContain("adaptive>hidden+1[119/120=99%H(high)]@2");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 120)).toContain("adaptive>shown[120/120=100%H(high)]@2");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 119, "adaptive")).toContain("119/120=99%H]@3");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 120, "adaptive")).toContain("120/120=100%H(high)]@3");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("shown")).toContain("shown@3");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("hidden")).toContain("hidden@3");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 80)).toContain("adaptive>hidden+40[80/120=66%H(high)]@3");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 119)).toContain("adaptive>hidden+1[119/120=99%H(high)]@3");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 120)).toContain("adaptive>shown[120/120=100%H(high)]@3");
    expect(resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("hidden", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(80)).toBe("80/120=66%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(0)).toBe(0);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(40)).toBe(33);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(80)).toBe(66);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(120)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(180)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(39)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(79)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(120)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("shown")).toContain("shown@4");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("hidden")).toContain("hidden@4");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 80)).toContain("adaptive>hidden+40[80/120=66%H(high)]@4");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 119)).toContain("adaptive>hidden+1[119/120=99%H(high)]@4");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 120)).toContain("adaptive>shown[120/120=100%H(high)]@4");
    expect(resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("hidden", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(80)).toBe("80/120=66%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(0)).toBe(0);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(40)).toBe(33);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(80)).toBe(66);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(120)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(180)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(39)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(79)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(120)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("shown")).toContain("shown@5");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("hidden")).toContain("hidden@5");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 119)).toContain("adaptive>hidden+1[119/120=99%H(high)]@5");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 120)).toContain("adaptive>shown[120/120=100%H(high)]@5");
    expect(resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("hidden", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(0)).toBe(0);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(40)).toBe(33);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(80)).toBe(66);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(120)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(180)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(39)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(79)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(120)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("shown")).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@6");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("hidden")).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@6");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 119)).toContain("adaptive>hidden+1[119/120=99%H(high)]@6");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 120)).toContain("adaptive>shown[120/120=100%H(high)]@6");
    expect(resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("hidden", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(0)).toBe(0);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(40)).toBe(33);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(80)).toBe(66);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(120)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(180)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(39)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(79)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(120)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelIndicator("shown")).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@7");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelIndicator("hidden")).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@7");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelIndicator("adaptive", 119)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@7");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelIndicator("adaptive", 120)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@7");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("hidden", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(0)).toBe(0);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(40)).toBe(33);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(80)).toBe(66);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(120)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(180)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(39)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(79)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(120)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(liveSessionCommandLatestDeepestBucketLabelTextIndicator("shown")).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@8");
    expect(liveSessionCommandLatestDeepestBucketLabelTextIndicator("hidden")).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@8");
    expect(liveSessionCommandLatestDeepestBucketLabelTextIndicator("adaptive", 119)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@8");
    expect(liveSessionCommandLatestDeepestBucketLabelTextIndicator("adaptive", 120)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@8");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityThresholdDistance("hidden", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentage(0)).toBe(0);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentage(40)).toBe(33);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentage(80)).toBe(66);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentage(120)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentage(180)).toBe(100);
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucket(39)).toBe("L");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucket(79)).toBe("M");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucket(120)).toBe("H");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandLatestDeepestBucketLabelTextVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("shown")).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@9"
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("hidden")).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@9"
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 119)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@9");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 120)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@9");
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("shown", 80)).toBe("shown");
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("hidden", 180)).toBe("hidden");
    expect(liveSessionCommandLatestDeepestBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandLatestDeepestBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandLatestDeepestBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelVisibilityThresholdDistance("hidden", 80)).toBeNull();
    expect(liveSessionCommandLatestDeepestBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandLatestDeepestBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("shown")).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@0"
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("hidden")).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@0"
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 119)).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@0"
    );
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 120)).toBe(
      "visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@0"
    );
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("hidden", 80)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(reduceTuiState(state, action)).toBe(state);
    expect(reduceTuiState(state, labelProfileAction)).toBe(state);
    expect(reduceTuiState(state, cycleLatestLabelTextProfileAction)).toBe(state);
    expect(reduceTuiState(state, cycleLatestBucketLabelProfileAction)).toBe(state);
    expect(reduceTuiState(state, cycleLatestNestedBucketLabelProfileAction)).toBe(state);
    expect(reduceTuiState(state, toggleLatestNestedBucketLabelTextAction)).toBe(state);
    expect(reduceTuiState(state, toggleLatestDeepestBucketLabelTextAction)).toBe(state);
    expect(reduceTuiState(state, toggleLatestDeepestBucketLabelAction)).toBe(state);
    expect(reduceTuiState(state, toggleLatestDeepestBucketLabelWidthAction)).toBe(state);
    expect(reduceTuiState(state, toggleLatestDeepestBucketLabelWidthLabelAction)).toBe(state);

    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, toggleLatestDeepestBucketLabelWidthLabelAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@1");
    expect(buildTuiDebugLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@1");
    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, toggleLatestDeepestBucketLabelWidthLabelAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("1=adaptive>hidden+1[119/120=99%H(high)]");
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).join("\n")).toContain("adaptive>hidden+1[119/120=99%H(high)]@1");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("1=adaptive>shown[120/120=100%H(high)]");
    expect(buildTuiDebugLines(state, { maxWidth: 120 }).join("\n")).toContain("adaptive>shown[120/120=100%H(high)]@1");
    state = reduceTuiState(state, toggleLatestDeepestBucketLabelWidthLabelAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, toggleLatestDeepestBucketLabelWidthAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@2");
    expect(buildTuiDebugLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@2");
    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, toggleLatestDeepestBucketLabelWidthAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("2=adaptive>hidden+1[119/120=99%H(high)]");
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).join("\n")).toContain("adaptive>hidden+1[119/120=99%H(high)]@2");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("2=adaptive>shown[120/120=100%H(high)]");
    expect(buildTuiDebugLines(state, { maxWidth: 120 }).join("\n")).toContain("adaptive>shown[120/120=100%H(high)]@2");
    state = reduceTuiState(state, toggleLatestDeepestBucketLabelWidthAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, toggleLatestDeepestBucketLabelAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@3");
    expect(buildTuiDebugLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@3");
    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, toggleLatestDeepestBucketLabelAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("3=adaptive>hidden+1[119/120=99%H(high)]");
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).join("\n")).toContain("adaptive>hidden+1[119/120=99%H(high)]@3");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("3=adaptive>shown[120/120=100%H(high)]");
    expect(buildTuiDebugLines(state, { maxWidth: 120 }).join("\n")).toContain("adaptive>shown[120/120=100%H(high)]@3");
    state = reduceTuiState(state, toggleLatestDeepestBucketLabelTextAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@4");
    expect(buildTuiDebugLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@4");
    state = reduceTuiState(state, toggleLatestDeepestBucketLabelTextAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("4=adaptive>hidden+1[119/120=99%H]");
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).join("\n")).toContain("adaptive>hidden+1[119/120=99%H]@4");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("4=adaptive>shown[120/120=100%H(high)]");
    expect(buildTuiDebugLines(state, { maxWidth: 120 }).join("\n")).toContain("adaptive>shown[120/120=100%H(high)]@4");
    state = reduceTuiState(state, toggleLatestNestedBucketLabelTextAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@5");
    expect(buildTuiDebugLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@5");
    state = reduceTuiState(state, toggleLatestNestedBucketLabelTextAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("5=adaptive>hidden+1[119/120=99%H]");
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).join("\n")).toContain("adaptive>hidden+1[119/120=99%H]@5");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("5=adaptive>shown[120/120=100%H(high)]");
    expect(buildTuiDebugLines(state, { maxWidth: 120 }).join("\n")).toContain("adaptive>shown[120/120=100%H(high)]@5");
    state = reduceTuiState(state, toggleLatestNestedBucketLabelTextAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, cycleLatestNestedBucketLabelProfileAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    state = reduceTuiState(state, cycleLatestBucketLabelProfileAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@6");
    expect(buildTuiDebugLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@6");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    state = reduceTuiState(state, action);
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, labelProfileAction);
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, cycleLatestLabelTextProfileAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@7");
    expect(buildTuiDebugLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@7");
    expect(buildTuiHelpLines({
      ...state,
      liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile: "adaptive"
    }, { maxWidth: 119 }).join("\n")).toContain("$=adaptive>hidden+1[119/120=99%H]");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@0");
    expect(buildTuiDebugLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@0");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@9");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@8");
    expect(buildTuiDebugLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:hidden@8");

    state = reduceTuiState(state, toggleLatestNestedBucketLabelTextAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, toggleLatestDeepestBucketLabelTextAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, toggleLatestDeepestBucketLabelTextAction);
    state = reduceTuiState(state, toggleLatestNestedBucketLabelTextAction);
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityProfile).toBe("hidden");
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, cycleLatestLabelTextProfileAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("8=adaptive>hidden+1[119/120=99%H]");
    state = reduceTuiState(state, cycleLatestBucketLabelProfileAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("7=adaptive>hidden+1[119/120=99%H]");
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).join("\n")).toContain("adaptive>hidden+1[119/120=99%H]@7");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("7=adaptive>shown[120/120=100%H]");
    expect(buildTuiDebugLines(state, { maxWidth: 120 }).join("\n")).toContain("adaptive>shown[120/120=100%H]@7");
    state = reduceTuiState(state, cycleLatestNestedBucketLabelProfileAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("6=adaptive>hidden+1[119/120=99%H]");
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).join("\n")).toContain("adaptive>hidden+1[119/120=99%H]@6");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("6=adaptive>shown[120/120=100%H(high)]");
    expect(buildTuiDebugLines(state, { maxWidth: 120 }).join("\n")).toContain("adaptive>shown[120/120=100%H(high)]@6");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("7=adaptive>hidden+1[119/120=99%H]");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("7=adaptive>shown[120/120=100%H(high)]");
    state = reduceTuiState(state, cycleLatestBucketLabelProfileAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    const adaptiveParentLabelState = {
      ...state,
      liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile: "adaptive" as const
    };
    expect(buildTuiHelpLines(adaptiveParentLabelState, { maxWidth: 119 }).join("\n")).toContain("9=adaptive>hidden+1[119/120=99%H]");
    expect(buildTuiHelpLines(adaptiveParentLabelState, { maxWidth: 120 }).join("\n")).toContain("9=adaptive>shown[120/120=100%H(high)]");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("8=adaptive>hidden+1[119/120=99%H(high)]");
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).join("\n")).toContain("adaptive>hidden+1[119/120=99%H(high)]@8");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("8=adaptive>shown[120/120=100%H(high)]");
    expect(buildTuiDebugLines(state, { maxWidth: 120 }).join("\n")).toContain("adaptive>shown[120/120=100%H(high)]@8");
    state = reduceTuiState(state, cycleLatestLabelTextProfileAction);
    expect(state.liveSessionCommandLatestDeepestBucketLabelTextVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, labelProfileAction);
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    state = reduceTuiState(state, action);
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("0=adaptive>hidden+1[119/120=99%H]");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("0=adaptive>shown[120/120=100%H(high)]");
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).join("\n")).toContain("adaptive>hidden+1[119/120=99%H]@0");
    expect(buildTuiDebugLines(state, { maxWidth: 120 }).join("\n")).toContain("adaptive>shown[120/120=100%H(high)]@0");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("9=adaptive>hidden+1[119/120=99%H(high)]");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("9=adaptive>shown[120/120=100%H(high)]");
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@9");
    expect(buildTuiDebugLines(state, { maxWidth: 120 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@9");
    state = reduceTuiState(state, labelProfileAction);
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, action);
    expect(state.liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
  });

  it("adapts command group neighbor detail to terminal width without exceeding preference", () => {
    expect(resolveLiveSessionCommandNeighborVisibilityProfile("full", 87)).toBe("compact");
    expect(resolveLiveSessionCommandNeighborVisibilityProfile("full", 88)).toBe("standard");
    expect(resolveLiveSessionCommandNeighborVisibilityProfile("full", 127)).toBe("standard");
    expect(resolveLiveSessionCommandNeighborVisibilityProfile("full", 128)).toBe("full");
    expect(resolveLiveSessionCommandNeighborVisibilityProfile("standard", 80)).toBe("compact");
    expect(resolveLiveSessionCommandNeighborVisibilityProfile("standard", 200)).toBe("standard");
    expect(resolveLiveSessionCommandNeighborVisibilityProfile("compact", 200)).toBe("compact");

    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });

    expect(renderTuiFrame(state, { columns: 88, rows: 12 })).toContain("neighbors(full>compact+S2/97%H)");
    const standardFrame = renderTuiFrame(state, { columns: 110, rows: 12 });
    expect(standardFrame).toContain("neighbors(full>standard+F20/50%M):-/session(2)@2");
    expect(standardFrame).not.toContain("#2:pin");
    expect(renderTuiFrame(state, { columns: 160, rows: 12 })).toContain(
      "neighbors(full):-/session(2)@2#2:pin"
    );
  });

  it("cycles and persists command group neighbor adaptive threshold profiles", () => {
    expect(liveSessionCommandNeighborAdaptiveThresholds("dense")).toEqual({ standard: 72, full: 112 });
    expect(liveSessionCommandNeighborAdaptiveThresholds("balanced")).toEqual({ standard: 88, full: 128 });
    expect(liveSessionCommandNeighborAdaptiveThresholds("spacious")).toEqual({ standard: 104, full: 144 });
    expect(liveSessionCommandNeighborAdaptiveThresholdLabel("dense")).toBe("dense[72/112]");
    expect(liveSessionCommandNeighborAdaptiveThresholdLabel("balanced")).toBe("balanced[88/128]");
    expect(liveSessionCommandNeighborAdaptiveThresholdLabel("spacious")).toBe("spacious[104/144]");
    expect(liveSessionCommandNeighborAdaptiveThresholdDistance("compact", 70, "dense")).toBe(2);
    expect(liveSessionCommandNeighborAdaptiveThresholdDistance("standard", 100, "dense")).toBe(12);
    expect(liveSessionCommandNeighborAdaptiveThresholdDistance("full", 112, "dense")).toBeNull();
    expect(liveSessionCommandNeighborAdaptiveThresholdDistance("compact", 200, "dense")).toBeNull();
    expect(liveSessionCommandNeighborAdaptiveThresholdTarget("compact", 70, "dense")).toBe("standard");
    expect(liveSessionCommandNeighborAdaptiveThresholdTarget("standard", 100, "dense")).toBe("full");
    expect(liveSessionCommandNeighborAdaptiveThresholdTarget("full", 112, "dense")).toBeNull();
    expect(liveSessionCommandNeighborAdaptiveThresholdTarget("compact", 200, "dense")).toBeNull();
    expect(liveSessionCommandNeighborAdaptiveThresholdProgress("compact", 70, "dense")).toBe(97);
    expect(liveSessionCommandNeighborAdaptiveThresholdProgress("standard", 100, "dense")).toBe(70);
    expect(liveSessionCommandNeighborAdaptiveThresholdProgress("full", 112, "dense")).toBeNull();
    expect(liveSessionCommandNeighborAdaptiveThresholdProgress("compact", 200, "dense")).toBeNull();
    expect(liveSessionCommandNeighborAdaptiveThresholdProgressBucket(0)).toBe("L");
    expect(liveSessionCommandNeighborAdaptiveThresholdProgressBucket(32)).toBe("L");
    expect(liveSessionCommandNeighborAdaptiveThresholdProgressBucket(33)).toBe("M");
    expect(liveSessionCommandNeighborAdaptiveThresholdProgressBucket(65)).toBe("M");
    expect(liveSessionCommandNeighborAdaptiveThresholdProgressBucket(66)).toBe("H");
    expect(liveSessionCommandNeighborAdaptiveThresholdProgressBucket(99)).toBe("H");
    expect(liveSessionCommandNeighborAdaptiveThresholdProgressBucketLabel("L")).toBe("low");
    expect(liveSessionCommandNeighborAdaptiveThresholdProgressBucketLabel("M")).toBe("mid");
    expect(liveSessionCommandNeighborAdaptiveThresholdProgressBucketLabel("H")).toBe("high");
    expect(liveSessionCommandNeighborProgressBucketHelpStatusLabel(true)).toBe("on");
    expect(liveSessionCommandNeighborProgressBucketHelpStatusLabel(false)).toBe("off");
    expect(liveSessionCommandNeighborProgressBucketHelpIndicator(true)).toBe("on@|");
    expect(liveSessionCommandNeighborProgressBucketHelpIndicator(false)).toBe("off@|");
    expect(liveSessionCommandNeighborProgressBucketHelpCompactIndicator(true)).toBe("bucket:on@|");
    expect(liveSessionCommandNeighborProgressBucketHelpCompactIndicator(false)).toBe("bucket:off@|");
    expect(liveSessionCommandNeighborProgressBucketHelpCompactLegend()).toBe(" bucket:L/M/H=low/mid/high");
    expect(liveSessionCommandNeighborProgressBucketHelpLegend("compact")).toBe(" bucket:L/M/H=low/mid/high");
    expect(liveSessionCommandNeighborProgressBucketHelpLegend("full")).toBe(" with progress L=low/M=mid/H=high");
    expect(liveSessionCommandNeighborProgressBucketHelpLegend("adaptive", 119)).toBe(" bucket:L/M/H=low/mid/high");
    expect(liveSessionCommandNeighborProgressBucketHelpLegend("adaptive", 120)).toBe(" with progress L=low/M=mid/H=high");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendProfile("adaptive", 119)).toBe("compact");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendProfile("adaptive", 120)).toBe("full");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendThresholdDistance("compact", 80)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentage(-1)).toBe(0);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentage(120)).toBe(100);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentage(180)).toBe(100);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelIndicator("shown")).toBe("labels:shown@_");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelIndicator("hidden")).toBe("labels:hidden@_");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelIndicator("adaptive", 119)).toBe(
      "labels:adaptive>hidden+1[119/120=99%H(high)]@_"
    );
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelIndicator("adaptive", 120)).toBe(
      "labels:adaptive>shown[120/120=100%H(high)]@_"
    );
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelIndicator("adaptive", 120, false)).toBe(
      "labels:adaptive>shown[120/120=100%H]@_"
    );
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityIndicator("shown")).toBe("bucket_labels:shown@*");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityIndicator("hidden")).toBe("bucket_labels:hidden@*");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityIndicator("adaptive", 119)).toBe("bucket_labels:adaptive>hidden+1[119/120=99%H(high)]@*");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityIndicator("adaptive", 120)).toBe("bucket_labels:adaptive>shown[120/120=100%H(high)]@*");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("shown")).toBe("visibility_bucket_labels:shown@&");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("hidden")).toBe("visibility_bucket_labels:hidden@&");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 119)).toBe("visibility_bucket_labels:adaptive>hidden+1[119/120=99%H(high)]@&");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 120)).toBe("visibility_bucket_labels:adaptive>shown[120/120=100%H(high)]@&");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("shown")).toBe("visibility_bucket_labels_labels:shown@(");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("hidden")).toBe("visibility_bucket_labels_labels:hidden@(");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 119)).toBe("visibility_bucket_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@(");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 120)).toBe("visibility_bucket_labels_labels:adaptive>shown[120/120=100%H(high)]@(");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("shown")).toBe("visibility_bucket_labels_labels_labels:shown@)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("hidden")).toBe("visibility_bucket_labels_labels_labels:hidden@)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 119)).toBe("visibility_bucket_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 120)).toBe("visibility_bucket_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@)");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("shown")).toBe("visibility_bucket_labels_labels_labels_labels:shown@<");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("hidden")).toBe("visibility_bucket_labels_labels_labels_labels:hidden@<");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("shown")).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels:shown@?");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("hidden")).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels:hidden@?");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(0)).toBe("0/120=0%L(low)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(40)).toBe("40/120=33%M(mid)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(80)).toBe("80/120=66%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityThresholdDistance("hidden", 80)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentage(0)).toBe(0);
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentage(40)).toBe(33);
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentage(80)).toBe(66);
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentage(120)).toBe(100);
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentage(180)).toBe(100);
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucket(39)).toBe("L");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucket(79)).toBe("M");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucket(119)).toBe("H");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucket(180)).toBe("H");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucketLabel(39)).toBe("low");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucketLabel(79)).toBe("mid");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucketLabel(119)).toBe("high");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucketLabel(180)).toBe("high");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelIndicator("shown")).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels:shown@:");
    expect(liveSessionCommandDeepestNestedBucketLabelIndicator("hidden")).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels:hidden@:");
    expect(liveSessionCommandDeepestNestedBucketLabelIndicator("adaptive", 119)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@:");
    expect(liveSessionCommandDeepestNestedBucketLabelIndicator("adaptive", 119, false)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H]@:");
    expect(liveSessionCommandDeepestNestedBucketLabelIndicator("adaptive", 120)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@:");
    expect(liveSessionCommandDeepestNestedBucketLabelIndicator("adaptive", 180)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[180/120=100%H(high)]@:");
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandDeepestNestedBucketLabelTextVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityThresholdDistance("hidden", 80)).toBeNull();
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentage(0)).toBe(0);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentage(40)).toBe(33);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentage(80)).toBe(66);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentage(120)).toBe(100);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentage(180)).toBe(100);
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucket(39)).toBe("L");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucket(79)).toBe("M");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucket(119)).toBe("H");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucket(180)).toBe("H");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabel(39)).toBe("low");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabel(79)).toBe("mid");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabel(119)).toBe("high");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabel(180)).toBe("high");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandDeepestNestedBucketLabelTextIndicator("shown")).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:shown@,");
    expect(liveSessionCommandDeepestNestedBucketLabelTextIndicator("hidden")).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:hidden@,");
    expect(liveSessionCommandDeepestNestedBucketLabelTextIndicator("adaptive", 119)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@,");
    expect(liveSessionCommandDeepestNestedBucketLabelTextIndicator("adaptive", 119, false)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H]@,");
    expect(liveSessionCommandDeepestNestedBucketLabelTextIndicator("adaptive", 120)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@,");
    expect(liveSessionCommandDeepestNestedBucketLabelTextIndicator("adaptive", 180)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:adaptive>shown[180/120=100%H(high)]@,");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 119)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@?");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 120)).toBe("visibility_bucket_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@?");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 119)).toBe("visibility_bucket_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@<");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 120)).toBe("visibility_bucket_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@<");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("shown")).toBe("visibility_bucket_labels_labels_labels_labels_labels:shown@>");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("hidden")).toBe("visibility_bucket_labels_labels_labels_labels_labels:hidden@>");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(0)).toBe("0/120=0%L(low)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(40)).toBe("40/120=33%M(mid)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(80)).toBe("80/120=66%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 119)).toBe("visibility_bucket_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@>");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 120)).toBe("visibility_bucket_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@>");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityIndicator("adaptive", 119, false)).toBe("visibility_bucket_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H]@>");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityIndicator("adaptive", 119, false)).toBe("bucket_labels:adaptive>hidden+1[119/120=99%H]@*");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityProfile("adaptive", 119)).toBe("hidden");
    expect(resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityProfile("adaptive", 120)).toBe("shown");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthIndicator(119, false)).toBe("119/120=99%H");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendProfileIndicator("compact")).toBe("legend:compact@`");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendProfileIndicator("full")).toBe("legend:full@`");
    expect(liveSessionCommandNeighborProgressBucketHelpLegendProfileIndicator("adaptive", 119)).toBe(
      "legend:adaptive>compact+1[119/120=99%H(high)]@`"
    );
    expect(liveSessionCommandNeighborProgressBucketHelpLegendProfileIndicator("adaptive", 120)).toBe(
      "legend:adaptive>full[120/120=100%H(high)]@`"
    );
    expect(resolveLiveSessionCommandNeighborVisibilityProfile("full", 71, "dense")).toBe("compact");
    expect(resolveLiveSessionCommandNeighborVisibilityProfile("full", 72, "dense")).toBe("standard");
    expect(resolveLiveSessionCommandNeighborVisibilityProfile("full", 111, "dense")).toBe("standard");
    expect(resolveLiveSessionCommandNeighborVisibilityProfile("full", 112, "dense")).toBe("full");
    expect(resolveLiveSessionCommandNeighborVisibilityProfile("full", 103, "spacious")).toBe("compact");
    expect(resolveLiveSessionCommandNeighborVisibilityProfile("full", 104, "spacious")).toBe("standard");
    expect(resolveLiveSessionCommandNeighborVisibilityProfile("full", 143, "spacious")).toBe("standard");
    expect(resolveLiveSessionCommandNeighborVisibilityProfile("full", 144, "spacious")).toBe("full");

    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "cycle_live_session_command_neighbor_adaptive_threshold_profile" });
    expect(state.liveSessionCommandNeighborAdaptiveThresholdProfile).toBe("balanced");
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });

    state = reduceTuiState(state, { type: "cycle_live_session_command_neighbor_adaptive_threshold_profile" });
    expect(state.liveSessionCommandNeighborAdaptiveThresholdProfile).toBe("dense");
    const denseFrame = renderTuiFrame(state, { columns: 120, rows: 12 });
    expect(denseFrame).toContain("neighbors(full@72/112):-/session(2)@2#2:pin");
    expect(buildTuiDebugLines(state).some((line) => line.includes("neighbor_threshold=dense[72/112]"))).toBe(true);

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandNeighborAdaptiveThresholdProfile).toBe("dense");

    state = reduceTuiState(state, { type: "cycle_live_session_command_neighbor_adaptive_threshold_profile" });
    expect(state.liveSessionCommandNeighborAdaptiveThresholdProfile).toBe("spacious");
    expect(renderTuiFrame(state, { columns: 104, rows: 12 })).toContain(
      "neighbors(full>compact+S2/98%H@104/144):-/session"
    );
    expect(buildTuiDebugLines(state).some((line) => line.includes("neighbor_threshold=spacious[104/144]"))).toBe(true);

    state = reduceTuiState(state, { type: "cycle_live_session_command_neighbor_adaptive_threshold_profile" });
    expect(state.liveSessionCommandNeighborAdaptiveThresholdProfile).toBe("balanced");
  });

  it("toggles and persists command group neighbor progress bucket help", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");

    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels:hidden@?");
    expect(buildTuiDebugLines(state).some((line) => line.includes("visibility_bucket_labels_labels_labels_labels_labels_labels:hidden@?"))).toBe(true);
    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels:shown@>");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@?");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@?");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, { type: "toggle_live_session_command_neighbor_progress_bucket_help" });
    expect(state.liveSessionCommandNeighborProgressBucketHelpVisible).toBe(true);
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendProfile).toBe("compact");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityProfile).toBe("shown");

    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels:shown@&");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels:shown@(");
    expect(buildTuiHelpLines(state).join("\n")).toContain("bucket_labels:shown@*");
    expect(buildTuiHelpLines(state).join("\n")).toContain("bucket:on@|");
    expect(buildTuiHelpLines(state).join("\n")).toContain("legend:compact@`");
    expect(buildTuiHelpLines(state).join("\n")).toContain("bucket:L/M/H=low/mid/high");

    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendProfile).toBe("full");
    expect(buildTuiHelpLines(state).join("\n")).toContain("legend:full@`");
    expect(buildTuiHelpLines(state).join("\n")).toContain("with progress L=low/M=mid/H=high");

    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("bucket:L/M/H=low/mid/high");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("legend:adaptive>compact+1[119/120=99%H(high)]@`");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("with progress L=low/M=mid/H=high");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("legend:adaptive>full[120/120=100%H(high)]@`");

    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain(
      "legend:adaptive>compact+1[119/120=99%H]@`"
    );
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("labels:hidden@_");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).not.toContain(
      "legend:adaptive>compact+1[119/120=99%H(high)]@`"
    );

    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("labels:adaptive>hidden+1[119/120=99%H(high)]@_");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).not.toContain(
      "legend:adaptive>compact+1[119/120=99%H(high)]@`"
    );
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("labels:adaptive>shown[120/120=100%H(high)]@_");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("H(high)");

    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("labels:adaptive>hidden+1[119/120=99%H]@_");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("labels:adaptive>shown[120/120=100%H]@_");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("bucket_labels:hidden@*");

    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("labels:adaptive>hidden+1[119/120=99%H]@_");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("bucket_labels:adaptive>hidden+1[119/120=99%H(high)]@*");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("labels:adaptive>shown[120/120=100%H(high)]@_");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("bucket_labels:adaptive>shown[120/120=100%H(high)]@*");

    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("bucket_labels:adaptive>hidden+1[119/120=99%H]@*");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("bucket_labels:adaptive>shown[120/120=100%H]@*");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("visibility_bucket_labels:hidden@&");

    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("bucket_labels:adaptive>hidden+1[119/120=99%H]@*");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels:adaptive>hidden+1[119/120=99%H(high)]@&");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("bucket_labels:adaptive>shown[120/120=100%H(high)]@*");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("visibility_bucket_labels:adaptive>shown[120/120=100%H(high)]@&");

    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels:adaptive>hidden+1[119/120=99%H]@&");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("visibility_bucket_labels:adaptive>shown[120/120=100%H]@&");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels:hidden@(");

    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels:adaptive>hidden+1[119/120=99%H]@&");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@(");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("visibility_bucket_labels:adaptive>shown[120/120=100%H(high)]@&");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("visibility_bucket_labels_labels:adaptive>shown[120/120=100%H(high)]@(");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels:shown@)");

    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels:adaptive>hidden+1[119/120=99%H]@(");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels:hidden@)");

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels:adaptive>hidden+1[119/120=99%H]@(");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@)");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("visibility_bucket_labels_labels:adaptive>shown[120/120=100%H(high)]@(");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("visibility_bucket_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@)");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels:shown@<");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels:adaptive>hidden+1[119/120=99%H]@)");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels:hidden@<");
    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels:adaptive>hidden+1[119/120=99%H]@)");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@<");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("visibility_bucket_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@)");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@<");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");

    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H]@<");
    expect(buildTuiHelpLines(state).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels:hidden@>");
    expect(buildTuiDebugLines(state).some((line) => line.includes("visibility_bucket_labels_labels_labels_labels_labels:hidden@>"))).toBe(true);
    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H]@<");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@>");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@<");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("visibility_bucket_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@>");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");

    state = reduceTuiState(state, { type: "toggle_live_session_command_neighbor_progress_bucket_help" });
    expect(state.liveSessionCommandNeighborProgressBucketHelpVisible).toBe(false);
    const hiddenHelp = buildTuiHelpLines(state).join("\n");
    expect(hiddenHelp).toContain("bucket:off@|");
    expect(hiddenHelp).not.toContain("bucket:L/M/H=low/mid/high");
    expect(hiddenHelp).not.toContain("with progress L=low/M=mid/H=high");
    expect(
      buildTuiDebugLines(state, { maxWidth: 119 }).some((line) =>
        line.includes("bucket_help=off@|/legend:adaptive>compact+1[119/120=99%H]@`/labels:adaptive>hidden+1[119/120=99%H]@_/bucket_labels:adaptive>hidden+1[119/120=99%H]@*/visibility_bucket_labels:adaptive>hidden+1[119/120=99%H]@&/visibility_bucket_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@(/visibility_bucket_labels_labels_labels:shown@)/visibility_bucket_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@</visibility_bucket_labels_labels_labels_labels_labels:shown@>/visibility_bucket_labels_labels_labels_labels_labels_labels:shown@?")
      )
    ).toBe(true);
    expect(
      buildTuiDebugLines(state, { maxWidth: 120 }).some((line) =>
        line.includes("bucket_help=off@|/legend:adaptive>full[120/120=100%H(high)]@`/labels:adaptive>shown[120/120=100%H(high)]@_/bucket_labels:adaptive>shown[120/120=100%H(high)]@*/visibility_bucket_labels:adaptive>shown[120/120=100%H(high)]@&/visibility_bucket_labels_labels:adaptive>shown[120/120=100%H(high)]@(/visibility_bucket_labels_labels_labels:shown@)/visibility_bucket_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@</visibility_bucket_labels_labels_labels_labels_labels:shown@>/visibility_bucket_labels_labels_labels_labels_labels_labels:shown@?")
      )
    ).toBe(true);

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandNeighborProgressBucketHelpVisible).toBe(false);
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendProfile).toBe("adaptive");
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("adaptive");

    state = reduceTuiState(state, { type: "toggle_live_session_command_neighbor_progress_bucket_help" });
    expect(state.liveSessionCommandNeighborProgressBucketHelpVisible).toBe(true);
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendProfile).toBe("compact");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
    state = reduceTuiState(state, {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(state.liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile).toBe("shown");
  });

  it("cycles live session command palette categories and keeps selection visible", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });

    expect(state.liveSessionCommandCategory).toBe("all");
    state = reduceTuiState(state, { type: "cycle_live_session_command_category" });
    expect(state.liveSessionCommandCategory).toBe("session");
    expect(state.selectedLiveSessionCommandIndex).toBe(0);

    state = reduceTuiState(state, { type: "cycle_live_session_command_category" });
    expect(state.liveSessionCommandCategory).toBe("view");
    expect(state.selectedLiveSessionCommandIndex).toBe(3);

    state = reduceTuiState(state, { type: "cycle_live_session_command_category" });
    expect(state.liveSessionCommandCategory).toBe("bulk");
    expect(state.selectedLiveSessionCommandIndex).toBe(6);

    state = reduceTuiState(state, { type: "cycle_live_session_command_category" });
    expect(state.liveSessionCommandCategory).toBe("all");
    expect(state.selectedLiveSessionCommandIndex).toBe(0);
  });

  it("records recent live session command palette executions", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "cycle_live_session_sort_mode" });
    expect(state.liveSessionCommandUsageCounts).toEqual({});
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });

    state = reduceTuiState(state, tuiActionForLiveSessionCommand("sort", "command_palette"));
    expect(state.liveSessionCommandHistory).toEqual(["sort"]);
    expect(state.liveSessionCommandUsageCounts).toEqual({ sort: 1 });
    expect(state.liveSessionCommandPaletteVisible).toBe(false);

    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, tuiActionForLiveSessionCommand("activate", "command_palette"));
    expect(state.liveSessionCommandHistory).toEqual(["activate", "sort"]);

    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, tuiActionForLiveSessionCommand("sort", "command_palette"));
    expect(state.liveSessionCommandHistory).toEqual(["sort", "activate"]);
    expect(state.liveSessionCommandUsageCounts).toEqual({ sort: 2, activate: 1 });

    for (const commandId of ["pin", "close", "filter", "clear_filter"] as const) {
      state = reduceTuiState(state, tuiActionForLiveSessionCommand(commandId, "command_palette"));
    }
    expect(state.liveSessionCommandHistory).toEqual(["clear_filter", "filter", "close", "pin", "sort"]);

    const commandPaletteFrame = renderTuiFrame(
      reduceTuiState(state, { type: "open_live_session_command_palette" }),
      { columns: 120, rows: 14 }
    );
    expect(commandPaletteFrame).toContain("Recent commands: 0 Clear session filter | 5 Filter sessions from prompt");
    expect(commandPaletteFrame).toContain(
      "Usage ranking: 4 Cycle sort mode uses:2 | 1 Activate selected session uses:1 | 2 Pin or unpin selected session uses:1"
    );

    let viewState = reduceTuiState(state, { type: "open_live_session_command_palette" });
    viewState = reduceTuiState(viewState, { type: "cycle_live_session_command_category" });
    viewState = reduceTuiState(viewState, { type: "cycle_live_session_command_category" });
    expect(renderTuiFrame(viewState, { columns: 120, rows: 14 })).toContain(
      "> 4 [view] Cycle sort mode uses:2"
    );
  });

  it("sorts live session commands by usage within stable command groups", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_sort_mode" });
    expect(state.liveSessionCommandSortMode).toBe("catalog");

    for (const commandId of ["filter", "filter", "sort"] as const) {
      state = reduceTuiState(state, { type: "open_live_session_command_palette" });
      state = reduceTuiState(state, tuiActionForLiveSessionCommand(commandId, "command_palette"));
    }

    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_sort_mode" });
    state = reduceTuiState(state, { type: "jump_live_session_command_group", direction: 1 });
    expect(renderTuiFrame(state, { columns: 160, rows: 24 })).toContain(
      "neighbors(full):favorite(1)@1#1:activate/view(3)@5#4:filter"
    );
    state = reduceTuiState(state, { type: "cycle_live_session_command_category" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_category" });

    expect(state.liveSessionCommandSortMode).toBe("usage");
    expect(state.selectedLiveSessionCommandIndex).toBe(4);

    const usageFrame = renderTuiFrame(state, { columns: 180, rows: 24 });
    expect(usageFrame).toContain("Command palette command:1/3");
    expect(usageFrame).toContain("cat:view sort:usage");
    expect(usageFrame).toContain(
      "Usage ranking: 5 Filter sessions from prompt uses:2 | 4 Cycle sort mode uses:1"
    );
    expect(usageFrame.indexOf("Filter sessions from prompt uses:2")).toBeLessThan(
      usageFrame.indexOf("Cycle sort mode uses:1")
    );

    state = reduceTuiState(state, { type: "append_live_session_command_search", text: "sort" });
    expect(renderTuiFrame(state, { columns: 120, rows: 24 })).toContain(
      "Usage ranking: 4 Cycle sort mode uses:1"
    );
    state = reduceTuiState(state, { type: "clear_live_session_command_search" });

    state = reduceTuiState(state, { type: "toggle_live_session_command_usage_ranking" });
    expect(state.liveSessionCommandUsageRankingVisible).toBe(false);
    const hiddenRankingFrame = renderTuiFrame(state, { columns: 180, rows: 24 });
    expect(hiddenRankingFrame).toContain("ranking:off");
    expect(hiddenRankingFrame).not.toContain("Usage ranking:");
    expect(hiddenRankingFrame).toContain("Filter sessions from prompt uses:2");
    state = reduceTuiState(state, { type: "toggle_live_session_command_usage_ranking" });
    expect(state.liveSessionCommandUsageRankingVisible).toBe(true);

    state = reduceTuiState(state, { type: "cycle_live_session_command_sort_mode" });
    expect(state.liveSessionCommandSortMode).toBe("catalog");
    expect(state.selectedLiveSessionCommandIndex).toBe(3);
  });

  it("persists live command usage ranking visibility across palette reopen", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "toggle_live_session_command_usage_ranking" });
    expect(state.liveSessionCommandUsageRankingVisible).toBe(true);

    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, { type: "toggle_live_session_command_usage_ranking" });
    expect(state.liveSessionCommandUsageRankingVisible).toBe(false);
    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });

    expect(state.liveSessionCommandUsageRankingVisible).toBe(false);
    expect(renderTuiFrame(state, { columns: 180, rows: 24 })).toContain("ranking:off");
  });

  it("cycles live command usage ranking limits and persists the selected size", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_usage_ranking_limit" });
    expect(state.liveSessionCommandUsageRankingLimit).toBe(3);

    for (const commandId of ["sort", "sort", "activate", "pin", "filter", "clear_filter"] as const) {
      state = reduceTuiState(state, { type: "open_live_session_command_palette" });
      state = reduceTuiState(state, tuiActionForLiveSessionCommand(commandId, "command_palette"));
    }

    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandUsageRankingLimit).toBe(3);
    state = reduceTuiState(state, { type: "cycle_live_session_command_usage_ranking_limit" });
    expect(state.liveSessionCommandUsageRankingLimit).toBe(5);
    const narrowRankingFrame = renderTuiFrame(state, { columns: 52, rows: 14 });
    expect(narrowRankingFrame).toContain("Usage ranking: 4 Cycle sort mode uses:2 | +4 more");
    expect(narrowRankingFrame).not.toContain(
      "Usage ranking: 4 Cycle sort mode uses:2 | 1 Activate selected session"
    );
    expect(state.liveSessionCommandUsageRankingLimit).toBe(5);
    expect(renderTuiFrame(state, { columns: 120, rows: 24 })).toContain(
      "Usage ranking: 4 Cycle sort mode uses:2 | 1 Activate selected session uses:1 | +3 more"
    );
    const wideRankingFrame = renderTuiFrame(state, { columns: 200, rows: 24 });
    expect(wideRankingFrame).toContain(
      "Usage ranking: 4 Cycle sort mode uses:2 | 1 Activate selected session uses:1 | 2 Pin or unpin selected session uses:1 | 5 Filter sessions from prompt uses:1 | 0 Clear session filter uses:1"
    );
    expect(wideRankingFrame).not.toContain(" more");

    state = reduceTuiState(state, { type: "toggle_live_session_command_usage_ranking_layout" });
    expect(state.liveSessionCommandUsageRankingLayout).toBe("multi");
    expect(state.liveSessionCommandUsageRankingLineLimit).toBe(2);
    const multiNarrowFrame = renderTuiFrame(state, { columns: 52, rows: 14 });
    expect(multiNarrowFrame).toContain("Usage ranking: 4 Cycle sort mode uses:2");
    expect(multiNarrowFrame).toContain("1 Activate selected session uses:1 | +3 more");
    const multiMediumFrame = renderTuiFrame(state, { columns: 120, rows: 18 });
    expect(multiMediumFrame).toContain("0 Clear session filter uses:1");
    expect(multiMediumFrame).not.toContain(" more");

    state = reduceTuiState(state, { type: "cycle_live_session_command_usage_ranking_line_limit" });
    expect(state.liveSessionCommandUsageRankingLineLimit).toBe(3);
    const threeLineNarrowFrame = renderTuiFrame(state, { columns: 52, rows: 14 });
    expect(threeLineNarrowFrame).toContain("2 Pin or unpin selected session uses:1 | +2 more");

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandUsageRankingLayout).toBe("multi");
    expect(state.liveSessionCommandUsageRankingLineLimit).toBe(3);
    state = reduceTuiState(state, { type: "cycle_live_session_command_usage_ranking_line_limit" });
    expect(state.liveSessionCommandUsageRankingLineLimit).toBe(2);
    state = reduceTuiState(state, { type: "toggle_live_session_command_usage_ranking_layout" });
    expect(state.liveSessionCommandUsageRankingLayout).toBe("single");

    state = reduceTuiState(state, { type: "cycle_live_session_command_usage_ranking_limit" });
    expect(state.liveSessionCommandUsageRankingLimit).toBe(1);
    const topOneFrame = renderTuiFrame(state, { columns: 120, rows: 24 });
    expect(topOneFrame).toContain("Usage ranking: 4 Cycle sort mode uses:2");
    expect(topOneFrame).not.toContain("Usage ranking: 4 Cycle sort mode uses:2 | 1 Activate selected session");

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandUsageRankingLimit).toBe(1);
    state = reduceTuiState(state, { type: "cycle_live_session_command_usage_ranking_limit" });
    expect(state.liveSessionCommandUsageRankingLimit).toBe(3);
  });

  it("prioritizes history or ranking summaries while reserving executable command rows", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "toggle_live_session_command_summary_priority" });
    expect(state.liveSessionCommandSummaryPriority).toBe("history");
    state = reduceTuiState(state, { type: "cycle_live_session_command_summary_visibility_profile" });
    expect(state.liveSessionCommandSummaryVisibilityProfile).toBe("all");
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, tuiActionForLiveSessionCommand("sort", "command_palette"));
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, { type: "toggle_live_session_command_history_pin" });
    state = reduceTuiState(state, { type: "toggle_live_session_command_usage_ranking_layout" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_usage_ranking_line_limit" });

    expect(state.liveSessionCommandSummaryPriority).toBe("history");
    const constrainedFrame = renderTuiFrame(state, { columns: 120, rows: 24 });
    expect(constrainedFrame).toContain("Pinned commands: 1 Activate selected session");
    expect(constrainedFrame).toContain("Recent commands: 4 Cycle sort mode");
    expect(constrainedFrame).not.toContain("Usage ranking:");
    expect(constrainedFrame).toContain("-- favorite commands --");
    expect(constrainedFrame).toContain("> 1 [session] Activate selected session");

    state = reduceTuiState(state, { type: "toggle_live_session_command_summary_priority" });
    expect(state.liveSessionCommandSummaryPriority).toBe("ranking");
    const rankingFirstFrame = renderTuiFrame(state, { columns: 200, rows: 24 });
    expect(rankingFirstFrame).toContain("summary:ranking");
    expect(rankingFirstFrame).toContain("Usage ranking: 4 Cycle sort mode uses:1");
    expect(rankingFirstFrame).toContain("Pinned commands: 1 Activate selected session");
    expect(rankingFirstFrame).not.toContain("Recent commands:");
    expect(rankingFirstFrame).toContain("-- favorite commands --");
    expect(rankingFirstFrame).toContain("> 1 [session] Activate selected session");

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandSummaryPriority).toBe("ranking");

    state = reduceTuiState(state, { type: "cycle_live_session_command_summary_visibility_profile" });
    expect(state.liveSessionCommandSummaryVisibilityProfile).toBe("history");
    const historyProfileFrame = renderTuiFrame(state, { columns: 200, rows: 24 });
    expect(historyProfileFrame).toContain("profile:history");
    expect(historyProfileFrame).toContain("Pinned commands: 1 Activate selected session");
    expect(historyProfileFrame).toContain("Recent commands: 4 Cycle sort mode");
    expect(historyProfileFrame).not.toContain("Usage ranking:");

    state = reduceTuiState(state, { type: "cycle_live_session_command_summary_visibility_profile" });
    expect(state.liveSessionCommandSummaryVisibilityProfile).toBe("ranking");
    const rankingProfileFrame = renderTuiFrame(state, { columns: 200, rows: 24 });
    expect(rankingProfileFrame).toContain("profile:ranking");
    expect(rankingProfileFrame).toContain("Usage ranking: 4 Cycle sort mode uses:1");
    expect(rankingProfileFrame).not.toContain("Pinned commands:");
    expect(rankingProfileFrame).not.toContain("Recent commands:");
    expect(rankingProfileFrame).toContain("> 1 [session] Activate selected session");

    state = reduceTuiState(state, { type: "cycle_live_session_command_summary_visibility_profile" });
    expect(state.liveSessionCommandSummaryVisibilityProfile).toBe("minimal");
    const minimalProfileFrame = renderTuiFrame(state, { columns: 200, rows: 24 });
    expect(minimalProfileFrame).toContain("profile:minimal");
    expect(minimalProfileFrame).not.toContain("Usage ranking:");
    expect(minimalProfileFrame).not.toContain("Pinned commands:");
    expect(minimalProfileFrame).not.toContain("Recent commands:");
    expect(minimalProfileFrame).toContain("> 1 [session] Activate selected session");

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandSummaryVisibilityProfile).toBe("minimal");
    state = reduceTuiState(state, { type: "cycle_live_session_command_summary_visibility_profile" });
    expect(state.liveSessionCommandSummaryVisibilityProfile).toBe("all");
  });

  it("pins selected live session command history entries locally", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_category" });
    state = reduceTuiState(state, { type: "select_live_session_command", direction: 1 });

    expect(state.selectedLiveSessionCommandIndex).toBe(1);
    state = reduceTuiState(state, { type: "toggle_live_session_command_history_pin" });
    expect(state.liveSessionPinnedCommandHistory).toEqual(["pin"]);

    const commandPaletteFrame = renderTuiFrame(state, { columns: 120, rows: 14 });
    expect(commandPaletteFrame).toContain("Pinned commands: 2 Pin or unpin selected session");

    state = reduceTuiState(state, { type: "toggle_live_session_command_history_pin" });
    expect(state.liveSessionPinnedCommandHistory).toEqual([]);
  });

  it("clears recent and pinned live session command history locally", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, tuiActionForLiveSessionCommand("sort", "command_palette"));
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_category" });
    state = reduceTuiState(state, { type: "cycle_live_session_command_category" });
    state = reduceTuiState(state, { type: "toggle_live_session_command_history_pin" });

    expect(state.liveSessionCommandHistory).toEqual(["sort"]);
    expect(state.liveSessionPinnedCommandHistory).toEqual(["sort"]);
    expect(state.liveSessionCommandUsageCounts).toEqual({ sort: 1 });

    state = reduceTuiState(state, { type: "clear_live_session_command_history" });
    expect(state.liveSessionCommandHistory).toEqual([]);
    expect(state.liveSessionPinnedCommandHistory).toEqual([]);
    expect(state.liveSessionCommandUsageCounts).toEqual({});
    expect(state.liveSessionCommandPaletteVisible).toBe(true);
    expect(renderTuiFrame(state, { columns: 120, rows: 14 })).not.toContain("Usage ranking:");
  });

  it("tracks independent events, history, timeline, and help scroll offsets", () => {
    let state = createInitialTuiState(now);
    for (let index = 0; index < 8; index += 1) {
      state = reduceTuiState(state, {
        type: "append_event",
        event: createTuiEvent("system", `event-${index}`, now)
      });
    }
    state = reduceTuiState(state, {
      type: "set_history",
      history: Array.from({ length: 8 }, (_, index) => ({
        sessionId: `hist-${index}`,
        firstPrompt: `prompt-${index}`,
        lastTimestamp: now(),
        entryCount: 1,
        turnCount: 1
      }))
    });
    state = reduceTuiState(state, {
      type: "set_selected_timeline",
      timeline: {
        sessionId: "hist-0",
        entryCount: 8,
        turnCount: 1,
        firstTimestamp: now(),
        lastTimestamp: now(),
        entries: Array.from({ length: 8 }, (_, index) => ({
          index,
          timestamp: now(),
          type: "event",
          turnId: "turn",
          preview: `timeline-${index}`
        }))
      }
    });

    state = reduceTuiState(state, { type: "scroll_pane", pane: "events", direction: -1, amount: 3 });
    state = reduceTuiState(state, { type: "scroll_pane", pane: "history", direction: 1, amount: 2 });
    state = reduceTuiState(state, { type: "scroll_pane", pane: "timeline", direction: 1, amount: 4 });
    state = reduceTuiState(state, { type: "scroll_pane", pane: "help", direction: 1, amount: 5 });
    expect(state.eventScrollOffset).toBe(3);
    expect(state.historyScrollOffset).toBe(2);
    expect(state.timelineScrollOffset).toBe(4);
    expect(state.helpScrollOffset).toBe(5);

    state = reduceTuiState(state, { type: "scroll_pane", pane: "events", direction: 1, amount: 99 });
    state = reduceTuiState(state, { type: "scroll_pane", pane: "history", direction: -1, amount: 99 });
    state = reduceTuiState(state, { type: "scroll_pane", pane: "timeline", direction: -1, amount: 99 });
    state = reduceTuiState(state, { type: "scroll_pane", pane: "help", direction: -1, amount: 99 });
    expect(state.eventScrollOffset).toBe(0);
    expect(state.historyScrollOffset).toBe(0);
    expect(state.timelineScrollOffset).toBe(0);
    expect(state.helpScrollOffset).toBe(0);
  });

  it("coalesces assistant deltas and finalizes assistant message", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, {
      type: "append_assistant_delta",
      event: createTuiEvent("assistant", "hello ", now)
    });
    state = reduceTuiState(state, {
      type: "append_assistant_delta",
      event: createTuiEvent("assistant", "world", now)
    });

    expect(state.events.filter((event) => event.kind === "assistant")).toHaveLength(1);
    expect(state.events.at(-1)).toMatchObject({
      kind: "assistant",
      text: "hello world",
      streaming: true
    });

    state = reduceTuiState(state, {
      type: "finalize_assistant_message",
      event: createTuiEvent("assistant", "hello world", now)
    });
    expect(state.events.filter((event) => event.kind === "assistant")).toHaveLength(1);
    expect(state.events.at(-1)).toMatchObject({
      kind: "assistant",
      text: "hello world",
      streaming: false
    });
  });
});

describe("TUI input mapping", () => {
  it("maps printable, submit, pane, history, help, cancel, and exit keys", () => {
    expect(mapKeypressToTuiAction("a", undefined, { status: "idle", activePane: "prompt" })).toEqual({
      type: "append_prompt",
      text: "a"
    });
    expect(mapKeypressToTuiAction(undefined, { name: "return" }, { status: "idle", activePane: "prompt" })).toEqual({
      type: "submit_prompt"
    });
    expect(mapKeypressToTuiAction(undefined, { name: "return" }, { status: "idle", activePane: "live" })).toEqual({
      type: "activate_live_session"
    });
    expect(mapKeypressToTuiAction(undefined, { name: "return" }, { status: "idle", activePane: "history" })).toEqual({
      type: "activate_history_session"
    });
    expect(mapKeypressToTuiAction(undefined, { name: "tab" }, { status: "idle", activePane: "prompt" })).toEqual({
      type: "switch_pane"
    });
    expect(
      mapKeypressToTuiAction(undefined, { name: "tab" }, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_category"
    });
    expect(mapKeypressToTuiAction(undefined, { name: "n", ctrl: true }, { status: "idle", activePane: "prompt" })).toEqual({
      type: "create_live_session"
    });
    expect(mapKeypressToTuiAction(undefined, { name: "p", ctrl: true }, { status: "idle", activePane: "prompt" })).toEqual({
      type: "switch_live_session",
      direction: -1
    });
    expect(mapKeypressToTuiAction(undefined, { name: "w", ctrl: true }, { status: "idle", activePane: "prompt" })).toEqual({
      type: "close_live_session"
    });
    expect(mapKeypressToTuiAction(undefined, { name: "pageup" }, { status: "idle", activePane: "events" })).toEqual({
      type: "scroll_pane",
      direction: -1,
      amount: 5
    });
    expect(mapKeypressToTuiAction(undefined, { name: "pagedown" }, { status: "idle", activePane: "timeline" })).toEqual({
      type: "scroll_pane",
      direction: 1,
      amount: 5
    });
    expect(
      mapKeypressToTuiAction(undefined, { name: "pageup" }, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "scroll_live_session_command_palette",
      direction: -1
    });
    expect(
      mapKeypressToTuiAction(undefined, { name: "pagedown" }, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "scroll_live_session_command_palette",
      direction: 1
    });
    expect(
      mapKeypressToTuiAction(undefined, { name: "home" }, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "jump_live_session_command_palette",
      target: "first"
    });
    expect(
      mapKeypressToTuiAction(undefined, { name: "end" }, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "jump_live_session_command_palette",
      target: "last"
    });
    expect(mapKeypressToTuiAction(undefined, { name: "up" }, { status: "idle", activePane: "history" })).toEqual({
      type: "select_history",
      direction: -1
    });
    expect(mapKeypressToTuiAction(undefined, { name: "down" }, { status: "idle", activePane: "live" })).toEqual({
      type: "select_live_session",
      direction: 1
    });
    expect(mapKeypressToTuiAction(":", undefined, { status: "idle", activePane: "live" })).toEqual({
      type: "open_live_session_command_palette"
    });
    expect(
      mapKeypressToTuiAction(undefined, { name: "down" }, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "select_live_session_command",
      direction: 1
    });
    expect(
      mapKeypressToTuiAction(undefined, { name: "return" }, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true,
        selectedLiveSessionCommand: "close_inactive"
      })
    ).toEqual({
      type: "close_inactive_live_sessions",
      source: "command_palette"
    });
    expect(
      mapKeypressToTuiAction(undefined, { name: "escape" }, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "close_live_session_command_palette"
    });
    expect(
      mapKeypressToTuiAction("c", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "append_live_session_command_search",
      text: "c"
    });
    expect(
      mapKeypressToTuiAction("/", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "clear_live_session_command_search"
    });
    expect(
      mapKeypressToTuiAction("!", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "toggle_live_session_command_history_pin"
    });
    expect(
      mapKeypressToTuiAction("@", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "clear_live_session_command_history"
    });
    expect(
      mapKeypressToTuiAction("^", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_sort_mode"
    });
    expect(
      mapKeypressToTuiAction("%", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "toggle_live_session_command_usage_ranking"
    });
    expect(
      mapKeypressToTuiAction("+", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_usage_ranking_limit"
    });
    expect(
      mapKeypressToTuiAction("=", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "toggle_live_session_command_usage_ranking_layout"
    });
    expect(
      mapKeypressToTuiAction("]", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_usage_ranking_line_limit"
    });
    expect(
      mapKeypressToTuiAction("[", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "toggle_live_session_command_summary_priority"
    });
    expect(
      mapKeypressToTuiAction("\\", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_summary_visibility_profile"
    });
    expect(
      mapKeypressToTuiAction("'", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_neighbor_visibility_profile"
    });
    expect(
      mapKeypressToTuiAction('"', undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_neighbor_adaptive_threshold_profile"
    });
    expect(
      mapKeypressToTuiAction("|", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "toggle_live_session_command_neighbor_progress_bucket_help"
    });
    expect(
      mapKeypressToTuiAction("`", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_profile"
    });
    expect(
      mapKeypressToTuiAction("_", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_profile"
    });
    expect(
      mapKeypressToTuiAction("*", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(
      mapKeypressToTuiAction("&", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(
      mapKeypressToTuiAction("(", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(
      mapKeypressToTuiAction(")", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(
      mapKeypressToTuiAction("<", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(
      mapKeypressToTuiAction(">", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(
      mapKeypressToTuiAction("?", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(
      mapKeypressToTuiAction(":", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_deepest_nested_bucket_label_visibility_profile"
    });
    expect(
      mapKeypressToTuiAction(",", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_profile"
    });
    expect(
      mapKeypressToTuiAction(".", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(
      mapKeypressToTuiAction("-", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(
      mapKeypressToTuiAction("#", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(mapKeypressToTuiAction("$", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: true
    })).toEqual({
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(mapKeypressToTuiAction("0", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: true
    })).toEqual({
      type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile"
    });
    expect(mapKeypressToTuiAction("9", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: true
    })).toEqual({
      type: "cycle_live_session_command_latest_deepest_bucket_label_visibility_profile"
    });
    expect(mapKeypressToTuiAction("8", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: true
    })).toEqual({ type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_profile" });
    expect(mapKeypressToTuiAction("8", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: false
    })).toEqual({ type: "append_prompt", text: "8" });
    expect(mapKeypressToTuiAction("7", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: true
    })).toEqual({ type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_profile" });
    expect(mapKeypressToTuiAction("7", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: false
    })).toEqual({ type: "append_prompt", text: "7" });
    expect(mapKeypressToTuiAction("6", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: true
    })).toEqual({ type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" });
    expect(mapKeypressToTuiAction("6", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: false
    })).toEqual({ type: "append_prompt", text: "6" });
    expect(mapKeypressToTuiAction("5", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: true
    })).toEqual({ type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" });
    expect(mapKeypressToTuiAction("5", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: false
    })).toEqual({ type: "set_live_session_filter" });
    expect(mapKeypressToTuiAction("4", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: true
    })).toEqual({ type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" });
    expect(mapKeypressToTuiAction("4", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: false
    })).toEqual({ type: "cycle_live_session_sort_mode" });
    expect(mapKeypressToTuiAction("3", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: true
    })).toEqual({ type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" });
    expect(mapKeypressToTuiAction("3", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: false
    })).toEqual({ type: "close_live_session" });
    expect(mapKeypressToTuiAction("2", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: true
    })).toEqual({ type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" });
    expect(mapKeypressToTuiAction("2", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: false
    })).toEqual({ type: "toggle_live_session_pin" });
    expect(mapKeypressToTuiAction("1", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: true
    })).toEqual({ type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" });
    expect(mapKeypressToTuiAction("1", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: false
    })).toEqual({ type: "activate_live_session" });
    expect(mapKeypressToTuiAction("9", undefined, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: false
    })).toEqual({ type: "append_prompt", text: "9" });
    expect(
      mapKeypressToTuiAction(";", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "cycle_live_session_command_page_size"
    });
    expect(
      mapKeypressToTuiAction("~", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "toggle_live_session_command_selection_wrap"
    });
    expect(
      mapKeypressToTuiAction("{", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "jump_live_session_command_group",
      direction: -1
    });
    expect(
      mapKeypressToTuiAction("}", undefined, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "jump_live_session_command_group",
      direction: 1
    });
    expect(
      mapKeypressToTuiAction(undefined, { name: "backspace" }, {
        status: "idle",
        activePane: "live",
        liveSessionCommandPaletteVisible: true
      })
    ).toEqual({
      type: "backspace_live_session_command_search"
    });
    expect(mapKeypressToTuiAction("1", undefined, { status: "idle", activePane: "live" })).toEqual({
      type: "activate_live_session"
    });
    expect(mapKeypressToTuiAction("2", undefined, { status: "idle", activePane: "live" })).toEqual({
      type: "toggle_live_session_pin"
    });
    expect(mapKeypressToTuiAction("3", undefined, { status: "idle", activePane: "live" })).toEqual({
      type: "close_live_session"
    });
    expect(mapKeypressToTuiAction("4", undefined, { status: "idle", activePane: "live" })).toEqual({
      type: "cycle_live_session_sort_mode"
    });
    expect(mapKeypressToTuiAction("5", undefined, { status: "idle", activePane: "live" })).toEqual({
      type: "set_live_session_filter"
    });
    expect(mapKeypressToTuiAction("0", undefined, { status: "idle", activePane: "live" })).toEqual({
      type: "clear_live_session_filter"
    });
    expect(mapKeypressToTuiAction("x", undefined, { status: "idle", activePane: "live" })).toEqual({
      type: "close_inactive_live_sessions"
    });
    expect(mapKeypressToTuiAction("P", undefined, { status: "idle", activePane: "live" })).toEqual({
      type: "unpin_all_live_sessions"
    });
    expect(mapKeypressToTuiAction("A", undefined, { status: "idle", activePane: "live" })).toEqual({
      type: "clear_all_live_session_unread"
    });
    expect(mapKeypressToTuiAction("p", undefined, { status: "idle", activePane: "live" })).toEqual({
      type: "toggle_live_session_pin"
    });
    expect(mapKeypressToTuiAction("r", undefined, { status: "idle", activePane: "live" })).toEqual({
      type: "rename_live_session"
    });
    expect(mapKeypressToTuiAction("f", undefined, { status: "idle", activePane: "live" })).toEqual({
      type: "set_live_session_filter"
    });
    expect(mapKeypressToTuiAction("u", undefined, { status: "idle", activePane: "live" })).toEqual({
      type: "clear_live_session_filter"
    });
    expect(mapKeypressToTuiAction("s", undefined, { status: "idle", activePane: "live" })).toEqual({
      type: "cycle_live_session_sort_mode"
    });
    expect(mapKeypressToTuiAction(undefined, { name: "up" }, { status: "idle", activePane: "events" })).toEqual({
      type: "scroll_pane",
      direction: -1
    });
    expect(mapKeypressToTuiAction(undefined, { name: "down" }, { status: "idle", activePane: "timeline" })).toEqual({
      type: "scroll_pane",
      direction: 1
    });
    expect(mapKeypressToTuiAction(undefined, { name: "up" }, { status: "idle", activePane: "help" })).toEqual({
      type: "scroll_pane",
      direction: -1,
      amount: 1
    });
    expect(mapKeypressToTuiAction(undefined, { name: "down" }, { status: "idle", activePane: "help" })).toEqual({
      type: "scroll_pane",
      direction: 1,
      amount: 1
    });
    expect(mapKeypressToTuiAction("?", undefined, { status: "idle", activePane: "prompt" })).toEqual({
      type: "toggle_help"
    });
    expect(mapKeypressToTuiAction(undefined, { name: "l", ctrl: true }, { status: "idle", activePane: "prompt" })).toEqual({
      type: "force_redraw"
    });
    expect(mapKeypressToTuiAction(undefined, { name: "g", ctrl: true }, { status: "idle", activePane: "prompt" })).toEqual({
      type: "toggle_debug"
    });
    expect(mapKeypressToTuiAction(undefined, { name: "escape" }, { status: "idle", activePane: "help" })).toEqual({
      type: "switch_pane"
    });
    expect(mapKeypressToTuiAction(undefined, { name: "c", ctrl: true }, { status: "running", activePane: "prompt" })).toEqual({
      type: "request_cancel"
    });
    expect(mapKeypressToTuiAction(undefined, { name: "c", ctrl: true }, { status: "idle", activePane: "prompt" })).toEqual({
      type: "request_exit"
    });
  });

  it("cycles the latest width bucket text label profile with palette-scoped F2", () => {
    let state = createInitialTuiState();
    const cycleAction = { type: "cycle_live_session_command_latest_width_bucket_label_visibility_profile" } as const;

    expect(state.liveSessionCommandLatestWidthBucketLabelVisibilityProfile).toBe("shown");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityIndicator("shown")).toBe("latest_width_bucket_label:shown@F2");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityIndicator("hidden")).toBe("latest_width_bucket_label:hidden@F2");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityThresholdDistance("adaptive", 80)).toBe(40);
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityThresholdDistance("adaptive", 119)).toBe(1);
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityThresholdDistance("adaptive", 120)).toBeNull();
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityThresholdDistance("shown", 80)).toBeNull();
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentage(0)).toBe(0);
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentage(40)).toBe(33);
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentage(80)).toBe(66);
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentage(119)).toBe(99);
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentage(120)).toBe(100);
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentage(180)).toBe(100);
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentageBucket(0)).toBe("L");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentageBucket(39)).toBe("L");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentageBucket(40)).toBe("M");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentageBucket(79)).toBe("M");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentageBucket(80)).toBe("H");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentageBucket(120)).toBe("H");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentageBucketLabel(0)).toBe("low");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentageBucketLabel(40)).toBe("mid");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthPercentageBucketLabel(80)).toBe("high");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthIndicator(80)).toBe("80/120=66%H(high)");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthIndicator(119)).toBe("119/120=99%H(high)");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthIndicator(120)).toBe("120/120=100%H(high)");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityWidthIndicator(180)).toBe("180/120=100%H(high)");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityIndicator("adaptive", 80)).toBe("latest_width_bucket_label:adaptive>hidden+40[80/120=66%H(high)]@F2");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityIndicator("adaptive", 119)).toBe("latest_width_bucket_label:adaptive>hidden+1[119/120=99%H(high)]@F2");
    expect(liveSessionCommandLatestWidthBucketLabelVisibilityIndicator("adaptive", 120)).toBe("latest_width_bucket_label:adaptive>shown[120/120=100%H(high)]@F2");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(119, false)).toBe("119/120=99%H");

    expect(reduceTuiState(state, cycleAction)).toBe(state);
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, cycleAction);
    expect(state.liveSessionCommandLatestWidthBucketLabelVisibilityProfile).toBe("hidden");
    expect(liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelIndicator("adaptive", 119, false)).toContain("119/120=99%H]");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("latest_width_bucket_label:hidden@F2");
    expect(buildTuiDebugLines(state, { maxWidth: 119 }).join("\n")).toContain("latest_width_bucket_label:hidden@F2");

    state = reduceTuiState(state, { type: "close_live_session_command_palette" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    expect(state.liveSessionCommandLatestWidthBucketLabelVisibilityProfile).toBe("hidden");
    state = reduceTuiState(state, cycleAction);
    expect(state.liveSessionCommandLatestWidthBucketLabelVisibilityProfile).toBe("adaptive");
    expect(buildTuiHelpLines(state, { maxWidth: 119 }).join("\n")).toContain("latest_width_bucket_label:adaptive>hidden+1[119/120=99%H(high)]@F2");
    expect(buildTuiHelpLines(state, { maxWidth: 120 }).join("\n")).toContain("latest_width_bucket_label:adaptive>shown[120/120=100%H(high)]@F2");
    state = reduceTuiState(state, cycleAction);
    expect(state.liveSessionCommandLatestWidthBucketLabelVisibilityProfile).toBe("shown");

    expect(mapKeypressToTuiAction(undefined, { name: "f2" }, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: true
    })).toEqual(cycleAction);
    expect(mapKeypressToTuiAction(undefined, { name: "f2" }, {
      status: "idle", activePane: "live", liveSessionCommandPaletteVisible: false
    })).toBeUndefined();
  });

  it("maps line input to append and submit actions", () => {
    expect(mapLineToTuiAction("hello")).toEqual([
      { type: "append_prompt", text: "hello" },
      { type: "submit_prompt" }
    ]);
    expect(mapLineToTuiAction("   ")).toEqual([]);
  });
});

describe("TUI renderer", () => {
  it("renders prompt, events, history, help, and bounded width", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "s1" });
    state = reduceTuiState(state, { type: "append_prompt", text: "hello" });
    for (const text of ["old-event", "middle-event", "Tool requested: Read", "latest-event"]) {
      state = reduceTuiState(state, {
        type: "append_event",
        event: createTuiEvent("tool_call", text, now)
      });
    }
    state = reduceTuiState(state, {
      type: "set_history",
      history: [
        { sessionId: "old-0", firstPrompt: "read file 0", lastTimestamp: now(), entryCount: 3, turnCount: 1 },
        { sessionId: "old-1", firstPrompt: "read file 1", lastTimestamp: now(), entryCount: 3, turnCount: 1 },
        { sessionId: "old-2", firstPrompt: "read file 2", lastTimestamp: now(), entryCount: 3, turnCount: 1 }
      ]
    });
    state = reduceTuiState(state, {
      type: "set_selected_timeline",
      timeline: {
        sessionId: "old-0",
        entryCount: 3,
        turnCount: 1,
        firstTimestamp: now(),
        lastTimestamp: now(),
        entries: [
          { index: 0, timestamp: now(), type: "user", turnId: "t", preview: "timeline-0" },
          { index: 1, timestamp: now(), type: "assistant", turnId: "t", preview: "timeline-1" },
          { index: 2, timestamp: now(), type: "tool", turnId: "t", preview: "timeline-2" }
        ]
      }
    });
    state = reduceTuiState(state, { type: "scroll_pane", pane: "events", direction: -1, amount: 1 });
    state = reduceTuiState(state, { type: "scroll_pane", pane: "history", direction: 1, amount: 1 });
    state = reduceTuiState(state, { type: "scroll_pane", pane: "timeline", direction: 1, amount: 1 });
    state = reduceTuiState(state, { type: "toggle_help" });
    state = reduceTuiState(state, { type: "toggle_debug" });
    state = reduceTuiState(state, {
      type: "show_approval_modal",
      modal: {
        toolName: "Write",
        reason: "Write modifies files.",
        cwd: "/workspace",
        sessionId: "s1",
        turnId: "t1",
        toolCallId: "tc1",
        inputLines: [{ label: "path", value: "demo.txt" }],
        truncated: true,
        redacted: false
      }
    });

    const frame = renderTuiFrame(state, { columns: 60, rows: 42 });
    expect(frame).toContain("GOD-code");
    expect(frame).toContain("Live: s1 (1/1)");
    expect(frame).toContain("Status: idle");
    expect(frame).toContain("View: old-0");
    expect(frame).toContain("Live Sessions");
    expect(frame).toContain("Quick actions: 1 activate");
    expect(frame).toContain("Bulk actions: x close inactive");
    expect(frame).toContain(">* [idle] s1");
    expect(frame).toContain("> hello");
    expect(frame).toContain("Tool requested: Read");
    expect(frame).toContain("History offset 1/2");
    expect(frame).toContain("old-1 1 turn(s) read file 1");
    expect(frame).toContain("Timeline offset 1/2");
    expect(frame).toContain("timeline-1");
    expect(frame).toContain("* Help");
    expect(frame).toContain("Approval modal: y allow");
    expect(frame).toContain("Normal prompt input is paused");
    expect(frame).toContain("Debug");
    expect(frame).toContain("status=idle pane=help live=1/1");
    expect(frame).toContain("Approval");
    expect(frame).toContain("Tool: Write");
    expect(frame).toContain("Press y to allow");
  });

  it("uses compact layout to prioritize active pane on small terminals", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "s1" });
    state = reduceTuiState(state, { type: "switch_pane" });
    state = reduceTuiState(state, { type: "switch_pane" });
    state = reduceTuiState(state, { type: "switch_pane" });
    state = reduceTuiState(state, { type: "switch_pane" });
    state = reduceTuiState(state, {
      type: "set_selected_timeline",
      timeline: {
        sessionId: "small-session",
        entryCount: 2,
        turnCount: 1,
        firstTimestamp: now(),
        lastTimestamp: now(),
        entries: [
          { index: 0, timestamp: now(), type: "user", turnId: "t", preview: "compact timeline user" },
          { index: 1, timestamp: now(), type: "assistant", turnId: "t", preview: "compact timeline assistant" }
        ]
      }
    });

    const frame = renderTuiFrame(state, { columns: 52, rows: 14 });
    expect(frame).toContain("Pane: timeline");
    expect(frame).toContain("* Timeline");
    expect(frame).toContain("compact timeline user");
    expect(frame).toContain("Enter switch/submit");
  });

  it("marks the active prompt pane in full and compact layouts", () => {
    const state = reduceTuiState(createInitialTuiState(now), { type: "append_prompt", text: "focused prompt" });

    const fullFrame = renderTuiFrame(state, { columns: 52, rows: 24 });
    const compactFrame = renderTuiFrame(state, { columns: 52, rows: 12 });

    expect(fullFrame).toContain("* Prompt");
    expect(compactFrame).toContain("* Prompt");
    expect(compactFrame).toContain("focused prompt");
  });

  it("uses compact layout to prioritize live session list pane", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-1" });
    state = reduceTuiState(state, { type: "session_started", sessionId: "live-2" });
    state = reduceTuiState(state, { type: "switch_pane" });
    state = reduceTuiState(state, { type: "toggle_live_session_pin" });
    state = reduceTuiState(state, { type: "rename_live_session", label: "main worker" });
    state = reduceTuiState(state, { type: "set_live_session_filter", filter: "worker" });
    state = reduceTuiState(state, { type: "cycle_live_session_sort_mode" });

    const frame = renderTuiFrame(state, { columns: 52, rows: 14 });
    expect(frame).toContain("Pane: live");
    expect(frame).toContain("* Live Sessions sort:name filter:worker");
    expect(frame).toContain("Quick actions: 1 activate");
    expect(frame).toContain("Bulk actions: x close inactive");
    expect(frame).not.toContain("[idle] live-1");
    expect(frame).toContain(">* [idle] pinned main worker (live-2)");

    const emptyFilterFrame = renderTuiFrame(
      reduceTuiState(state, { type: "set_live_session_filter", filter: "missing" }),
      { columns: 52, rows: 14 }
    );
    expect(emptyFilterFrame).toContain("Quick actions: 1 activate");
    expect(emptyFilterFrame).toContain("Bulk actions: x close inactive");
    expect(emptyFilterFrame).toContain("No live sessions match filter: missing");

    const commandPaletteFrame = renderTuiFrame(
      reduceTuiState(state, { type: "open_live_session_command_palette" }),
      { columns: 56, rows: 14 }
    );
    expect(commandPaletteFrame).toContain("Command palette command:1/9 group:1/4:favorite(1/1)");
    expect(commandPaletteFrame).toContain("-- favorite commands --");
    expect(commandPaletteFrame).toContain("-- session commands --");
    expect(commandPaletteFrame).toContain("> 1 [session] Activate selected session");

    const searchedCommandPaletteFrame = renderTuiFrame(
      reduceTuiState(
        reduceTuiState(state, { type: "open_live_session_command_palette" }),
        { type: "append_live_session_command_search", text: "mark" }
      ),
      { columns: 56, rows: 14 }
    );
    expect(searchedCommandPaletteFrame).toContain("Command palette command:1/1 group:1/1:bulk(1/1)");
    expect(searchedCommandPaletteFrame).toContain("-- bulk commands --");
    expect(searchedCommandPaletteFrame).toContain("> A [bulk] Mark all sessions read");

    const categorizedCommandPaletteFrame = renderTuiFrame(
      reduceTuiState(
        reduceTuiState(state, { type: "open_live_session_command_palette" }),
        { type: "cycle_live_session_command_category" }
      ),
      { columns: 56, rows: 14 }
    );
    expect(categorizedCommandPaletteFrame).toContain("Command palette command:1/3 group:1/2:favorite(1/1)");
    expect(categorizedCommandPaletteFrame).toContain("-- favorite commands --");
    expect(categorizedCommandPaletteFrame).toContain("-- session commands --");
    expect(categorizedCommandPaletteFrame).toContain("[session] Activate selected session");
    expect(categorizedCommandPaletteFrame).not.toContain("[bulk]");
  });

  it("uses compact layout to prioritize approval modal on small terminals", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, {
      type: "show_approval_modal",
      modal: {
        toolName: "Bash",
        reason: "Bash can execute commands.",
        cwd: "/workspace",
        sessionId: "s1",
        turnId: "t1",
        toolCallId: "tc1",
        inputLines: [{ label: "command", value: "npm test" }],
        truncated: false,
        redacted: false
      }
    });

    const frame = renderTuiFrame(state, { columns: 52, rows: 16 });
    expect(frame).toContain("Approval");
    expect(frame).toContain("Tool: Bash");
    expect(frame).toContain("Press y to allow");
    expect(frame).toContain("Enter switch/submit");
  });

  it("uses compact layout to prioritize debug diagnostics", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "debug-session" });
    state = reduceTuiState(state, { type: "toggle_debug" });

    const frame = renderTuiFrame(state, { columns: 52, rows: 12 });
    expect(frame).toContain("Debug");
    expect(frame).toContain("session=debug-session");
    expect(frame).toContain("live_statuses=debug-session:idle");
  });

  it("renders scrollable help in full and compact layouts", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "help-session" });
    state = reduceTuiState(state, { type: "switch_pane" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = {
      ...state,
      activePane: "help",
      helpVisible: true,
      liveSessionCommandPaletteVisible: true,
      helpScrollOffset: 10_000
    };

    for (const dimensions of [{ columns: 80, rows: 18 }, { columns: 120, rows: 30 }]) {
      const frame = renderTuiFrame(state, dimensions);
      expect(frame).toMatch(/\* Help \[\d+-\d+\/\d+\]/);
      expect(frame).toContain("latest_width_bucket_label");
    }
  });
});

describe("TUI controller", () => {
  it("refuses non-interactive terminals by default", async () => {
    const dir = await createTempDir();
    const input = new PassThrough();
    const output = new RecordingOutput();
    Object.defineProperty(output, "isTTY", { value: false });
    const controller = new TuiController(dir, {
      input,
      output,
      sessionFactory: (callbacks) => new FakeTuiSession(callbacks),
      now
    });

    await expect(controller.start()).rejects.toThrow("god-code tui requires an interactive terminal.");
  });

  it("starts, submits through the session boundary, converts events, and cancels", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    await writeTranscript(transcriptDir, "hist-session");
    const output = new RecordingOutput();
    let fakeSession: FakeTuiSession | undefined;
    const controller = new TuiController(dir, {
      output,
      transcriptDir,
      interactive: true,
      sessionFactory: (callbacks) => {
        fakeSession = new FakeTuiSession(callbacks);
        return fakeSession;
      },
      now
    });

    await controller.start();
    await controller.submitPrompt("hello tui");

    expect(fakeSession?.started).toBe(true);
    expect(controller.getState().sessionId).toBe("fake-session");
    expect(controller.getState().viewedSessionId).toBe("hist-session");
    expect(controller.getState().selectedTimeline?.sessionId).toBe("hist-session");
    expect(controller.getState().selectedTimeline?.entries[0]?.preview).toBe("read fixture");
    expect(fakeSession?.prompts).toEqual(["hello tui"]);
    expect(controller.getState().status).toBe("idle");
    expect(controller.getState().events.filter((event) => event.kind === "assistant")).toEqual([
      expect.objectContaining({
        text: "fake response",
        streaming: false
      })
    ]);
    fakeSession?.emit({
      event_type: "tool_call_requested",
      session_id: "fake-session",
      turn_id: "turn",
      sequence: 4,
      payload: {
        tool_call: { tool_call_id: "call", tool_name: "Read", input: { path: "a" } },
        execution_mode: "serial"
      }
    });
    fakeSession?.emit({
      event_type: "tool_result_received",
      session_id: "fake-session",
      turn_id: "turn",
      sequence: 5,
      payload: {
        tool_call_id: "call",
        tool_name: "Read",
        result: { ok: false, error: { code: "failed", message: "read failed" } }
      }
    });
    fakeSession?.emit({
      event_type: "god_code_error",
      session_id: "fake-session",
      turn_id: "turn",
      sequence: 6,
      payload: { error: { code: "failed", message: "read failed" } }
    });
    expect(controller.getState().events.map((event) => event.text)).toEqual(expect.arrayContaining([
      "Tool requested: Read",
      "Tool result: Read error",
      "read failed"
    ]));
    expect(output.toString()).toContain("hist-session");
    expect(output.toString()).toContain("Submitted prompt: hello tui");

    controller.applyAction({ type: "set_status", status: "running" });
    await controller.cancelCurrentTurn();
    expect(fakeSession?.cancelled).toBe(true);

    await controller.stop();
    expect(fakeSession?.stopped).toBe(true);
  });

  it("creates and switches live TUI sessions", async () => {
    const dir = await createTempDir();
    const output = new RecordingOutput();
    const sessions: FakeTuiSession[] = [];
    let nextSession = 0;
    const controller = new TuiController(dir, {
      output,
      interactive: true,
      sessionFactory: (callbacks) => {
        nextSession += 1;
        const session = new FakeTuiSession(callbacks, { status: "success", messages: [] }, `fake-${nextSession}`);
        sessions.push(session);
        return session;
      },
      now
    });

    await controller.start();
    await controller.createLiveSession();

    expect(controller.getState().liveSessions.map((session) => session.sessionId)).toEqual(["fake-1", "fake-2"]);
    expect(controller.getState().sessionId).toBe("fake-2");

    expect(controller.switchLiveSession(-1)).toBe(true);
    expect(controller.getState().sessionId).toBe("fake-1");

    await controller.submitPrompt("from first");
    expect(sessions[0]?.prompts).toEqual(["from first"]);
    expect(sessions[1]?.prompts).toEqual([]);

    await controller.createLiveSession();
    expect(controller.getState().liveSessions.map((session) => session.sessionId)).toEqual(["fake-1", "fake-2", "fake-3"]);
    expect(controller.switchLiveSession(1)).toBe(true);
    expect(controller.getState().sessionId).toBe("fake-1");
    const closedInactive = await controller.closeInactiveLiveSessions();
    expect(closedInactive).toEqual(["fake-2", "fake-3"]);
    expect(controller.getState().liveSessions.map((session) => session.sessionId)).toEqual(["fake-1"]);
    expect(controller.getState().sessionId).toBe("fake-1");
    expect(sessions[1]?.stopped).toBe(true);
    expect(sessions[2]?.stopped).toBe(true);
    expect(output.toString()).toContain("Closed inactive live sessions: fake-2, fake-3");

    await controller.stop();
    expect(sessions.every((session) => session.stopped)).toBe(true);
  });
});
