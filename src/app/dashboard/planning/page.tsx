import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { createMockAdminClient, getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { applyOwnershipFactors, loadCoOwnedAssets, loadOwnershipFactors } from "@/lib/shared-assets/load";
import { DEFAULT_BASE_CURRENCY, getExchangeRatesFromUsd } from "@/lib/fx";
import { loadSimulations, summariseHoldings, toProjectInput } from "@/lib/planning-data";
import { PlanningBoard } from "@/components/planning-board";
import { RetirementSimulator } from "@/components/retirement-simulator";
import { buildInvestableBreakdown } from "@/lib/retirement-assets";
import { DEMO_MONTHLY_INCOME, isDemoUser } from "@/lib/demo-mode";

type HoldingRow = {
  id: string;
  profile_id: string;
  quantity: number;
  current_value: number;
  currency: string;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  asset_categories: { name: string } | null;
};

/**
 * Future Projects: plan an investment as a SIMULATION (an asset with status
 * 'simulation', outside net worth), see the cash needed on Day D and the borrowing
 * required, and whether the plan looks bankable. Same dev-only mock-auth bypass as
 * the dashboard (hard-gated on NODE_ENV === "development").
 */
export default async function PlanningPage() {
  const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
  const supabase = mockUserId ? createMockAdminClient() : await createClient();
  const user = mockUserId ? { id: mockUserId } : (await supabase.auth.getUser()).data.user;
  if (!user) redirect("/login");
  if (!mockUserId && (await needsMfaStepUp(supabase))) redirect("/login/mfa");

  const COLUMNS = "id, profile_id, quantity, current_value, currency, is_liability, metadata, asset_categories(name)";
  const [{ data: categories }, { data: profile }, rates, { data: own }, simulations, shared] = await Promise.all([
    supabase.from("asset_categories").select("id, name").order("name"),
    supabase.from("profiles").select("default_currency").eq("id", user.id).single(),
    getExchangeRatesFromUsd(),
    supabase.from("assets").select(COLUMNS).eq("profile_id", user.id).eq("status", "active").returns<HoldingRow[]>(),
    loadSimulations(supabase, user.id),
    loadCoOwnedAssets<HoldingRow>(supabase, user.id, COLUMNS, new Set()),
  ]);

  const base = profile?.default_currency || DEFAULT_BASE_CURRENCY;

  // Cash and debt are the user's SHARE of each live holding.
  const ownIds = new Set((own ?? []).map((a) => a.id));
  const unscaled = [...(own ?? []), ...shared.filter((a) => !ownIds.has(a.id))];
  const factors = await loadOwnershipFactors(supabase, user.id, unscaled);
  const holdings = applyOwnershipFactors(unscaled, factors);
  const { liquidCash, existingMonthlyDebt } = summariseHoldings(holdings, base, rates);

  // Starting point of the retirement simulator: per-category values (the user's share, display currency).
  const investable = buildInvestableBreakdown(holdings, base, rates);

  return (
    <>
    <PlanningBoard
      baseCurrency={base}
      categories={categories ?? []}
      liquidCash={liquidCash}
      existingMonthlyDebt={existingMonthlyDebt}
      defaultMonthlyIncome={isDemoUser(user.id) ? DEMO_MONTHLY_INCOME : undefined}
      projects={simulations.map((row) => ({
        edit: {
          id: row.id,
          name: row.name,
          category_id: row.category_id,
          quantity: row.quantity,
          current_value: row.current_value,
          currency: row.currency,
          metadata: row.metadata,
          images: row.images,
          ticker_symbol: row.ticker_symbol,
          purchase_date: row.purchase_date,
        },
        categoryName: row.asset_categories?.name ?? "",
        input: toProjectInput(row, base, rates),
      }))}
    />
    <div className="w-full px-4 pb-10 sm:px-6 lg:px-8">
      <RetirementSimulator baseCurrency={base} breakdown={investable} />
    </div>
    </>
  );
}
