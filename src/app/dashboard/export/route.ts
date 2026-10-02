import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import {
  createMockAdminClient,
  getMockUserId,
  isMockAuthEnabled,
} from "@/utils/supabase/mock-auth";
import { fetchAllAssetHistory } from "@/lib/asset-history-fetch";
import { DEFAULT_BASE_CURRENCY, getExchangeRatesFromUsd } from "@/lib/fx";
import { buildPortfolioWorkbook, type ExportAsset } from "@/lib/portfolio-export";
import {
  applyOwnershipFactors,
  loadCoOwnedAssets,
  loadOwnershipFactors,
  scaleHistoryRows,
} from "@/lib/shared-assets/load";

const EXPORT_COLUMNS =
  "id, profile_id, name, category_id, quantity, current_value, currency, is_liability, metadata, ticker_symbol, purchase_date, asset_categories(name)";
type OwnedExportAsset = ExportAsset & { profile_id: string; asset_categories: { name: string } | null };

export const dynamic = "force-dynamic";
/** The history sheet pages through every asset_history row. */
export const maxDuration = 60;

/**
 * GET /dashboard/export?currency=USD — the signed-in user's full portfolio as
 * an .xlsx workbook (see `lib/portfolio-export.ts`). Same auth gates as the
 * dashboard page (session + MFA step-up; dev-only mock-auth bypass); the user
 * id comes from the session, never from the request.
 */
export async function GET(request: Request) {
  const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
  const supabase = mockUserId ? createMockAdminClient() : await createClient();

  const user = mockUserId
    ? { id: mockUserId }
    : (await supabase.auth.getUser()).data.user;
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!mockUserId && (await needsMfaStepUp(supabase))) {
    return new Response("Two-factor verification required", { status: 403 });
  }

  const [{ data: assets }, { data: profile }, rates] = await Promise.all([
    supabase
      .from("assets")
      .select(EXPORT_COLUMNS)
      .eq("profile_id", user.id)
      .eq("status", "active")
      .order("name")
      .returns<OwnedExportAsset[]>(),
    supabase
      .from("profiles")
      .select("first_name, last_name, default_currency")
      .eq("id", user.id)
      .single(),
    getExchangeRatesFromUsd(),
  ]);

  const requested = new URL(request.url).searchParams.get("currency");
  const baseCurrency = /^[A-Z]{3}$/.test(requested ?? "")
    ? (requested as string)
    : profile?.default_currency || DEFAULT_BASE_CURRENCY;

  // Co-ownership: include shared assets and report the user's share of each.
  const unscaled = [
    ...(assets ?? []),
    ...(await loadCoOwnedAssets<OwnedExportAsset>(supabase, user.id, EXPORT_COLUMNS, new Set((assets ?? []).map((a) => a.id)))),
  ];
  const factors = await loadOwnershipFactors(supabase, user.id, unscaled);
  const rows = applyOwnershipFactors(unscaled, factors);
  const history = scaleHistoryRows(
    await fetchAllAssetHistory(
      supabase,
      rows.map((a) => a.id),
    ),
    factors,
  );

  const today = new Date().toISOString().slice(0, 10);
  const buffer = buildPortfolioWorkbook({
    assets: rows,
    history,
    baseCurrency,
    rates,
    today,
    ownerName: [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="opes-wealth-portfolio-${today}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
