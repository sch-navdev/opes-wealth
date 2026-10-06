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
import { AddLiabilityDialog } from "@/components/add-liability-dialog";
import { CashBankCard, type CashAccount } from "@/components/cash-bank-card";
import { AddInvestmentsDialog } from "@/components/add-investments-dialog";
import { DashboardHeaderControls } from "@/components/dashboard-header-controls";
import {
  DashboardMetricCards,
  type DashboardBreakdowns,
} from "@/components/dashboard-metric-cards";
import { DashboardBento, type BentoTile } from "@/components/dashboard-bento";
import { DashboardAnalytics } from "@/components/dashboard-analytics";
import { buildSparkline } from "@/lib/sparkline";
import { PortfolioGroups } from "@/components/portfolio-groups";
import { DashboardBasicOverview } from "@/components/dashboard-basic-overview";
import { DashboardCsvCard } from "@/components/dashboard-csv-card";
import { DashboardExpertPanels } from "@/components/dashboard-expert-panels";
import { TierGate } from "@/components/tier-gate";
import { buildAllocation, topAssets } from "@/lib/dashboard-tiers";
import { buildExpertPanelsData } from "@/lib/dashboard-expert";
import { cookies } from "next/headers";
import { UI_TIER_COOKIE, parseExpertiseLevel } from "@/stores/useUiTierStore";
import { buildAttributionPanelData, collectAttributionCandidates } from "@/lib/dashboard-attribution";
import { fetchAttributionFx } from "@/lib/dashboard-attribution-fetch";
import { T } from "@/components/translated-text";
import {
  DEFAULT_BASE_CURRENCY,
  convertToBaseCurrency,
  getExchangeRatesFromUsd,
} from "@/lib/fx";
import { buildNetWorthSeries, thinHistory, type AssetLineInput } from "@/lib/portfolio-performance";
import { fetchAllAssetHistory } from "@/lib/asset-history-fetch";
import { buildAssetInvested } from "@/lib/invested-capital";
import { buildDccPortfolio } from "@/lib/dcc";
import { ExportReportsCard } from "@/components/export-reports-card";
import { PassiveIncomeCard } from "@/components/passive-income-card";
import { buildPassiveIncome } from "@/lib/passive-income";
import { IncomeCalendar } from "@/components/income-calendar";
import { buildIncomeCalendar } from "@/lib/income-calendar";
import {
  applyOwnershipFactors,
  loadCoOwnedAssets,
  loadOwnershipFactors,
  scaleHistoryRows,
} from "@/lib/shared-assets/load";
import { loadPendingApprovals } from "@/lib/shared-assets/server";
import { loadNotifications } from "@/lib/shared-assets/notifications-server";
import { loadSimulations, summariseHoldings, toProjectInput } from "@/lib/planning-data";
import { FutureProjectsCard } from "@/components/future-projects-card";
import { DEMO_MONTHLY_INCOME, isDemoUser } from "@/lib/demo-mode";
import { getBankSyncMode } from "@/lib/banking/altareq";
import {
  buildVehicleHistoryFromPurchase,
  parseVehicleMetadata,
  resolveVehicleValuation,
} from "@/lib/vehicles";
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
  profile_id: string;
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

  const ASSET_COLUMNS =
    "id, profile_id, name, category_id, quantity, current_value, currency, is_liability, metadata, images, ticker_symbol, purchase_date, asset_categories(name)";
  // Everything here depends only on the user id, so it runs at the same time: each
  // sequential query costs a full round trip to the database.
  const [
    { data: categories },
    { data: ownAssetRows },
    { data: profile },
    rates,
    sharedWithMe,
    pendingApprovals,
    notifications,
    { data: savedDccRow },
    simulationRows,
  ] = await Promise.all([
      supabase.from("asset_categories").select("id, name").order("name"),
      supabase
        .from("assets")
        .select(ASSET_COLUMNS)
        .eq("profile_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .returns<AssetRow[]>(),
      supabase
        .from("profiles")
        .select(
          "first_name, last_name, avatar_base64, default_currency, phone_number, address_street, address_city, address_postal_code, address_country",
        )
        .eq("id", user.id)
        .single(),
      getExchangeRatesFromUsd(),
      loadCoOwnedAssets<AssetRow>(supabase, user.id, ASSET_COLUMNS, new Set()),
      loadPendingApprovals(user.id),
      loadNotifications(user.id), // [] until migration 0034 is applied
      // Last Client Knowledge Document entries (migration 0026); null until saved or if the table doesn't exist yet.
      supabase.from("client_knowledge_documents").select("data").eq("profile_id", user.id).maybeSingle(),
      // Future Projects: simulations, shown only in their own widget (never in the totals above).
      loadSimulations(supabase, user.id),
    ]);

  // Co-ownership (migration 0025): assets shared WITH me are added and every asset
  // is reduced to MY share, so each total below (net worth, categories, charts,
  // passive income…) is pro-rata — $1M held 50% counts as $500k. With the
  // migration unapplied there are no owner rows and everything stays at 100%.
  const ownIds = new Set((ownAssetRows ?? []).map((a) => a.id));
  const unscaledAssets = [...(ownAssetRows ?? []), ...sharedWithMe.filter((a) => !ownIds.has(a.id))];
  const factorById = await loadOwnershipFactors(supabase, user.id, unscaledAssets);
  const assets: AssetRow[] = applyOwnershipFactors(unscaledAssets, factorById);

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
  const rawHistory = await fetchAllAssetHistory(
    supabase,
    (assets ?? []).map((a) => a.id),
  );
  // History rows are stored for the WHOLE asset: reduce them to my share too.
  const allHistory = scaleHistoryRows(rawHistory, factorById);

  const today = new Date().toISOString().slice(0, 10);

  // Each asset's history rows, in its own currency. Vehicles are plotted from
  // their recorded purchase date (see `buildVehicleHistoryFromPurchase`), not
  // from whenever the first row happens to be — and never before the purchase.
  const historyByAsset = new Map<string, typeof allHistory>();
  for (const asset of assets ?? []) {
    const rows = allHistory.filter((h) => h.asset_id === asset.id);
    historyByAsset.set(
      asset.id,
      asset.asset_categories?.name === "Vehicles"
        ? buildVehicleHistoryFromPurchase(
            rows,
            asset.purchase_date,
            parseVehicleMetadata(asset.metadata).purchase_price,
            today,
            (date, value) => ({
              asset_id: asset.id,
              recorded_date: date,
              value,
              net_equity: value,
            }),
          ).map((h) => ({ ...h, net_equity: h.value }))
        : rows,
    );
  }

  const baseHistory = (asset: AssetRow) =>
    (historyByAsset.get(asset.id) ?? []).map((h) => ({
      recorded_date: h.recorded_date,
      value: convertToBaseCurrency(h.value, asset.currency, displayCurrency, rates),
      net_equity:
        h.net_equity != null
          ? convertToBaseCurrency(h.net_equity, asset.currency, displayCurrency, rates)
          : null,
    }));

  const performanceSeries = buildNetWorthSeries(
    (assets ?? []).map((asset) => ({
      category: asset.asset_categories?.name ?? "—",
      history: baseHistory(asset),
    })),
    // Run the series to today so it doesn't stop at the last recorded row.
    today,
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
      (allHistory ?? []).filter(
        (h) => h.asset_id === asset.id && (!asset.purchase_date || h.recorded_date >= asset.purchase_date),
      ),
      asset.current_value,
    );
    if (change) performanceByAsset[asset.id] = change;
  }

  const initials =
    profile?.first_name?.[0]?.toUpperCase() ??
    user.email?.[0]?.toUpperCase() ??
    "?";

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
    if (liability !== 0) {
      const loan =
        category === "Real Estate" && !asset.is_liability
          ? parseRealEstateMetadata(asset.metadata).linked_loan
          : null;
      breakdowns.liabilities.push({
        ...base,
        amount: liability,
        // The debt that comes from this property's own linked loan / off-plan balance.
        linkedLender: loan && (loan.amount || loan.outstanding_principal) ? loan.lender_name || "" : undefined,
      });
    }
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

  // Per-asset input for the category cards / explorer / forward projections.
  const netWorthById = new Map(breakdowns.netWorth.map((row) => [row.id, row.amount]));
  const keepDailyFrom = new Date(new Date(`${today}T00:00:00Z`).getTime() - 430 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  // Micro-sparklines: <=24 rounded points per asset (base currency, net equity like assetLines).
  const sparkByAsset: Record<string, number[]> = {};
  for (const asset of assets ?? []) {
    const pts = buildSparkline(
      baseHistory(asset).map((h): [string, number] => [h.recorded_date, h.net_equity ?? h.value]),
      24,
    );
    if (pts.length >= 2) sparkByAsset[asset.id] = pts.map((n) => Math.round(n * 100) / 100);
  }
  const assetLines: AssetLineInput[] = (assets ?? []).map((asset) => ({
    id: asset.id,
    name: asset.name,
    category: asset.asset_categories?.name ?? "—",
    currentValue: netWorthById.get(asset.id) ?? 0,
    // Older rows are thinned to keep the payload small; the last ~14 months
    // stay daily so the 1M / 6M / 1Y zoom ranges keep their detail.
    history: thinHistory(
      baseHistory(asset).map((h): [string, number] => [h.recorded_date, h.net_equity ?? h.value]),
      300,
      keepDailyFrom,
    ),
    invested: buildAssetInvested({
      category: asset.asset_categories?.name ?? "—",
      purchase_date: asset.purchase_date,
      metadata: asset.metadata,
      current_value: asset.current_value,
      quantity: asset.quantity,
    })?.map(([date, amount]): [string, number] => [
      date,
      convertToBaseCurrency(amount, asset.currency, displayCurrency, rates),
    ]),
  }));

  // Cash & bank accounts for the dashboard card: balance in the account's own
  // currency (the CSV import reconciles against it) and in the Base Currency,
  // plus the date of the newest balance on record.
  // Open Finance links for the Cash accounts (non-secret columns only — the
  // token columns are not selectable by the browser role, see migration 0020).
  // If 0020 isn't applied yet this simply returns nothing.
  const { data: bankLinks } = await supabase
    .from("bank_account_links")
    .select(
      "asset_id, connection_id, last_synced_at, last_sync_status, last_sync_error, bank_connections(institution_name, is_sandbox, status, last_synced_at)",
    )
    .eq("profile_id", user.id)
    // Sandbox links have no asset (migration 0020) — they live only in the banking view.
    .eq("is_sandbox", false)
    .returns<
      {
        asset_id: string;
        connection_id: string;
        last_synced_at: string | null;
        last_sync_status: "ok" | "error" | null;
        last_sync_error: string | null;
        bank_connections: {
          institution_name: string;
          is_sandbox: boolean;
          status: string;
          last_synced_at: string | null;
        } | null;
      }[]
    >();
  const bankByAsset = new Map((bankLinks ?? []).map((l) => [l.asset_id, l]));

  const cashAccounts: CashAccount[] = (assets ?? [])
    .filter((a) => a.asset_categories?.name === "Cash" && !a.is_liability)
    .map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      nativeValue: a.current_value,
      baseValue: convertToBaseCurrency(a.current_value, a.currency, displayCurrency, rates),
      institutionName:
        typeof a.metadata?.institution_name === "string" ? a.metadata.institution_name : undefined,
      accountType: typeof a.metadata?.account_type === "string" ? a.metadata.account_type : undefined,
      lastDate:
        (allHistory ?? [])
          .filter((h) => h.asset_id === a.id)
          .reduce<string | null>((max, h) => (!max || h.recorded_date > max ? h.recorded_date : max), null),
      bank: (() => {
        const link = bankByAsset.get(a.id);
        if (!link?.bank_connections) return undefined;
        return {
          connectionId: link.connection_id,
          institutionName: link.bank_connections.institution_name,
          isSandbox: link.bank_connections.is_sandbox,
          connectionStatus: link.bank_connections.status,
          lastSyncedAt: link.last_synced_at ?? link.bank_connections.last_synced_at,
          lastSyncStatus: link.last_sync_status,
          lastSyncError: link.last_sync_error,
        };
      })(),
    }));

  const passiveIncome = buildPassiveIncome(
    assets ?? [],
    today,
    (amount, currency) => convertToBaseCurrency(amount, currency, displayCurrency, rates),
    (asset) => convertToBaseCurrency(grossAssetValue(asset), asset.currency, displayCurrency, rates),
  );

  // Forward 12-month income calendar (Professional/Expert): same share-scaled
  // `assets` the passive-income card uses, spread over the real payment schedule.
  const incomeCalendar = buildIncomeCalendar({
    assets: assets ?? [],
    rates,
    baseCurrency: displayCurrency,
    startDate: today,
  });

  // Bento header: net contribution + holding count for the three headline
  // classes (same netWorth breakdown rows the metric cards use, so they agree),
  // plus a thinned Total series for the hero sparkline.
  const bentoTiles: BentoTile[] = ["Real Estate", "Vehicles", "Private Equity"].map((category) => ({
    category,
    total: breakdowns.netWorth.filter((r) => r.category === category).reduce((sum, r) => sum + r.amount, 0),
    count: (assets ?? []).filter((a) => !a.is_liability && a.asset_categories?.name === category).length,
  }));
  const sparkStep = Math.max(1, Math.ceil(performanceSeries.points.length / 60));
  const bentoSpark = performanceSeries.points
    .filter((_, i, all) => i % sparkStep === 0 || i === all.length - 1)
    .map((p) => ({ date: p.date, value: p.total ?? 0 }));

  // UI tiers (see lib/dashboard-tiers.ts): the page always loads everything once;
  // <TierGate> decides client-side what the active tier shows. Basic view data:
  // gross holdings by category for the pie, net contributions for the top list.
  const basicAllocation = buildAllocation(breakdowns.assets);
  const basicTopAssets = topAssets(breakdowns.netWorth, 5);
  const expertData = buildExpertPanelsData(assets ?? [], displayCurrency, rates, today);
  // Currency vs capital attribution (Expert panel): foreign-currency holdings with a cost basis.
  // Historical FX is fetched once, in parallel per currency, and never throws: a provider failure
  // only lowers the panel's coverage. Skipped entirely when there is nothing foreign to attribute.
  // Only the Expert view shows it, so the network fetch is skipped for other tiers (cookie = UI preference mirror).
  const showsExpertPanels = parseExpertiseLevel((await cookies()).get(UI_TIER_COOKIE)?.value) === "expert";
  const attributionCandidates = showsExpertPanels ? collectAttributionCandidates(assets ?? [], displayCurrency) : [];
  const attributionData =
    attributionCandidates.length === 0
      ? null
      : buildAttributionPanelData({
          candidates: attributionCandidates,
          baseCurrency: displayCurrency,
          rates,
          fxHistory: await fetchAttributionFx(attributionCandidates, displayCurrency),
        });

  const addDialogs = (
    <>
      <AddInvestmentsDialog />
      <AddLiabilityDialog />
      <AddAssetDialog
        categories={categories ?? []}
        companies={(assets ?? [])
          .filter((a) => a.asset_categories?.name === "Companies")
          .map((a) => ({ id: a.id, name: a.name }))}
      />
    </>
  );

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
            totalNetWorth={totalNetWorth}
            baseCurrency={displayCurrency}
            pendingApprovals={pendingApprovals}
            notifications={notifications}
          />
        </div>
      </header>

      <main className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        <TierGate section="basicOverview">
          <DashboardBasicOverview
            netWorth={totalNetWorth}
            baseCurrency={displayCurrency}
            allocation={basicAllocation}
            top={basicTopAssets}
            sparklines={sparkByAsset}
            addAction={
              <AddAssetDialog
                categories={categories ?? []}
                companies={(assets ?? [])
                  .filter((a) => a.asset_categories?.name === "Companies")
                  .map((a) => ({ id: a.id, name: a.name }))}
              />
            }
          />
        </TierGate>

        <TierGate section="bento">
          <DashboardBento
            netWorth={totalNetWorth}
            baseCurrency={displayCurrency}
            tiles={bentoTiles}
            spark={bentoSpark}
          />
        </TierGate>

        <TierGate section="quickAdd">
          <div className="flex flex-wrap items-center gap-2">{addDialogs}</div>
        </TierGate>

        <TierGate section="metricCards">
          <DashboardMetricCards
            netWorth={totalNetWorth}
            assets={totalAssetsValue}
            liabilities={totalLiabilitiesValue}
            hasLiabilities={totalLiabilitiesValue > 0}
            unrealizedGain={Math.abs(totalUnrealizedGain)}
            unrealizedGainSign={
              totalUnrealizedGain > 0 ? "+" : totalUnrealizedGain < 0 ? "-" : null
            }
            baseCurrency={displayCurrency}
            breakdowns={breakdowns}
          />
        </TierGate>

        <TierGate section="cashFlow">
          <PassiveIncomeCard summary={passiveIncome} baseCurrency={displayCurrency} />

          <CashBankCard
            accounts={cashAccounts}
            baseCurrency={displayCurrency}
            bankSyncMode={getBankSyncMode()}
          />
        </TierGate>

        <TierGate section="incomeCalendar">
          <IncomeCalendar calendar={incomeCalendar} baseCurrency={displayCurrency} />
        </TierGate>

        <TierGate section="csvUpload">
          <DashboardCsvCard
            accounts={cashAccounts.map(({ id, name, currency, nativeValue }) => ({
              id,
              name,
              currency,
              nativeValue,
            }))}
          />
        </TierGate>

        <TierGate section="futureProjects">
          <FutureProjectsCard
            baseCurrency={displayCurrency}
            projects={simulationRows.map((row) => toProjectInput(row, displayCurrency, rates))}
            {...summariseHoldings(assets ?? [], displayCurrency, rates)}
            defaultMonthlyIncome={isDemoUser(user.id) ? DEMO_MONTHLY_INCOME : undefined}
          />
        </TierGate>

        <TierGate section="analytics">
          <DashboardAnalytics
            series={performanceSeries}
            assets={assetLines}
            currency={displayCurrency}
            today={today}
          />
        </TierGate>

        <TierGate section="portfolio">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              <T k="portfolio_heading" />
            </h2>
            <p className="text-sm text-muted-foreground">
              <T k="portfolio_subtitle" />
            </p>
          </div>

          <PortfolioGroups
            assets={assets ?? []}
            categories={categories ?? []}
            displayCurrency={displayCurrency}
            rates={rates}
            performanceByAsset={performanceByAsset}
            sparklines={sparkByAsset}
            sharedAssetIds={[...factorById].filter(([, f]) => f !== 1).map(([id]) => id)}
          />
        </TierGate>

        <TierGate section="expertPanels">
          <DashboardExpertPanels data={expertData} baseCurrency={displayCurrency} attribution={attributionData} />
        </TierGate>

        <TierGate section="export">
          <ExportReportsCard
            savedDcc={savedDccRow?.data ?? null}
            baseCurrency={displayCurrency}
            portfolio={buildDccPortfolio(assets ?? [], displayCurrency, rates, today)}
            profile={{
              firstName: profile?.first_name ?? "",
              lastName: profile?.last_name ?? "",
              phone: profile?.phone_number ?? "",
              address: profile?.address_street ?? "",
              postalCity: [profile?.address_postal_code, profile?.address_city]
                .filter(Boolean)
                .join(" - "),
              country: profile?.address_country ?? "",
              email: user.email ?? "",
            }}
          />
        </TierGate>
      </main>
    </>
  );
}
