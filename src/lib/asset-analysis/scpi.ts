import { scpiCurrentValue, scpiEntryFees, scpiInvested, scpiWithdrawalValue, type ScpiMetadata } from "@/lib/scpi";
import { isNum, type DatedValue } from "./common";

export type ScpiYearRow = {
  year: number;
  /** Dividends actually received that year. */
  received: number;
  /** received / invested capital, fraction. Null without invested capital. */
  realisedRate: number | null;
  /** The distribution rate (TDVM) the user recorded for that year, fraction, or null. */
  statedRate: number | null;
  /** True for the year of the first payment or the current year: only part of a year may be counted. */
  partial: boolean;
};

export type ScpiAnalysis = {
  invested: number;
  entryFees: number;
  /** Value if the shares were sold back (withdrawal value x shares), else the stored value. */
  value: number;
  /** value - invested (negative while the entry fee is not recovered). */
  valueVsInvested: number | null;
  /** value / invested - 1. */
  valueVsInvestedPct: number | null;
  /** Withdrawal value per share vs subscription price per share, fraction (negative = below). */
  withdrawalGapPct: number | null;
  subscriptionPrice: number | null;
  withdrawalPrice: number | null;
  years: ScpiYearRow[];
  totalReceived: number;
  /** Capital value plus everything received, minus invested, fraction of invested. */
  totalReturnPct: number | null;
  /** Value per share over time from the recorded history (value / shares). Empty below two points. */
  perShareHistory: DatedValue[];
};

/**
 * SCPI analysis: value against capital invested, the withdrawal-vs-subscription gap, distribution rate by year
 * (realised from the dividend ledger next to the stated rate) and the per-share value history. Pure.
 */
export function scpiAnalysis(input: { metadata: ScpiMetadata; shares: number; currentValue: number; history: DatedValue[]; today: string }): ScpiAnalysis {
  const { metadata, shares, currentValue, history, today } = input;
  const invested = scpiInvested(metadata, shares);
  const value = scpiCurrentValue(metadata, shares) ?? currentValue;
  const withdrawalPrice = scpiWithdrawalValue(metadata);
  const sub = isNum(metadata.subscription_price) && metadata.subscription_price > 0 ? metadata.subscription_price : null;

  const received = new Map<number, number>();
  const firstYear = metadata.dividends.filter((d) => d.status === "received" && d.date).map((d) => Number(d.date.slice(0, 4))).sort((a, b) => a - b)[0];
  for (const d of metadata.dividends) {
    if (d.status !== "received" || !d.date || !isNum(d.amount)) continue;
    const y = Number(d.date.slice(0, 4));
    received.set(y, (received.get(y) ?? 0) + d.amount);
  }
  const stated = new Map(metadata.yield_history.map((y) => [y.year, y.rate / 100]));
  const nowYear = Number(today.slice(0, 4));
  const yearsSet = new Set<number>([...received.keys(), ...stated.keys()]);
  const years: ScpiYearRow[] = [...yearsSet]
    .sort((a, b) => a - b)
    .map((year) => ({
      year,
      received: received.get(year) ?? 0,
      realisedRate: invested > 0 && received.has(year) ? (received.get(year) as number) / invested : null,
      statedRate: stated.get(year) ?? null,
      partial: received.has(year) && (year === nowYear || year === firstYear),
    }));
  const totalReceived = [...received.values()].reduce((s, v) => s + v, 0);

  return {
    invested,
    entryFees: scpiEntryFees(metadata, shares),
    value,
    valueVsInvested: invested > 0 ? value - invested : null,
    valueVsInvestedPct: invested > 0 ? value / invested - 1 : null,
    withdrawalGapPct: sub != null && withdrawalPrice != null ? withdrawalPrice / sub - 1 : null,
    subscriptionPrice: sub,
    withdrawalPrice,
    years,
    totalReceived,
    totalReturnPct: invested > 0 ? (value + totalReceived - invested) / invested : null,
    perShareHistory: shares > 0 && history.length >= 2 ? history.map((h) => ({ date: h.date, value: h.value / shares })) : [],
  };
}
