// Small qualitative palette for dynamic-group stacked charts (región,
// pipeline) — the site has no existing multi-series chart palette to
// reuse, brand-magenta/text-primary (the site's own two brand colors)
// anchor the first two slots, the rest are additions picked for
// distinguishability against the sage background.
const CHART_PALETTE = [
  "#ff00fb", // brand magenta
  "#3d373d", // text primary
  "#2f8f6b",
  "#d9a441",
  "#3f6fd1",
  "#c1443c",
  "#6b4fa0",
  "#1fa6a6",
  "#a0522d",
  "#7a8f3d",
];

export function colorFor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}
