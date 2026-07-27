export type TuiWidthBucket = "L" | "M" | "H";
export type TuiWidthBucketLabel = "low" | "mid" | "high";

export function tuiWidthPercentage(maxWidth: number, threshold: number): number {
  return Math.max(0, Math.min(100, Math.floor((maxWidth / threshold) * 100)));
}

export function tuiWidthPercentageBucket(percentage: number): TuiWidthBucket {
  if (percentage < 33) {
    return "L";
  }
  if (percentage < 66) {
    return "M";
  }
  return "H";
}

export function tuiWidthPercentageBucketLabel(bucket: TuiWidthBucket): TuiWidthBucketLabel {
  if (bucket === "L") {
    return "low";
  }
  if (bucket === "M") {
    return "mid";
  }
  return "high";
}

export function formatTuiWidthMetrics(
  maxWidth: number,
  threshold: number,
  bucketLabelVisible = true
): string {
  const percentage = tuiWidthPercentage(maxWidth, threshold);
  const bucket = tuiWidthPercentageBucket(percentage);
  const bucketLabel = bucketLabelVisible ? `(${tuiWidthPercentageBucketLabel(bucket)})` : "";
  return `${maxWidth}/${threshold}=${percentage}%${bucket}${bucketLabel}`;
}
