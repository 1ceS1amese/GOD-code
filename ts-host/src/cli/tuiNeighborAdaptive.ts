import { LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_SHORTCUT } from "./tuiCommandPaletteConstants.js";
import type {
  TuiLiveSessionCommandNeighborAdaptiveThresholdProfile,
  TuiLiveSessionCommandNeighborVisibilityProfile
} from "./tuiTypes.js";

export function resolveLiveSessionCommandNeighborVisibilityProfile(
  preferred: TuiLiveSessionCommandNeighborVisibilityProfile,
  maxWidth: number,
  thresholdProfile: TuiLiveSessionCommandNeighborAdaptiveThresholdProfile = "balanced"
): TuiLiveSessionCommandNeighborVisibilityProfile {
  const threshold = liveSessionCommandNeighborAdaptiveThresholds(thresholdProfile);
  const widthLimit: TuiLiveSessionCommandNeighborVisibilityProfile = maxWidth < threshold.standard
    ? "compact"
    : maxWidth < threshold.full
      ? "standard"
      : "full";
  const rank: Record<TuiLiveSessionCommandNeighborVisibilityProfile, number> = {
    compact: 0,
    standard: 1,
    full: 2
  };
  return rank[preferred] <= rank[widthLimit] ? preferred : widthLimit;
}

export function liveSessionCommandNeighborAdaptiveThresholds(
  profile: TuiLiveSessionCommandNeighborAdaptiveThresholdProfile
): { standard: number; full: number } {
  return {
    dense: { standard: 72, full: 112 },
    balanced: { standard: 88, full: 128 },
    spacious: { standard: 104, full: 144 }
  }[profile];
}

export function liveSessionCommandNeighborAdaptiveThresholdLabel(
  profile: TuiLiveSessionCommandNeighborAdaptiveThresholdProfile
): string {
  const thresholds = liveSessionCommandNeighborAdaptiveThresholds(profile);
  return `${profile}[${thresholds.standard}/${thresholds.full}]`;
}

export function liveSessionCommandNeighborAdaptiveThresholdDistance(
  effectiveProfile: TuiLiveSessionCommandNeighborVisibilityProfile,
  maxWidth: number,
  thresholdProfile: TuiLiveSessionCommandNeighborAdaptiveThresholdProfile
): number | null {
  const thresholds = liveSessionCommandNeighborAdaptiveThresholds(thresholdProfile);
  if (effectiveProfile === "compact" && maxWidth < thresholds.standard) {
    return thresholds.standard - maxWidth;
  }
  if (effectiveProfile === "standard" && maxWidth < thresholds.full) {
    return thresholds.full - maxWidth;
  }
  return null;
}

export function liveSessionCommandNeighborAdaptiveThresholdTarget(
  effectiveProfile: TuiLiveSessionCommandNeighborVisibilityProfile,
  maxWidth: number,
  thresholdProfile: TuiLiveSessionCommandNeighborAdaptiveThresholdProfile
): "standard" | "full" | null {
  const thresholds = liveSessionCommandNeighborAdaptiveThresholds(thresholdProfile);
  if (effectiveProfile === "compact" && maxWidth < thresholds.standard) {
    return "standard";
  }
  if (effectiveProfile === "standard" && maxWidth < thresholds.full) {
    return "full";
  }
  return null;
}

export function liveSessionCommandNeighborAdaptiveThresholdProgress(
  effectiveProfile: TuiLiveSessionCommandNeighborVisibilityProfile,
  maxWidth: number,
  thresholdProfile: TuiLiveSessionCommandNeighborAdaptiveThresholdProfile
): number | null {
  const thresholds = liveSessionCommandNeighborAdaptiveThresholds(thresholdProfile);
  if (effectiveProfile === "compact" && maxWidth < thresholds.standard) {
    return Math.max(0, Math.min(99, Math.floor((maxWidth / thresholds.standard) * 100)));
  }
  if (effectiveProfile === "standard" && maxWidth < thresholds.full) {
    const span = thresholds.full - thresholds.standard;
    return Math.max(0, Math.min(99, Math.floor(((maxWidth - thresholds.standard) / span) * 100)));
  }
  return null;
}

export function liveSessionCommandNeighborAdaptiveThresholdProgressBucket(progress: number): "L" | "M" | "H" {
  if (progress < 33) {
    return "L";
  }
  return progress < 66 ? "M" : "H";
}

export function liveSessionCommandNeighborAdaptiveThresholdProgressBucketLabel(
  bucket: "L" | "M" | "H"
): "low" | "mid" | "high" {
  if (bucket === "L") {
    return "low";
  }
  return bucket === "M" ? "mid" : "high";
}

export function liveSessionCommandNeighborProgressBucketHelpStatusLabel(visible: boolean): "on" | "off" {
  return visible ? "on" : "off";
}

export function liveSessionCommandNeighborProgressBucketHelpIndicator(
  visible: boolean
): `on@${typeof LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_SHORTCUT}` | `off@${typeof LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_SHORTCUT}` {
  return `${liveSessionCommandNeighborProgressBucketHelpStatusLabel(visible)}@${LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_SHORTCUT}`;
}

export function liveSessionCommandNeighborProgressBucketHelpCompactIndicator(
  visible: boolean
): `bucket:${ReturnType<typeof liveSessionCommandNeighborProgressBucketHelpIndicator>}` {
  return `bucket:${liveSessionCommandNeighborProgressBucketHelpIndicator(visible)}`;
}

export function liveSessionCommandNeighborProgressBucketHelpCompactLegend(): string {
  const buckets = ["L", "M", "H"] as const;
  return ` bucket:${buckets.join("/")}=${buckets
    .map((bucket) => liveSessionCommandNeighborAdaptiveThresholdProgressBucketLabel(bucket))
    .join("/")}`;
}
