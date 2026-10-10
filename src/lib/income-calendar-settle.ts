import type { IncomeCalendar, IncomeCalendarMonth } from "@/lib/income-calendar";

/**
 * Items of the CURRENT month that are already in the bank. The cash on hand comes from the latest statements, so a
 * salary, a rent or a loan instalment that those statements already show is part of that cash: counting it again in
 * the projection would add it twice. Each projected item dated up to today is matched to a booked transaction of the
 * same direction, close in amount (3%) and in date; a matched item is flagged `settled` and left out of the position.
 * Items that are not matched stay projected (the statement may simply be older than the payment). Pure.
 */
export type CashTx = {
  date: string;
  /** Signed, Base Currency: positive = money in. */
  amount: number;
  description: string;
};

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
const TOLERANCE = 0.03;

type Ref = { list: "items" | "earnedItems" | "liabilityItems"; index: number; signed: number; date: string };

export function settleCurrentMonth(calendar: IncomeCalendar, txs: readonly CashTx[], today: string): IncomeCalendar {
  const todayMonth = today.slice(0, 7);
  const at = calendar.months.findIndex((m) => m.month === todayMonth);
  if (at < 0 || txs.length === 0) return calendar;
  const month = calendar.months[at];
  const monthStart = `${todayMonth}-01`;

  const refs: Ref[] = [];
  month.items.forEach((i, index) => i.amount > 0 && refs.push({ list: "items", index, signed: i.amount, date: i.date ?? monthStart }));
  (month.earnedItems ?? []).forEach((i, index) => i.amount > 0 && refs.push({ list: "earnedItems", index, signed: i.amount, date: i.date }));
  month.liabilityItems.forEach((i, index) => i.amount > 0 && refs.push({ list: "liabilityItems", index, signed: -i.amount, date: i.date ?? monthStart }));

  const used = new Set<number>();
  const settled = new Set<string>();
  for (const r of refs.filter((x) => x.date <= today).sort((a, b) => a.date.localeCompare(b.date))) {
    // An item dated the 1st stands for "sometime this month" (a rent, an instalment): the whole month so far.
    const monthly = r.date.endsWith("-01");
    const from = monthly ? dayNum(monthStart) : dayNum(r.date) - 5;
    const to = Math.min(dayNum(today), monthly ? Number.MAX_SAFE_INTEGER : dayNum(r.date) + 10);
    let best = -1;
    let bestScore = Infinity;
    txs.forEach((t, i) => {
      if (used.has(i) || Math.sign(t.amount) !== Math.sign(r.signed)) return;
      const d = dayNum(t.date);
      if (d < from || d > to) return;
      const diff = Math.abs(Math.abs(t.amount) - Math.abs(r.signed));
      if (diff > Math.max(1, Math.abs(r.signed) * TOLERANCE)) return;
      const score = diff + Math.abs(d - dayNum(r.date)) * 0.001;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) {
      used.add(best);
      settled.add(`${r.list}:${r.index}`);
    }
  }
  if (settled.size === 0) return calendar;

  const next: IncomeCalendarMonth = {
    ...month,
    items: month.items.map((i, k) => (settled.has(`items:${k}`) ? { ...i, settled: true } : i)),
    earnedItems: month.earnedItems?.map((i, k) => (settled.has(`earnedItems:${k}`) ? { ...i, settled: true } : i)),
    liabilityItems: month.liabilityItems.map((i, k) => (settled.has(`liabilityItems:${k}`) ? { ...i, settled: true } : i)),
  };
  next.settledIncome =
    next.items.filter((i) => i.settled).reduce((s, i) => s + i.amount, 0) + (next.earnedItems ?? []).filter((i) => i.settled).reduce((s, i) => s + i.amount, 0);
  next.settledPayments = next.liabilityItems.filter((i) => i.settled).reduce((s, i) => s + i.amount, 0);
  return { ...calendar, months: calendar.months.map((m, i) => (i === at ? next : m)) };
}
