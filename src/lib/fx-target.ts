/**
 * Optional target mix for the Global exposure bar, and the drift of the actual mix from it. Pure, no React, no I/O.
 *
 * A target is a percent of net worth per exposure SEGMENT (the bar's rows: one currency, or the merged
 * "AED + USD" block when the peg grouping is on, keyed exactly like `FxExposureRow.key`). It is a personal
 * reference, never a recommendation: the wording is "over / under target" and nothing is suggested.
 *
 * Storage is a UI preference kept in localStorage (see `FX_TARGET_STORAGE_KEY`), the same local-storage-with-
 * fallback approach as the other dashboard preferences. It was deliberately NOT given a database column
 * (that would need a migration). Stored text is never trusted: `parseFxTargets` sanitises anything.
 */
import type { FxExposure, FxExposureRow } from "@/lib/fx-exposure";

export const FX_TARGET_STORAGE_KEY = "opes_fx_targets";
export const FX_TARGET_VERSION = 1;

/** Percentage points either side of a target that still counts as "within tolerance". */
export const FX_TARGET_DEFAULT_TOLERANCE = 5;
export const FX_TARGET_MIN_TOLERANCE = 0;
export const FX_TARGET_MAX_TOLERANCE = 50;
const MAX_TARGETS = 30;

export type FxTargets = {
  /** Segment key -> target percent (0-100). Only segments the user set are present. */
  targets: Record<string, number>;
  /** Tolerance band in percentage points. */
  tolerance: number;
};

export const EMPTY_FX_TARGETS: FxTargets = { targets: {}, tolerance: FX_TARGET_DEFAULT_TOLERANCE };

const round1 = (n: number) => Math.round(n * 10) / 10;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function clampTolerance(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return FX_TARGET_DEFAULT_TOLERANCE;
  return round1(Math.min(FX_TARGET_MAX_TOLERANCE, Math.max(FX_TARGET_MIN_TOLERANCE, value)));
}

/** Turns stored text (or anything) into well-formed targets. Never throws; garbage gives "no targets". */
export function parseFxTargets(raw: unknown): FxTargets {
  let data: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return { targets: {}, tolerance: FX_TARGET_DEFAULT_TOLERANCE };
    try {
      data = JSON.parse(raw);
    } catch {
      return { targets: {}, tolerance: FX_TARGET_DEFAULT_TOLERANCE };
    }
  }
  if (!isRecord(data)) return { targets: {}, tolerance: FX_TARGET_DEFAULT_TOLERANCE };

  const targets: Record<string, number> = {};
  if (isRecord(data.targets)) {
    for (const [key, value] of Object.entries(data.targets).slice(0, MAX_TARGETS)) {
      const cleanKey = key.trim().toUpperCase().slice(0, 40);
      if (!/^[A-Z0-9?]+(\+[A-Z0-9?]+)*$/.test(cleanKey)) continue;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) continue;
      targets[cleanKey] = round1(value);
    }
  }
  return { targets, tolerance: clampTolerance(data.tolerance) };
}

export function serializeFxTargets(value: FxTargets): string {
  return JSON.stringify({ v: FX_TARGET_VERSION, targets: value.targets, tolerance: clampTolerance(value.tolerance) });
}

/** Sets (or, with null / NaN, removes) one segment's target. Out-of-range values are clamped to 0-100. */
export function withTarget(current: FxTargets, key: string, percent: number | null): FxTargets {
  const next = { ...current.targets };
  if (percent === null || !Number.isFinite(percent)) delete next[key];
  else next[key] = round1(Math.min(100, Math.max(0, percent)));
  return { ...current, targets: next };
}

export function hasTargets(value: FxTargets): boolean {
  return Object.keys(value.targets).length > 0;
}

/** Sum of the targets that were set (informational: they need not add up to 100). */
export function targetsTotal(value: FxTargets): number {
  return round1(Object.values(value.targets).reduce((s, n) => s + n, 0));
}

export type FxDriftStatus = "over" | "under" | "within";

export type FxDriftRow = {
  key: string;
  label: string;
  /** Actual share of net worth, percent (0 for a target that has no holding). */
  share: number;
  target: number;
  /** share - target, in percentage points (signed). */
  drift: number;
  status: FxDriftStatus;
};

export type FxDrift = {
  /** Drift is only meaningful against a net-worth basis (shares of a positive net worth). */
  active: boolean;
  tolerance: number;
  rows: FxDriftRow[];
  /** True when EVERY segment on the bar has a target and the targets add up to 100 (so ticks can be drawn on the ruler). */
  complete: boolean;
};

/** The status of a drift value against the tolerance band; the band edge itself counts as within. */
export function driftStatus(drift: number, tolerance: number): FxDriftStatus {
  const eps = 1e-9;
  if (drift > tolerance + eps) return "over";
  if (drift < -tolerance - eps) return "under";
  return "within";
}

/**
 * Signed drift (actual share minus target, in percentage points) per segment that has a target. A target for
 * a segment that currently holds nothing is kept (share 0, so it reads "under target"). Nothing is returned
 * (inactive) without targets or when shares are not net-worth based.
 */
export function computeFxDrift(fx: Pick<FxExposure, "rows" | "shareBasis">, value: FxTargets): FxDrift {
  const tolerance = clampTolerance(value.tolerance);
  const none: FxDrift = { active: false, tolerance, rows: [], complete: false };
  if (!hasTargets(value) || fx.shareBasis !== "net") return none;

  const rows: FxDriftRow[] = [];
  const seen = new Set<string>();
  const push = (key: string, label: string, share: number) => {
    const target = value.targets[key];
    if (target === undefined) return;
    const drift = share - target;
    rows.push({ key, label, share, target, drift, status: driftStatus(drift, tolerance) });
    seen.add(key);
  };
  for (const r of fx.rows) push(r.key, r.label, r.share);
  for (const key of Object.keys(value.targets)) if (!seen.has(key)) push(key, key.split("+").join(" + "), 0);

  const positive = fx.rows.filter((r) => r.share > 0);
  const complete =
    positive.length > 0 &&
    positive.every((r) => value.targets[r.key] !== undefined) &&
    Object.keys(value.targets).every((k) => positive.some((r) => r.key === k)) &&
    Math.abs(targetsTotal(value) - 100) <= 0.5;

  return { active: true, tolerance, rows, complete };
}

/**
 * Where target boundaries fall on the bar, as percent of its width, in bar order. Only meaningful for a
 * `complete` drift; the last boundary is the end of the bar and is not returned.
 */
export function targetBoundaries(rows: readonly FxExposureRow[], value: FxTargets): { key: string; at: number }[] {
  const positive = rows.filter((r) => r.share > 0);
  const total = targetsTotal(value);
  if (positive.length === 0 || !(total > 0)) return [];
  let acc = 0;
  const out: { key: string; at: number }[] = [];
  for (const r of positive.slice(0, -1)) {
    acc += value.targets[r.key] ?? 0;
    out.push({ key: r.key, at: Math.min(100, (acc / total) * 100) });
  }
  return out;
}
