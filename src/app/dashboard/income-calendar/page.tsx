import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { createMockAdminClient, getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { IncomeCalendarExplorer } from "@/components/income-calendar-explorer";
import { DEFAULT_BASE_CURRENCY, getExchangeRatesFromUsd } from "@/lib/fx";
import { buildIncomeCalendar, DEFAULT_CALENDAR_MONTHS, MAX_CALENDAR_MONTHS } from "@/lib/income-calendar";
import { loadIncomeStreams } from "@/lib/income-streams-server";
import type { PassiveIncomeAsset } from "@/lib/passive-income";
import { applyOwnershipFactors, loadCoOwnedAssets, loadOwnershipFactors } from "@/lib/shared-assets/load";

const COLUMNS = "id, profile_id, name, quantity, current_value, currency, is_liability, metadata, asset_categories(name)";
type Loaded = PassiveIncomeAsset & { profile_id: string };

/**
 * Full-page income calendar: the dashboard card's calendar for any start month and length (`?from=YYYY-MM&months=N`,
 * up to 10 years), with charts and a short analysis. Same assets as the dashboard (own plus co-owned, reduced to
 * the user's share) and the same earned-income streams.
 */
export default async function IncomeCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string; from?: string; months?: string }>;
}) {
  const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
  const supabase = mockUserId ? createMockAdminClient() : await createClient();
  const user = mockUserId ? { id: mockUserId } : (await supabase.auth.getUser()).data.user;
  if (!user) redirect("/login");
  if (!mockUserId && (await needsMfaStepUp(supabase))) redirect("/login/mfa");

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = params.from && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.from) ? params.from : today.slice(0, 7);
  const wanted = Math.round(Number(params.months));
  const months = Number.isFinite(wanted) && wanted >= 1 ? Math.min(MAX_CALENDAR_MONTHS, wanted) : DEFAULT_CALENDAR_MONTHS;

  const [{ data: own }, { data: profile }, rates, shared, { streams }] = await Promise.all([
    supabase.from("assets").select(COLUMNS).eq("profile_id", user.id).eq("status", "active").returns<Loaded[]>(),
    supabase.from("profiles").select("default_currency").eq("id", user.id).single(),
    getExchangeRatesFromUsd(),
    loadCoOwnedAssets<Loaded>(supabase, user.id, COLUMNS, new Set()),
    loadIncomeStreams(supabase, user.id),
  ]);
  const ownIds = new Set((own ?? []).map((a) => a.id));
  const unscaled = [...(own ?? []), ...shared.filter((a) => !ownIds.has(a.id))];
  const assets = applyOwnershipFactors(unscaled, await loadOwnershipFactors(supabase, user.id, unscaled));
  const baseCurrency = params.currency || profile?.default_currency || DEFAULT_BASE_CURRENCY;

  const calendar = buildIncomeCalendar({ assets, rates, baseCurrency, startDate: `${from}-01`, months, streams });
  const back = params.currency ? `/dashboard?currency=${encodeURIComponent(params.currency)}` : "/dashboard";

  return (
    <IncomeCalendarExplorer
      calendar={calendar}
      baseCurrency={baseCurrency}
      from={from}
      months={months}
      hasEarned={calendar.months.some((m) => m.earned !== undefined)}
      backHref={back}
    />
  );
}
