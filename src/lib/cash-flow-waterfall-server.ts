/**
 * Reads what the cash-flow waterfall needs from the signed-in user's own data: the planned monthly
 * payments of their liabilities, their Cash accounts (balances, type, purpose) and the imported bank
 * transactions of the last 12 complete months. Takes the page's Supabase client; every query is scoped to
 * `profile_id`; never throws (any failure just means "no data"). Rows are the user's own: co-owned
 * assets owned by somebody else are not included.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseLiabilityMetadata } from "@/lib/liability";
import { parseRealEstateMetadata } from "@/lib/real-estate";
import { lastCompleteMonths, type WaterfallCashAccount, type WaterfallLiability, type WaterfallTransaction } from "@/lib/cash-flow-waterfall";

type AssetRow = {
  id: string;
  name: string;
  currency: string;
  current_value: number | string | null;
  is_liability: boolean | null;
  metadata: Record<string, unknown> | null;
  asset_categories: { name: string } | null;
};

export type WaterfallData = {
  liabilities: WaterfallLiability[];
  accounts: WaterfallCashAccount[];
  transactions: WaterfallTransaction[];
};

const PAGE = 1000;
const MAX_PAGES = 30;

/** Pure: assets -> liabilities with a planned monthly payment and the Cash accounts. */
export function splitAssets(rows: AssetRow[]): { liabilities: WaterfallLiability[]; accounts: WaterfallCashAccount[] } {
  const liabilities: WaterfallLiability[] = [];
  const accounts: WaterfallCashAccount[] = [];
  for (const a of rows) {
    const category = a.asset_categories?.name;
    if (a.is_liability) {
      const m = parseLiabilityMetadata(a.metadata);
      if (typeof m.monthly_payment === "number" && m.monthly_payment > 0) {
        liabilities.push({ id: a.id, name: a.name, type: m.liability_type, lender: m.lender_name ?? "", monthlyPayment: m.monthly_payment, currency: a.currency });
      }
    } else if (category === "Real Estate") {
      const loan = parseRealEstateMetadata(a.metadata).linked_loan;
      const p = loan?.monthly_payment;
      if (typeof p === "number" && p > 0) {
        liabilities.push({ id: a.id, name: a.name, type: "mortgage", lender: "", monthlyPayment: p, currency: a.currency });
      }
    } else if (category === "Cash") {
      const md = (a.metadata ?? {}) as Record<string, unknown>;
      accounts.push({
        id: a.id,
        name: a.name,
        currency: a.currency,
        balance: Number(a.current_value ?? 0) || 0,
        accountType: typeof md.account_type === "string" ? md.account_type : undefined,
        purpose: typeof md.purpose === "string" ? md.purpose : undefined,
      });
    }
  }
  return { liabilities, accounts };
}

export async function loadWaterfallData(client: unknown, userId: string, asOf: string): Promise<WaterfallData> {
  const empty: WaterfallData = { liabilities: [], accounts: [], transactions: [] };
  try {
    const db = client as SupabaseClient;
    const { data, error } = await db
      .from("assets")
      .select("id, name, currency, current_value, is_liability, metadata, asset_categories(name)")
      .eq("profile_id", userId)
      .eq("status", "active");
    if (error || !data) return empty;
    const { liabilities, accounts } = splitAssets(data as unknown as AssetRow[]);

    const since = `${lastCompleteMonths(asOf, 12)[0]}-01`;
    const ids = accounts.map((a) => a.id);
    const transactions: WaterfallTransaction[] = [];
    if (ids.length > 0) {
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data: rows, error: txError } = await db
          .from("transactions")
          .select("asset_id, booked_date, amount, currency, description")
          .eq("profile_id", userId)
          .in("asset_id", ids)
          .gte("booked_date", since)
          .order("booked_date", { ascending: true })
          .order("id", { ascending: true })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (txError || !rows) break;
        for (const r of rows as { asset_id: string; booked_date: string; amount: number | string; currency: string; description: string | null }[]) {
          const amount = Number(r.amount);
          if (!Number.isFinite(amount)) continue;
          transactions.push({ assetId: r.asset_id, date: String(r.booked_date).slice(0, 10), amount, currency: r.currency, description: (r.description ?? "").slice(0, 120) });
        }
        if (rows.length < PAGE) break;
      }
    }
    return { liabilities, accounts, transactions };
  } catch {
    return empty;
  }
}
