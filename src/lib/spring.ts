/**
 * Closed-form damped spring step response, normalised to a 0..1 timeline.
 * No physics loop and no dependency: `springProgress(t)` is a pure function,
 * so the same curve drives counters (and is trivially unit-testable).
 *
 * Default is critically damped (ratio 1): fast start, soft landing, never
 * overshoots, which is what money figures need. A `bounce` damping ratio below
 * 1 allows a slight overshoot, clamped to `MAX_OVERSHOOT`.
 */

/** Decay rate: e^-7 is ~0.1% of the travel left at t = 1. */
const DECAY = 7;
export const MAX_OVERSHOOT = 1.1;

export function springProgress(t: number, opts: { bounce?: number } = {}): number {
  if (!Number.isFinite(t) || t <= 0) return 0;
  if (t >= 1) return 1;
  const zeta = Math.min(1, Math.max(0.05, opts.bounce ?? 1));
  if (zeta >= 1) {
    const raw = (x: number) => 1 - (1 + DECAY * x) * Math.exp(-DECAY * x);
    return Math.min(1, raw(t) / raw(1));
  }
  const wd = (DECAY * Math.sqrt(1 - zeta * zeta)) / zeta;
  const k = DECAY;
  const y = 1 - Math.exp(-k * t) * (Math.cos(wd * t) + (k / wd) * Math.sin(wd * t));
  return Math.min(MAX_OVERSHOOT, Math.max(0, y));
}
