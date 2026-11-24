import { parseReportDate } from "./reportDate.ts";

export function priceTimeline(dates: string[], left: number, right: number) {
  const times = dates.map((date) =>
    parseReportDate(date.length === 10 ? date + "T00:00:00" : date).getTime(),
  );
  const valid = times.filter(Number.isFinite);
  const start = Math.min(...valid);
  const span = Math.max(...valid) - start;
  return times.map((time) => {
    if (!Number.isFinite(time)) return null;
    if (span === 0) return (left + right) / 2;
    return left + ((time - start) / span) * (right - left);
  });
}

export function visibleChartLabels(positions: number[], minGap: number) {
  const visible = new Set<number>();
  if (!positions.length) return visible;
  // Keep the latest label, then give the earliest one priority over interior dates.
  for (const index of [positions.length - 1, ...positions.keys()]) {
    if (
      [...visible].every(
        (i) => Math.abs(positions[i] - positions[index]) >= minGap,
      )
    )
      visible.add(index);
  }
  return visible;
}
