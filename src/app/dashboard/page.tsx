import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import {
  createMockAdminClient,
  getMockUserId,
  isMockAuthEnabled,
} from "@/utils/supabase/mock-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AddAssetDialog } from "@/components/add-asset-dialog";
import { AddInvestmentsDialog } from "@/components/add-investments-dialog";
import { CurrencySwitcher } from "@/components/currency-switcher";
import { DashboardHeaderControls } from "@/components/dashboard-header-controls";
import {
  DashboardMetricCards,
  type DashboardBreakdowns,
} from "@/components/dashboard-metric-cards";
import { PortfolioPerformanceChart } from "@/components/portfolio-performance-chart";
import { PortfolioGroups } from "@/components/portfolio-groups";
import { T } from "@/components/translated-text";
import {
  DEFAULT_BASE_CURRENCY,
  convertToBaseCurrency,
  getExchangeRatesFromUsd,
} from "@/lib/fx";
import { buildNetWorthSeries } from "@/lib/portfolio-performance";
import { fetchAllAssetHistory } from "@/lib/asset-history-fetch";
import { parseVehicleMetadata, resolveVehicleValuation } from "@/lib/vehicles";
import { assetLiability, grossAssetValue } from "@/lib/liabilities";
import {
  calculateTotalCost,
  calculateUnrealizedGain,
  parseRealEstateMetadata,
} from "@/lib/real-estate";

/** The broker import server action (called from this page) fetches daily price history for every holding; give it room on hosts that cap serverless time. */
export const maxDuration = 60;

type AssetRow = {
  id: string;
  name: string;
  category_id: string;
  quantity: number;
  current_value: number;
  currency: string;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  images: string[] | null;
  ticker_symbol: string | null;
  purchase_date: string;
  asset_categories: { name: string } | null;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  // DEV-ONLY MOCK AUTH: lets a terminal agent (no browser, can't complete a
  // passkey ceremony) load this page against real data. `isMockAuthEnabled()`
  // is hard-gated on `NODE_ENV === "development"`, which Vercel/`next build`
  // always set to "production" — this branch is dead code in any real
  // deployment regardless of what env vars are set there.
  const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
  const supabase = mockUserId ? createMockAdminClient() : await createClient();

  const user = mockUserId
    ? { id: mockUserId, email: "dev-mock@localhost" }
    : (await supabase.auth.getUser()).data.user;

  if (!user) {
    redirect("/login");
  }

  if (!mockUserId && (await needsMfaStepUp(supabase))) {
    redirect("/login/mfa");
  }

  const [{ data: categories }, { data: assets }, { data: profile }, rates] =
    await Promise.all([
      supabase.from("asset_categories").select("id, name").order("name"),
      supabase
        .from("assets")
        .select(
          "id, name, category_id, quantity, current_value, currency, is_liability, metadata, images, ticker_symbol, purchase_date, asset_categories(name)",
        )
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .returns<AssetRow[]>(),
      supabase
        .from("profiles")
        .select("first_name, avatar_base64, default_currency")
        .eq("id", user.id)
        .single(),
      getExchangeRatesFromUsd(),
    ]);

  const { currency: currencyParam } = await searchParams;
  // The dashboard's Base Currency: every asset's native `currency` is
  // converted into this one before being aggregated into a total (Net
  // Worth, Total Assets, Total Liabilities) or plotted on the Portfolio
  // Performance chart — see `lib/fx.ts`.
  const displayCurrency =
    currencyParam || profile?.default_currency || DEFAULT_BASE_CURRENCY;

  // Portfolio Performance chart — Total Net Worth over time across every
  // asset (any category), so it needs every asset's `asset_history` rows, not
  // just Equities (a second query rather than folding into the assets query
  // above, since it needs the asset ids first).
  // Paged + unwindowed (`fetchAllAssetHistory`): the chart starts at the
  // earliest row in the database, not at whatever one response could hold.
  const allHistory = await fetchAllAssetHistory(
    supabase,
    (assets ?? []).map((a) => a.id),
  );

  const performanceSeries = buildNetWorthSeries(
    (assets ?? []).map((asset) => ({
      category: asset.asset_categories?.name ?? "—",
      history: (allHistory ?? [])
        .filter((h) => h.asset_id === asset.id)
        .map((h) => ({
          recorded_date: h.recorded_date,
          value: convertToBaseCurrency(h.value, asset.currency, displayCurrency, rates),
          net_equity:
            h.net_equity != null
              ? convertToBaseCurrency(h.net_equity, asset.currency, displayCurrency, rates)
              : null,
        })),
    })),
    // Run the series to today so it doesn't stop at the last recorded row.
    new Date().toISOString().slice(0, 10),
  );

  // Performance column for categories with no cost basis of their own:
  // vehicles compare the latest valuation with the purchase price (or, if none
  // was entered, the earliest valuation) — see `resolveVehicleValuation`.
  // Real Estate is still computed in the table from its all-in cost basis.
  const performanceByAsset: Record<string, { amount: number; percent: number | null }> = {};
  for (const asset of assets ?? []) {
    if (asset.asset_categories?.name !== "Vehicles") continue;
    const { change } = resolveVehicleValuation(
      parseVehicleMetadata(asset.metadata),
      (allHistory ?? []).filter((h) => h.asset_id === asset.id),
      asset.current_value,
    );
    if (change) performanceByAsset[asset.id] = change;
  }

  const initials =
    profile?.first_name?.[0]?.toUpperCase() ??
    user.email?.[0]?.toUpperCase() ??
    "?";

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: displayCurrency,
  });

  // "Total Assets" uses each asset's gross value and "Total Liabilities"
  // aggregates every debt (standalone liability rows, plus Real Estate's
  // linked-loan/off-plan balances via `lib/liabilities.ts`) — see that file's
  // doc comment for why this split doesn't change Net Worth itself, only
  // properly decomposes it instead of silently netting the mortgage debt out
  // of both totals the way summing `current_value` directly used to.
  const totalAssetsValue = (assets ?? [])
    .filter((asset) => !asset.is_liability)
    .reduce(
      (sum, asset) =>
        sum +
        convertToBaseCurrency(grossAssetValue(asset), asset.currency, displayCurrency, rates),
      0,
    );

  const totalLiabilitiesValue = (assets ?? []).reduce(
    (sum, asset) =>
      sum + convertToBaseCurrency(assetLiability(asset), asset.currency, displayCurrency, rates),
    0,
  );

  const totalNetWorth = totalAssetsValue - totalLiabilitiesValue;

  const totalUnrealizedGain = (assets ?? []).reduce((sum, asset) => {
    if (asset.asset_categories?.name !== "Real Estate") return sum;
    const metadata = parseRealEstateMetadata(asset.metadata);
    const marketValuation = metadata.market_valuation ?? asset.current_value;
    const totalCost = calculateTotalCost(metadata, marketValuation);
    const gain = calculateUnrealizedGain(marketValuation, totalCost);
    return (
      sum +
      convertToBaseCurrency(gain.amount, asset.currency, displayCurrency, rates)
    );
  }, 0);

  // Per-asset decomposition behind each metric card (the card-click modal).
  // Every row is already in the Base Currency, and each list sums exactly to
  // its card's headline figure (same helpers, same conversion).
  const breakdowns: DashboardBreakdowns = {
    netWorth: [],
    assets: [],
    liabilities: [],
    gain: [],
  };
  for (const asset of assets ?? []) {
    const category = asset.asset_categories?.name ?? "—";
    const toBase = (n: number) =>
      convertToBaseCurrency(n, asset.currency, displayCurrency, rates);
    const gross = asset.is_liability ? 0 : toBase(grossAssetValue(asset));
    const liability = toBase(assetLiability(asset));
    const base = { id: asset.id, name: asset.name, category };
    if (gross !== 0) breakdowns.assets.push({ ...base, amount: gross });
    if (liability !== 0) breakdowns.liabilities.push({ ...base, amount: liability });
    if (gross - liability !== 0) {
      breakdowns.netWorth.push({ ...base, amount: gross - liability });
    }
    if (category === "Real Estate") {
      const metadata = parseRealEstateMetadata(asset.metadata);
      const marketValuation = metadata.market_valuation ?? asset.current_value;
      const totalCost = calculateTotalCost(metadata, marketValuation);
      const gain = calculateUnrealizedGain(marketValuation, totalCost);
      breakdowns.gain.push({
        ...base,
        amount: toBase(gain.amount),
        marketValue: toBase(marketValuation),
        costBasis: toBase(totalCost),
      });
    }
  }

  return (
    <>
      <header className="flex flex-col gap-4 border-b border-border px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            <AvatarImage src={profile?.avatar_base64 || undefined} alt="" />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm text-muted-foreground">
              <T k="welcome_back" />
            </p>
            <h1 className="text-xl font-semibold text-foreground">
              {profile?.first_name || user.email}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <DashboardHeaderControls
            totalNetWorthFormatted={currencyFormatter.format(totalNetWorth)}
            baseCurrency={displayCurrency}
          />
        </div>
      </header>

      <main className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        <DashboardMetricCards
          netWorthFormatted={currencyFormatter.format(totalNetWorth)}
          assetsFormatted={currencyFormatter.format(totalAssetsValue)}
          liabilitiesFormatted={currencyFormatter.format(totalLiabilitiesValue)}
          hasLiabilities={totalLiabilitiesValue > 0}
          unrealizedGainFormatted={currencyFormatter.format(
            Math.abs(totalUnrealizedGain),
          )}
          unrealizedGainSign={
            totalUnrealizedGain > 0 ? "+" : totalUnrealizedGain < 0 ? "-" : null
          }
          baseCurrency={displayCurrency}
          breakdowns={breakdowns}
        />

        <PortfolioPerformanceChart series={performanceSeries} currency={displayCurrency} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              <T k="portfolio_heading" />
            </h2>
            <p className="text-sm text-muted-foreground">
              <T k="portfolio_subtitle" />
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CurrencySwitcher value={displayCurrency} />
            <AddInvestmentsDialog />
            <AddAssetDialog categories={categories ?? []} />
          </div>
        </div>

        <PortfolioGroups
          assets={assets ?? []}
          categories={categories ?? []}
          displayCurrency={displayCurrency}
          rates={rates}
          performanceByAsset={performanceByAsset}
        />
      </main>
    </>
  );
}
