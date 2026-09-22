import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import {
  createMockAdminClient,
  getMockUserId,
  isMockAuthEnabled,
} from "@/utils/supabase/mock-auth";
import { logout } from "@/app/auth/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AddAssetDialog } from "@/components/add-asset-dialog";
import { CurrencySwitcher } from "@/components/currency-switcher";
import { DashboardHeaderControls } from "@/components/dashboard-header-controls";
import { DashboardMetricCards } from "@/components/dashboard-metric-cards";
import { PortfolioTable } from "@/components/portfolio-table";
import { T } from "@/components/translated-text";
import { convertAmount, getExchangeRatesFromUsd } from "@/lib/fx";
import {
  calculateTotalCost,
  calculateUnrealizedGain,
  parseRealEstateMetadata,
} from "@/lib/real-estate";

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
          "id, name, category_id, quantity, current_value, currency, is_liability, metadata, images, asset_categories(name)",
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
  const displayCurrency =
    currencyParam || profile?.default_currency || "USD";

  const initials =
    profile?.first_name?.[0]?.toUpperCase() ??
    user.email?.[0]?.toUpperCase() ??
    "?";

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: displayCurrency,
  });

  const totalNetWorth = (assets ?? []).reduce((sum, asset) => {
    const converted = convertAmount(
      asset.current_value,
      asset.currency,
      displayCurrency,
      rates,
    );
    return sum + (asset.is_liability ? -converted : converted);
  }, 0);

  const totalAssetsValue = (assets ?? [])
    .filter((asset) => !asset.is_liability)
    .reduce(
      (sum, asset) =>
        sum +
        convertAmount(asset.current_value, asset.currency, displayCurrency, rates),
      0,
    );

  const totalLiabilitiesValue = (assets ?? [])
    .filter((asset) => asset.is_liability)
    .reduce(
      (sum, asset) =>
        sum +
        convertAmount(asset.current_value, asset.currency, displayCurrency, rates),
      0,
    );

  const totalUnrealizedGain = (assets ?? []).reduce((sum, asset) => {
    if (asset.asset_categories?.name !== "Real Estate") return sum;
    const metadata = parseRealEstateMetadata(asset.metadata);
    const marketValuation = metadata.market_valuation ?? asset.current_value;
    const totalCost = calculateTotalCost(metadata, marketValuation);
    const gain = calculateUnrealizedGain(marketValuation, totalCost);
    return (
      sum +
      convertAmount(gain.amount, asset.currency, displayCurrency, rates)
    );
  }, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex flex-col gap-4 border-b border-border px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
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
          />
          <Link
            href="/dashboard/settings"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            <T k="profile_settings" />
          </Link>
          <form action={logout}>
            <Button type="submit" variant="outline">
              <T k="sign_out" />
            </Button>
          </form>
        </div>
      </header>

      <main className="space-y-6 px-4 py-10 sm:px-8">
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
        />

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
            <AddAssetDialog categories={categories ?? []} />
          </div>
        </div>

        <PortfolioTable
          assets={assets ?? []}
          categories={categories ?? []}
          displayCurrency={displayCurrency}
          rates={rates}
        />
      </main>
    </div>
  );
}
