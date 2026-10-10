import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllAssetHistory } from "@/lib/asset-history-fetch";
import { convertAmount } from "@/lib/fx";
import type { CashTx } from "@/lib/income-calendar-settle";

/**
 * The cash side of the income calendar: what is in the bank today, what the banks said it was at the end of each past
 * month, and the transactions already booked this month (to tell which salaries / payments are already in that cash).
 * Personal, open, non-card Cash accounts only: company accounts are not your cash, a closed account is history and what is
 * owed on a card is settled from the current account.
 */
export type CashAsset = {
  id: string;
  currency: string;
  current_value: number;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  asset_categories: { name: string } | null;
};

export function isPersonalCash(a: CashAsset): boolean {
  if (a.asset_categories?.name !== "Cash" || a.is_liability) return false;
  const md = a.metadata ?? {};
  if (md.company_id) return false;
  if (typeof md.closed_on === "string") return false;
  const profile = typeof md.bank_profile === "string" ? md.bank_profile : "";
  return !(profile.endsWith("_card") || md.account_type === "credit_card");
}

export const monthEnd = (key: string) => {
  const last = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
  return `${key}-${String(last).padStart(2, "0")}`;
};

export function shiftMonth(key: string, by: number): string {
  const i = Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1 + by;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/**
 * Cash at the end of each month: per account the newest balance on or before that day, converted and added up. Accounts
 * with no balance yet that early count 0. Months with no balance at all are left out.
 */
export function monthEndCash(
  accounts: readonly CashAsset[],
  history: readonly { asset_id: string; recorded_date: string; value: number }[],
  keys: readonly string[],
  base: string,
  rates: Record<string, number>,
): Record<string, number> {
  const byAsset = new Map<string, { date: string; value: number }[]>();
  for (const h of history) byAsset.set(h.asset_id, [...(byAsset.get(h.asset_id) ?? []), { date: h.recorded_date, value: Number(h.value) }]);
  for (const list of byAsset.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  const out: Record<string, number> = {};
  for (const key of keys) {
    const end = monthEnd(key);
    let total = 0;
    let any = false;
    for (const a of accounts) {
      const list = byAsset.get(a.id) ?? [];
      let hit: { date: string; value: number } | null = null;
      for (const row of list) {
        if (row.date > end) break;
        hit = row;
      }
      if (hit && Number.isFinite(hit.value)) {
        total += convertAmount(hit.value, a.currency, base, rates);
        any = true;
      }
    }
    if (any) out[key] = total;
  }
  return out;
}

export type CashBasis = {
  /** Cash in the personal open accounts per their latest balance, Base Currency. */
  openingCash: number;
  /** "YYYY-MM" -> the cash the banks showed on the last day of that month (past months only). */
  actualCloses: Record<string, number>;
  /** Transactions booked from the 1st of this month up to today (signed, Base Currency). */
  transactions: CashTx[];
};

export async function loadCashBasis(
  supabase: SupabaseClient,
  assets: readonly CashAsset[],
  rates: Record<string, number>,
  base: string,
  today: string,
  firstMonth: string,
): Promise<CashBasis> {
  const accounts = assets.filter(isPersonalCash);
  const ids = accounts.map((a) => a.id);
  const openingCash = accounts.reduce((s, a) => s + convertAmount(a.current_value, a.currency, base, rates), 0);
  const todayMonth = today.slice(0, 7);
  if (ids.length === 0) return { openingCash: 0, actualCloses: {}, transactions: [] };

  // Past months of the window, plus the month before it (the start of the first month).
  const keys: string[] = [];
  for (let k = shiftMonth(firstMonth, -1); k < todayMonth && keys.length < 130; k = shiftMonth(k, 1)) keys.push(k);
  const history = keys.length > 0 ? await fetchAllAssetHistory(supabase, ids) : [];
  const actualCloses = monthEndCash(accounts, history, keys, base, rates);

  let transactions: CashTx[] = [];
  try {
    const { data } = await supabase
      .from("transactions")
      .select("asset_id, booked_date, amount, currency, description")
      .in("asset_id", ids)
      .gte("booked_date", `${todayMonth}-01`)
      .lte("booked_date", today)
      .returns<{ asset_id: string; booked_date: string; amount: number | string; currency: string | null; description: string | null }[]>();
    const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
    transactions = (data ?? []).map((t) => ({
      date: t.booked_date,
      amount: convertAmount(Number(t.amount), t.currency || currencyOf.get(t.asset_id) || base, base, rates),
      description: t.description ?? "",
    }));
  } catch {
    // No transactions table in this environment: nothing is matched, everything stays projected.
  }
  return { openingCash, actualCloses, transactions };
}
