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
          "id, name, category_id, quantity, current_value, currency, is_liability, metadata, images, asset_categories(name)",
        )
        .eq("id", id)
        .eq("profile_id", user.id)
        .single<AssetDetail>(),
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

  return (
    <AssetDetailView
      asset={asset}
      history={history ?? []}
      categories={categories ?? []}
      ratesFromUsd={rates}
    />
  );
}
