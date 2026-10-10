import type { IncomeCalendarMonth } from "@/lib/income-calendar";
import type { SimItem } from "@/lib/income-calendar-simulation";

/**
 * One month day by day, the way a cash-flow calendar reads: what comes in and what goes out on each day, and the
 * running position at the end of it. Dates follow the schedules (a salary on its pay date, a loan on its
 * instalment day, an off-plan milestone or capital call on its due date); an item with no date of its own falls on
 * the 1st. Pure.
 */
export type DayItem = {
  label: string;
  /** Signed: positive comes in, negative goes out. */
  amount: number;
  kind: "earned" | "passive" | "payment" | "sim_income" | "sim_payment";
  sub?: string;
  /** Already in the bank per the latest statements: shown, but not counted in the position. */
  settled?: boolean;
};

export type DayFlow = {
  date: string;
  day: number;
  items: DayItem[];
  inflow: number;
  outflow: number;
  net: number;
  /** Position at the end of the day: `startPosition` plus everything up to and including it. */
  balance: number;
};

const daysIn = (key: string) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();

export function buildDays(
  month: IncomeCalendarMonth,
  opts: { includeEarned: boolean; sims?: readonly SimItem[]; startPosition?: number; skipSettled?: boolean },
): DayFlow[] {
  const key = month.month;
  const count = daysIn(key);
  const dayOf = (date: string | undefined) => {
    if (!date || date.slice(0, 7) !== key) return 1;
    return Math.min(count, Math.max(1, Number(date.slice(8, 10)) || 1));
  };
  const byDay: DayItem[][] = Array.from({ length: count }, () => []);
  const put = (date: string | undefined, item: DayItem) => {
    if (item.amount !== 0) byDay[dayOf(date) - 1].push(item);
  };

  for (const i of month.items) put(i.date, { label: i.name, amount: i.amount, kind: "passive", sub: i.source, settled: i.settled });
  if (opts.includeEarned) for (const e of month.earnedItems ?? []) put(e.date, { label: e.name, amount: e.amount, kind: "earned", sub: e.source || e.group, settled: e.settled });
  for (const l of month.liabilityItems) put(l.date, { label: l.name, amount: -l.amount, kind: "payment", sub: l.kind, settled: l.settled });
  for (const s of opts.sims ?? []) {
    put(s.date, { label: s.label, amount: s.kind === "income" ? s.amount : -s.amount, kind: s.kind === "income" ? "sim_income" : "sim_payment", sub: s.assetName });
  }

  let balance = opts.startPosition ?? 0;
  return byDay.map((items, i) => {
    const counted = opts.skipSettled ? items.filter((x) => !x.settled) : items;
    const inflow = counted.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0);
    const outflow = counted.filter((x) => x.amount < 0).reduce((s, x) => s - x.amount, 0);
    balance += inflow - outflow;
    return { date: `${key}-${String(i + 1).padStart(2, "0")}`, day: i + 1, items, inflow, outflow, net: inflow - outflow, balance };
  });
}
