/**
 * Pure display formatters for the Financial ratios tile. No masking here: the caller applies
 * Privacy Mode. Missing or non-finite input (null, undefined, NaN, +-Infinity) renders as an en dash.
 */

export const RATIO_NA = "–";

/** Beyond this magnitude the number switches to compact notation (1.2M) so a tile never overflows. */
const COMPACT_FROM = 1_000_000;

const cache = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, options);
    } catch {
      f = new Intl.NumberFormat("en-US", options);
    }
    cache.set(key, f);
  }
  return f;
}

function isUsable(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Rounds like the formatter would, so a value that shows as zero never keeps a minus sign. */
function normalise(n: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(n * factor) === 0 ? 0 : n;
}

/** `0.049` -> `4.9%`. One decimal, locale-aware, keeps the sign (`-0.012` -> `-1.2%`), tiny values show `0.0%`. */
export function formatPercent(fraction: number | null | undefined, locale = "en-US"): string {
  if (!isUsable(fraction)) return RATIO_NA;
  const value = normalise(fraction, 3);
  const compact = Math.abs(value * 100) >= COMPACT_FROM;
  return formatter(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    ...(compact ? { notation: "compact" as const } : {}),
  }).format(value);
}

/** `1.374` -> `1.37x`. Two decimals plus an `x` suffix, locale-aware, keeps the sign, tiny values show `0.00x`. */
export function formatMultiple(ratio: number | null | undefined, locale = "en-US"): string {
  if (!isUsable(ratio)) return RATIO_NA;
  const value = normalise(ratio, 2);
  const compact = Math.abs(value) >= COMPACT_FROM;
  const text = formatter(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...(compact ? { notation: "compact" as const } : {}),
  }).format(value);
  return `${text}x`;
}
