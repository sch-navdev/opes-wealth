/**
 * Geometry for the Chronograph allocation dial (a watch-face style ring). Pure, no React: the component only
 * renders what this returns. Angles are in radians, 0 at 12 o'clock, clockwise.
 */
export type DialInput = { key: string; share: number };

export type DialArc = {
  key: string;
  /** Share of the whole, 0-100 (as given, after dropping non-positive entries). */
  share: number;
  /** SVG path for the arc (or `null` when the slice is a full ring: draw a circle instead). */
  path: string | null;
  full: boolean;
};

export type DialTick = { x1: number; y1: number; x2: number; y2: number; major: boolean };

const TAU = Math.PI * 2;

function point(c: number, r: number, angle: number): [number, number] {
  return [c + r * Math.sin(angle), c - r * Math.cos(angle)];
}

const f = (n: number) => Number(n.toFixed(2));

/** The 60 minute ticks around the rim; every fifth is an index ("hour") mark. */
export function dialTicks(size: number, rimInset = 1, minor = 4, major = 8): DialTick[] {
  const c = size / 2;
  const rOuter = c - rimInset;
  return Array.from({ length: 60 }, (_, i) => {
    const angle = (i / 60) * TAU;
    const isMajor = i % 5 === 0;
    const [x1, y1] = point(c, rOuter - (isMajor ? major : minor), angle);
    const [x2, y2] = point(c, rOuter, angle);
    return { x1: f(x1), y1: f(y1), x2: f(x2), y2: f(y2), major: isMajor };
  });
}

/**
 * The allocation ring: one arc per positive slice, in the given order, a small gap between neighbours.
 * `radius` is the centre line of the ring. Shares are normalised to their own sum, so the ring always closes.
 */
export function dialArcs(items: DialInput[], size: number, radius: number, gapRad = 0.035): DialArc[] {
  const slices = items.filter((i) => Number.isFinite(i.share) && i.share > 0);
  const total = slices.reduce((s, i) => s + i.share, 0);
  if (total <= 0) return [];
  const c = size / 2;
  let start = 0;
  return slices.map((slice) => {
    const span = (slice.share / total) * TAU;
    const full = slices.length === 1 || span >= TAU - 1e-6;
    const gap = slices.length > 1 ? Math.min(gapRad, span / 3) : 0;
    const a0 = start + gap / 2;
    const a1 = start + span - gap / 2;
    start += span;
    if (full) return { key: slice.key, share: slice.share, path: null, full: true };
    const [x0, y0] = point(c, radius, a0);
    const [x1, y1] = point(c, radius, a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return {
      key: slice.key,
      share: slice.share,
      path: `M${f(x0)} ${f(y0)} A${radius} ${radius} 0 ${large} 1 ${f(x1)} ${f(y1)}`,
      full: false,
    };
  });
}
