/** Pure helpers for the micro-sparklines (inline SVG, no chart library). */

/** Sort by date, drop non-finite values, evenly downsample keeping first and last. [] for <2 points. */
export function buildSparkline(points: [string, number][], maxPoints = 24): number[] {
  const clean = points
    .filter(([d, v]) => typeof d === "string" && Number.isFinite(v))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, v]) => v);
  if (clean.length < 2) return [];
  const max = Math.max(2, Math.floor(maxPoints));
  if (clean.length <= max) return clean;
  const out: number[] = [];
  for (let i = 0; i < max; i++) {
    out.push(clean[Math.round((i * (clean.length - 1)) / (max - 1))]);
  }
  return out;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** SVG path 'M x y L x y ...'. Higher values are higher on screen; flat series is a centred line. */
export function sparklinePath(values: number[], width: number, height: number, pad = 1): string {
  const v = values.filter(Number.isFinite);
  if (v.length === 0) return "";
  const min = Math.min(...v);
  const max = Math.max(...v);
  const range = max - min;
  const innerW = Math.max(0, width - pad * 2);
  const innerH = Math.max(0, height - pad * 2);
  const n = v.length;
  return v
    .map((val, i) => {
      const x = n === 1 ? width / 2 : pad + (innerW * i) / (n - 1);
      const y = range === 0 ? height / 2 : pad + innerH * (1 - (val - min) / range);
      return `${i === 0 ? "M" : "L"} ${fmt(x)} ${fmt(y)}`;
    })
    .join(" ");
}

/** Direction between first and last value (changes under 0.05% of the starting magnitude count as flat). */
export function sparklineTrend(values: number[]): "up" | "down" | "flat" {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return "flat";
  const first = v[0];
  const last = v[v.length - 1];
  const diff = last - first;
  const eps = Math.max(Math.abs(first), Math.abs(last)) * 0.0005;
  if (Math.abs(diff) <= eps) return "flat";
  return diff > 0 ? "up" : "down";
}
