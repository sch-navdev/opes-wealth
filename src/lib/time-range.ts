/**
 * Time range of a chart: all time, the last 1 / 3 / 6 months or 1 year counted back from today, or custom dates.
 * Pure helpers (no React): the window, and filtering any date-keyed series to it. The user's DEFAULT preset is
 * kept per device by the selector component (`components/time-range-selector.tsx`).
 */
export const RANGE_PRESETS = ["all", "1m", "3m", "6m", "1y"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export type TimeRange = {
  preset: RangePreset | "custom";
  /** ISO dates, used when preset is "custom"; either may be empty (open end). */
  from?: string;
  to?: string;
};

export const DEFAULT_RANGE_STORAGE_KEY = "opes-default-range";

const MONTHS: Record<Exclude<RangePreset, "all">, number> = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 };

const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** `today` minus whole calendar months, the day clamped to the target month's last day (31 Mar - 1 month = 28/29 Feb). */
export function monthsBefore(today: string, months: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const index = y * 12 + (m - 1) - months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** The inclusive window of a range; null = unbounded on that side. */
export function rangeBounds(range: TimeRange, today: string): { from: string | null; to: string | null } {
  if (range.preset === "all") return { from: null, to: null };
  if (range.preset === "custom") {
    const from = isIso(range.from) ? range.from : null;
    const to = isIso(range.to) ? range.to : null;
    // Dates entered the wrong way round still give a sensible window.
    return from && to && from > to ? { from: to, to: from } : { from, to };
  }
  return { from: monthsBefore(today, MONTHS[range.preset]), to: today };
}

/**
 * Rows whose `date` is inside the range. A rolling preset also keeps the last row BEFORE the window, so a
 * series that did not change inside it (an account that sat on one balance) still draws a line.
 */
export function filterByRange<T extends { date: string }>(rows: T[], range: TimeRange, today: string): T[] {
  const { from, to } = rangeBounds(range, today);
  if (!from && !to) return rows;
  const inside = rows.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
  if (range.preset === "custom" || !from) return inside;
  const before = rows.filter((r) => r.date < from).at(-1);
  return before && !inside.some((r) => r.date === before.date) ? [{ ...before, date: from }, ...inside] : inside;
}

export function isRangePreset(v: unknown): v is RangePreset {
  return typeof v === "string" && (RANGE_PRESETS as readonly string[]).includes(v);
}

export function readDefaultRange(): RangePreset {
  try {
    const v = window.localStorage.getItem(DEFAULT_RANGE_STORAGE_KEY);
    return isRangePreset(v) ? v : "all";
  } catch {
    return "all";
  }
}

export function writeDefaultRange(preset: RangePreset): void {
  try {
    window.localStorage.setItem(DEFAULT_RANGE_STORAGE_KEY, preset);
  } catch {
    // Storage blocked: the default simply is not kept.
  }
}
