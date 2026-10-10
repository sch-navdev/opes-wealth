/**
 * What-if entries for the income calendar: an income (a rent on a property you may buy, a dividend, a bonus...) or a
 * payment, linked to an existing asset or to a simulated one, repeating monthly / quarterly / yearly or once. They
 * are kept on this device only and never change the real figures: the calendar shows them on top, apart, and they
 * can be switched off. Pure helpers.
 */
export const SIM_STORAGE_KEY = "opes-income-simulations";

export const SIM_FREQUENCIES = ["monthly", "quarterly", "yearly", "once"] as const;
export type SimFrequency = (typeof SIM_FREQUENCIES)[number];

export type SimEntry = {
  id: string;
  label: string;
  kind: "income" | "payment";
  /** Base Currency, positive. */
  amount: number;
  frequency: SimFrequency;
  /** "YYYY-MM": the first month. */
  start: string;
  /** "YYYY-MM": the last month; open-ended when absent (a one-off ignores it). */
  end?: string;
  /** Day of the month (1 to 28) the money moves; 1 when absent. */
  day?: number;
  /** The existing asset it is linked to, else a simulated asset of that name. */
  assetId?: string;
  assetName?: string;
};

export type SimItem = {
  entryId: string;
  label: string;
  kind: "income" | "payment";
  amount: number;
  date: string;
  assetName?: string;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const STEP: Record<SimFrequency, number> = { monthly: 1, quarterly: 3, yearly: 12, once: 0 };

const monthIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;

/** Reads the saved entries, dropping anything malformed. */
export function parseSimEntries(raw: unknown): SimEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SimEntry[] = [];
  for (const v of raw) {
    if (typeof v !== "object" || v === null) continue;
    const r = v as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.label !== "string" || !(r.kind === "income" || r.kind === "payment")) continue;
    if (typeof r.amount !== "number" || !(r.amount > 0) || !SIM_FREQUENCIES.includes(r.frequency as SimFrequency)) continue;
    if (typeof r.start !== "string" || !MONTH.test(r.start)) continue;
    out.push({
      id: r.id,
      label: r.label.slice(0, 80),
      kind: r.kind,
      amount: r.amount,
      frequency: r.frequency as SimFrequency,
      start: r.start,
      ...(typeof r.end === "string" && MONTH.test(r.end) ? { end: r.end } : {}),
      ...(typeof r.day === "number" && r.day >= 1 && r.day <= 28 ? { day: Math.round(r.day) } : {}),
      ...(typeof r.assetId === "string" && r.assetId ? { assetId: r.assetId } : {}),
      ...(typeof r.assetName === "string" && r.assetName ? { assetName: r.assetName.slice(0, 80) } : {}),
    });
  }
  return out;
}

/** The items of every month key, in order. */
export function expandSimulations(entries: readonly SimEntry[], keys: readonly string[]): SimItem[][] {
  return keys.map((key) => {
    const items: SimItem[] = [];
    for (const e of entries) {
      const gap = monthIndex(key) - monthIndex(e.start);
      if (gap < 0) continue;
      if (e.frequency === "once") {
        if (gap !== 0) continue;
      } else {
        if (e.end && key > e.end) continue;
        if (gap % STEP[e.frequency] !== 0) continue;
      }
      items.push({
        entryId: e.id,
        label: e.label,
        kind: e.kind,
        amount: e.amount,
        date: `${key}-${String(e.day ?? 1).padStart(2, "0")}`,
        ...(e.assetName ? { assetName: e.assetName } : {}),
      });
    }
    return items;
  });
}
