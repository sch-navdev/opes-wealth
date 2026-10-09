import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { createMockAdminClient, getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { BrokerageOverview } from "@/components/brokerage-overview";
import { BrokerageTitle } from "@/components/brokerage-title";
import { DEFAULT_BASE_CURRENCY, getExchangeRatesFromUsd } from "@/lib/fx";
import { applyOwnershipFactors, loadCoOwnedAssets, loadOwnershipFactors } from "@/lib/shared-assets/load";

type EquityRow = {
  id: string;
  profile_id: string;
  name: string;
  quantity: number;
  current_value: number;
  currency: string;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  ticker_symbol: string | null;
  purchase_date: string;
  asset_categories: { name: string } | null;
};

const COLUMNS =
  "id, profile_id, name, quantity, current_value, currency, is_liability, metadata, ticker_symbol, purchase_date, asset_categories(name)";

/**
 * Brokerage: the Equities category ("Brokerage Account") grouped by brokerage account, each with its
 * holdings table, totals in the Base Currency and the "Refresh prices" action. Same dev-only mock-auth
 * bypass, MFA step-up and co-ownership scaling (the user's share of each holding) as the dashboard.
 */
export default async function BrokeragePage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
  const supabase = mockUserId ? createMockAdminClient() : await createClient();
  const user = mockUserId ? { id: mockUserId } : (await supabase.auth.getUser()).data.user;
  if (!user) redirect("/login");
  if (!mockUserId && (await needsMfaStepUp(supabase))) redirect("/login/mfa");

  const [{ data: profile }, { data: category }, rates, { currency }] = await Promise.all([
    supabase.from("profiles").select("default_currency").eq("id", user.id).single(),
    supabase.from("asset_categories").select("id").eq("name", "Equities").maybeSingle(),
    getExchangeRatesFromUsd(),
    searchParams,
  ]);
  const baseCurrency = currency || profile?.default_currency || DEFAULT_BASE_CURRENCY;

  let holdings: EquityRow[] = [];
  if (category) {
    const [{ data: own }, shared] = await Promise.all([
      supabase
        .from("assets")
        .select(COLUMNS)
        .eq("profile_id", user.id)
        .eq("status", "active")
        .eq("category_id", category.id)
        .order("name")
        .returns<EquityRow[]>(),
      loadCoOwnedAssets<EquityRow>(supabase, user.id, COLUMNS, new Set(), { categoryId: category.id }),
    ]);
    const ownIds = new Set((own ?? []).map((a) => a.id));
    const unscaled = [...(own ?? []), ...shared.filter((a) => !ownIds.has(a.id))];
    const factors = await loadOwnershipFactors(supabase, user.id, unscaled);
    holdings = applyOwnershipFactors(unscaled, factors).filter((a) => !a.is_liability);
  }

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <BrokerageTitle />
      <BrokerageOverview
        holdings={holdings.map((a) => ({
          id: a.id,
          name: a.name,
          quantity: a.quantity,
          current_value: a.current_value,
          currency: a.currency,
          metadata: a.metadata,
          ticker_symbol: a.ticker_symbol,
          purchase_date: a.purchase_date,
        }))}
        baseCurrency={baseCurrency}
        rates={rates}
      />
    </div>
  );
}
