/**
 * Timezone-independent date-cell parsing shared by the broker parsers.
 *
 * The old approach (`new Date(text).toISOString().slice(0, 10)`) reads every
 * non-ISO string (and an xlsx Date cell) as LOCAL midnight and then prints the
 * UTC date, so in a zone ahead of UTC (e.g. Asia/Dubai, UTC+4) the calendar
 * date came out one day early. This helper never goes through an instant: it
 * reads the calendar parts straight out of the text, or — for a Date object —
 * out of the right set of components.
 *
 * - xlsx `Date` cells (SheetJS `cellDates: true`): SheetJS builds the Date so
 *   that its LOCAL components equal the wall-clock date stored in the sheet,
 *   in every machine timezone (verified for UTC, Asia/Dubai, America/Los_Angeles
 *   and Pacific/Kiritimati with a raw serial-number cell). So the LOCAL
 *   year/month/day carry the calendar date; the UTC ones do not.
 * - Strings are never converted to an instant. A trailing time / `Z` / offset is
 *   ignored: the date as written is the calendar date.
 *
 * Ambiguous numeric dates (`03/05/2025`) keep the month-first reading that
 * `new Date()` always gave them (5 March), except that when the first number
 * is above 12 it can only be the day (`25/03/2025` is 25 March).
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function toIso(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1) return null;
  // Real-date check (rejects 31 Feb); done in UTC so it is timezone independent.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function fullYear(raw: string): number {
  const n = Number(raw);
  if (raw.length === 4) return n;
  return n < 50 ? 2000 + n : 1900 + n; // matches `new Date("3/5/25")`
}

const TIME_TAIL = String.raw`(?:(?:[T\s,]+)\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:[AaPp][Mm])?\s*(?:Z|[+-]\d{2}:?\d{2})?)?`;

const ISO = new RegExp(String.raw`^(\d{4})-(\d{1,2})-(\d{1,2})${TIME_TAIL}$`);
const ISO_COMPACT_SLASH = new RegExp(String.raw`^(\d{4})/(\d{1,2})/(\d{1,2})${TIME_TAIL}$`);
const NUMERIC = new RegExp(String.raw`^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})${TIME_TAIL}$`);
const DAY_MONTH_NAME = new RegExp(String.raw`^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]+([A-Za-z]{3,9})\.?,?[\s\-/.]+(\d{4})${TIME_TAIL}$`);
const MONTH_NAME_DAY = new RegExp(String.raw`^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})${TIME_TAIL}$`);

/**
 * Returns the intended calendar date as `YYYY-MM-DD`, identical in every
 * machine timezone, or `null` if `raw` is not a readable, real date.
 */
export function parseCellDateUtc(raw: unknown): string | null {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return toIso(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;

  let m = ISO.exec(text) ?? ISO_COMPACT_SLASH.exec(text);
  if (m) return toIso(+m[1], +m[2], +m[3]);

  m = NUMERIC.exec(text);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = fullYear(m[3]);
    // Month first (as `new Date()` did); only when that is impossible is it day first.
    return a <= 12 ? toIso(y, a, b) : toIso(y, b, a);
  }

  m = DAY_MONTH_NAME.exec(text);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    return mo ? toIso(+m[3], mo, +m[1]) : null;
  }

  m = MONTH_NAME_DAY.exec(text);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    return mo ? toIso(+m[3], mo, +m[2]) : null;
  }

  return null;
}
