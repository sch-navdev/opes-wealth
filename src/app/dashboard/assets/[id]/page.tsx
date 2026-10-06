import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import {
  createMockAdminClient,
  getMockUserId,
  isMockAuthEnabled,
} from "@/utils/supabase/mock-auth";
import { AssetDetailView, type AssetDetail, type AssetHistoryPoint } from "@/components/asset-detail-view";
import { DEFAULT_BASE_CURRENCY, getExchangeRatesFromUsd } from "@/lib/fx";
import { getHistoricalRatesBatch, type HistoricalRateResult } from "@/lib/services/fx-history-client";
import { attributionDates, buildAttributionView, type AssetAttributionView } from "@/lib/asset-attribution-view";
import type { OwnerFormRow } from "@/components/ownership-fields";
import { loadOwnershipStatus } from "@/lib/shared-assets/server";
import { ownershipFactor } from "@/lib/ownership";
import { viewerShareFactor } from "@/lib/asset-detail-scaling";
import type { StoredTransactionRow } from "@/lib/transaction-detail";

export default async function AssetDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // DEV-ONLY MOCK AUTH: same narrowly-scoped bypass as dashboard/page.tsx,
  // extended here so a terminal agent can verify the per-category detail
  // views without a browser/passkey. Hard-gated on NODE_ENV === "development".
  const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
  const supabase = mockUserId ? createMockAdminClient() : await createClient();

  const user = mockUserId
    ? { id: mockUserId }
    : (await supabase.auth.getUser()).data.user;

  if (!user) {
    redirect("/login");
  }

  if (!mockUserId && (await needsMfaStepUp(supabase))) {
    redirect("/login/mfa");
  }

  const [{ data: asset }, { data: history }, { data: categories }, rates] =
    await Promise.all([
      supabase
        .from("assets")
        .select(
          "id, profile_id, name, category_id, quantity, current_value, currency, is_liability, metadata, images, ticker_symbol, purchase_date, asset_categories(name)",
        )
        .eq("id", id)
        .single<AssetDetail & { profile_id: string }>(),
      supabase
        .from("asset_history")
        .select("id, recorded_date, value, net_equity, source")
        .eq("asset_id", id)
        .order("recorded_date", { ascending: true })
        .returns<AssetHistoryPoint[]>(),
      supabase.from("asset_categories").select("id, name").order("name"),
      getExchangeRatesFromUsd(),
    ]);

  if (!asset) {
    notFound();
  }

  // Co-ownership (migration 0025): the creator and every registered co-owner may open the asset.
  const { data: ownerRows } = await supabase
    .from("asset_owners")
    .select("profile_id, name, email, ownership_percentage, is_creator")
    .eq("asset_id", id)
    .order("is_creator", { ascending: false });
  if (asset.profile_id !== user.id && !(ownerRows ?? []).some((r) => r.profile_id === user.id)) {
    notFound();
  }
  const owners: OwnerFormRow[] = (ownerRows ?? []).map((r, i) => ({
    key: `owner-${i}`,
    name: r.name,
    email: r.email ?? "",
    percentage: String(Number(r.ownership_percentage)),
    isCreator: r.is_creator,
    isYou: r.profile_id === user.id,
  }));

  // The viewer's share (0-1) for read-only display (same factors the dashboard applies, also under mock auth).
  const ownerFactor = viewerShareFactor({
    factor: ownershipFactor(
      asset.profile_id,
      (ownerRows ?? []).map((r) => ({ profile_id: r.profile_id, ownership_percentage: Number(r.ownership_percentage) })),
      user.id,
    ),
  });

  // Stored bank transactions (Cash accounts only). The table may not exist in every environment, and
  // RLS decides which rows a co-owner sees: any error simply means "no transactions".
  let transactions: StoredTransactionRow[] = [];
  if (asset.asset_categories?.name === "Cash") {
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("booked_date, amount, currency, description, source, fingerprint, created_at")
        .eq("asset_id", id)
        .order("booked_date", { ascending: false })
        .limit(200)
        .returns<StoredTransactionRow[]>();
      if (!error && data) transactions = data;
    } catch {
      transactions = [];
    }
  }

  const ownershipStatus = owners.length > 1 && !mockUserId ? await loadOwnershipStatus(id, user.id) : null;

  // FX-vs-capital attribution (multi-currency holdings only). Base = the user's default currency, the
  // same preference the dashboard falls back to. Never lets a failure break the page.
  let attribution: AssetAttributionView | null = null;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("default_currency")
      .eq("id", user.id)
      .single();
    const attrArgs = {
      category: asset.asset_categories?.name ?? null,
      currency: asset.currency,
      base: profile?.default_currency || DEFAULT_BASE_CURRENCY,
      currentValue: asset.current_value,
      quantity: asset.quantity,
      purchaseDate: asset.purchase_date,
      metadata: asset.metadata,
      factor: ownerFactor,
    };
    const dates = attributionDates(attrArgs);
    if (dates) {
      let historical: Record<string, HistoricalRateResult> | null = null;
      if (dates.length > 0) {
        try {
          historical = await getHistoricalRatesBatch(dates, asset.currency, attrArgs.base);
        } catch {
          historical = null;
        }
      }
      attribution = buildAttributionView({ ...attrArgs, ratesFromUsd: rates, historical });
    }
  } catch {
    attribution = null;
  }

  return (
    <AssetDetailView
      asset={asset}
      history={history ?? []}
      categories={categories ?? []}
      ratesFromUsd={rates}
      owners={owners}
      ownershipStatus={ownershipStatus}
      ownerFactor={ownerFactor}
      transactions={transactions}
      attribution={attribution}
    />
  );
}
