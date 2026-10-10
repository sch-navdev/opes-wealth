import { parsePrivateEquityMetadata } from "@/lib/private-equity";
import { parseLiabilityMetadata } from "@/lib/liability";
import { parseRealEstateMetadata } from "@/lib/real-estate";
import type { PassiveIncomeAsset } from "@/lib/passive-income";

/**
 * What the Liabilities view of the income calendar is made of. Every kind is a payment the holder has to make in
 * a month: a mortgage or loan instalment, an off-plan property milestone, a private-equity capital call, a credit
 * card balance (or its planned payment) or any other liability with a planned payment.
 */
export const LIABILITY_KINDS = ["mortgage", "loan", "off_plan", "private_equity", "credit_card", "other"] as const;
export type LiabilityKind = (typeof LIABILITY_KINDS)[number];

export type LiabilityCalendarItem = {
  assetId: string;
  name: string;
  kind: LiabilityKind;
  /** Base Currency, positive. */
  amount: number;
  date?: string;
};

export const emptyByKind = (): Record<LiabilityKind, number> => ({
  mortgage: 0,
  loan: 0,
  off_plan: 0,
  private_equity: 0,
  credit_card: 0,
  other: 0,
});

const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

/** First day AFTER a loan ends: `start` plus `months` whole months, as YYYY-MM. */
function monthAfter(start: string, months: number): string {
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7)) - 1 + months;
  return `${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
}

/**
 * The payments due in each month of the window. `keys` are the "YYYY-MM" months of the calendar (the first one is
 * the current month): anything already overdue (an unpaid milestone or capital call dated before the window) is
 * counted in the first month, because it is still owed.
 */
export function buildLiabilitySchedule(
  assets: readonly PassiveIncomeAsset[],
  keys: readonly string[],
  toBase: (amount: number, currency: string) => number,
): LiabilityCalendarItem[][] {
  const months: LiabilityCalendarItem[][] = keys.map(() => []);
  const windowFrom = `${keys[0]}-01`;
  const put = (index: number, item: LiabilityCalendarItem) => {
    if (index >= 0 && index < months.length && item.amount > 0) months[index].push(item);
  };
  const monthly = (asset: PassiveIncomeAsset, kind: LiabilityKind, payment: number, until?: string) => {
    keys.forEach((key, i) => {
      if (until && key >= until) return;
      put(i, { assetId: asset.id, name: asset.name, kind, amount: toBase(payment, asset.currency), date: `${key}-01` });
    });
  };
  const dated = (asset: PassiveIncomeAsset, kind: LiabilityKind, due: string, amount: number) => {
    const key = due < windowFrom ? keys[0] : due.slice(0, 7);
    put(keys.indexOf(key), { assetId: asset.id, name: asset.name, kind, amount: toBase(amount, asset.currency), date: due < windowFrom ? windowFrom : due });
  };

  for (const asset of assets) {
    const category = asset.asset_categories?.name;
    if (asset.is_liability) {
      const md = parseLiabilityMetadata(asset.metadata);
      const payment = typeof md.monthly_payment === "number" ? md.monthly_payment : 0;
      if (md.liability_type === "credit_card") {
        // A card with no planned payment is owed in full: its balance falls due now.
        if (payment > 0) monthly(asset, "credit_card", payment);
        else if (asset.current_value > 0) dated(asset, "credit_card", windowFrom, asset.current_value);
      } else if (payment > 0) {
        const kind: LiabilityKind = md.liability_type === "mortgage" ? "mortgage" : md.liability_type === "loan" ? "loan" : "other";
        monthly(asset, kind, payment);
      }
    } else if (category === "Real Estate") {
      const re = parseRealEstateMetadata(asset.metadata);
      const loan = re.linked_loan;
      const payment = loan?.monthly_payment;
      if (typeof payment === "number" && payment > 0) {
        const until = isIso(loan?.start_date) && loan?.duration_months ? monthAfter(loan.start_date, loan.duration_months) : undefined;
        monthly(asset, "mortgage", payment, until);
      }
      if (re.is_offplan) {
        for (const m of re.payment_schedule) {
          if (m?.status === "pending" && m.amount > 0 && isIso(m.due_date)) dated(asset, "off_plan", m.due_date, m.amount);
        }
      }
    } else if (category === "Private Equity") {
      for (const c of parsePrivateEquityMetadata(asset.metadata).capital_calls) {
        if (c?.status === "pending" && c.amount > 0 && isIso(c.due_date)) dated(asset, "private_equity", c.due_date, c.amount);
      }
    }
  }
  return months;
}
