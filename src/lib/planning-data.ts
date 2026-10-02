/**
 * Server-side loading for Future Projects (simulations). The other half of the rule
 * "simulations never touch net worth": every portfolio query filters on
 * status = 'active', and ONLY this module reads status = 'simulation'.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { convertToBaseCurrency } from "@/lib/fx";
import { parsePlan, projectPriceAndFees, type PlanInputs, type ProjectInput } from "@/lib/planning";
import { parseRealEstateMetadata } from "@/lib/real-estate";

export type SimulationRow = {
  id: string;
  name: string;
  category_id: string;
  quantity: number;
  current_value: number;
  currency: string;
  metadata: Record<string, unknown> | null;
  images: string[] | null;
  ticker_symbol: string | null;
  purchase_date: string;
  plan: unknown;
  asset_categories: { name: string } | null;
};

const SIMULATION_COLUMNS =
  "id, name, category_id, quantity, current_value, currency, metadata, images, ticker_symbol, purchase_date, plan, asset_categories(name)";

export async function loadSimulations(supabase: SupabaseClient, userId: string): Promise<SimulationRow[]> {
  const { data } = await supabase
    .from("assets")
    .select(SIMULATION_COLUMNS)
    .eq("profile_id", userId)
    .eq("status", "simulation")
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as SimulationRow[];
}

/** A simulation as the bankability engine sees it: price and fees in the base currency, plus its plan. */
export function toProjectInput(row: SimulationRow, base: string, rates: Record<string, number>): ProjectInput & { plan: PlanInputs } {
  const { price, fees } = projectPriceAndFees(row.asset_categories?.name ?? "", row.metadata, row.current_value);
  return {
    id: row.id,
    name: row.name,
    price: convertToBaseCurrency(price, row.currency, base, rates),
    fees: convertToBaseCurrency(fees, row.currency, base, rates),
    plan: parsePlan(row.plan),
  };
}

type HoldingForPlanning = {
  currency: string;
  current_value: number;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  asset_categories: { name: string } | null;
};

/** What the user has today: cash on hand and repayments already due each month (base currency). */
export function summariseHoldings(
  holdings: HoldingForPlanning[],
  base: string,
  rates: Record<string, number>,
): { liquidCash: number; existingMonthlyDebt: number } {
  let liquidCash = 0;
  let existingMonthlyDebt = 0;
  for (const h of holdings) {
    const conv = (n: number) => convertToBaseCurrency(n, h.currency, base, rates);
    const category = h.asset_categories?.name;
    if (category === "Cash" && !h.is_liability) liquidCash += conv(h.current_value);
    if (h.is_liability) {
      const m = h.metadata?.monthly_payment;
      if (typeof m === "number" && m > 0) existingMonthlyDebt += conv(m);
    } else if (category === "Real Estate") {
      const m = parseRealEstateMetadata(h.metadata).linked_loan?.monthly_payment;
      if (typeof m === "number" && m > 0) existingMonthlyDebt += conv(m);
    }
  }
  return { liquidCash, existingMonthlyDebt };
}
