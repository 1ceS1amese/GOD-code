export type TuiAdaptiveVisibilityProfile = "shown" | "hidden" | "adaptive";

export function resolveTuiAdaptiveVisibilityProfile(
  profile: TuiAdaptiveVisibilityProfile,
  maxWidth: number,
  threshold: number
): Exclude<TuiAdaptiveVisibilityProfile, "adaptive"> {
  if (profile !== "adaptive") {
    return profile;
  }
  return maxWidth >= threshold ? "shown" : "hidden";
}

export function tuiAdaptiveVisibilityThresholdDistance(
  profile: string,
  maxWidth: number,
  threshold: number
): number | null {
  if (profile !== "adaptive" || maxWidth >= threshold) {
    return null;
  }
  return threshold - maxWidth;
}

export function formatTuiAdaptiveVisibilityIndicator(options: {
  name: string;
  profile: string;
  maxWidth: number;
  threshold: number;
  shortcut: string;
  widthIndicator: () => string;
  effectiveProfile?: string;
  thresholdDistance?: number | null;
}): string {
  const effectiveProfile = options.effectiveProfile ?? resolveTuiAdaptiveVisibilityProfile(
    options.profile as TuiAdaptiveVisibilityProfile,
    options.maxWidth,
    options.threshold
  );
  const thresholdDistance = options.thresholdDistance === undefined
    ? tuiAdaptiveVisibilityThresholdDistance(options.profile, options.maxWidth, options.threshold)
    : options.thresholdDistance;
  const effectiveLabel = `${effectiveProfile}${thresholdDistance === null ? "" : `+${thresholdDistance}`}`;
  const profileLabel = options.profile === "adaptive"
    ? `${options.profile}>${effectiveLabel}[${options.widthIndicator()}]`
    : options.profile;
  return `${options.name}:${profileLabel}@${options.shortcut}`;
}
