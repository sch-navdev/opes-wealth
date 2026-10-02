import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import {
  createMockAdminClient,
  getMockUserId,
  isMockAuthEnabled,
} from "@/utils/supabase/mock-auth";
import { AssetDetailView, type AssetDetail, type AssetHistoryPoint } from "@/components/asset-detail-view";
import { getExchangeRatesFromUsd } from "@/lib/fx";
import type { OwnerFormRow } from "@/components/ownership-fields";

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

  return (
    <AssetDetailView
      asset={asset}
      history={history ?? []}
      categories={categories ?? []}
      ratesFromUsd={rates}
      owners={owners}
    />
  );
}
