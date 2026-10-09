import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { createMockAdminClient, getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { IncomeStreamsManager } from "@/components/income-streams-manager";
import { isDemoUser } from "@/lib/demo-mode";
import { DEFAULT_BASE_CURRENCY, getExchangeRatesFromUsd } from "@/lib/fx";
import { loadIncomeStreams } from "@/lib/income-streams-server";

/**
 * Personal Cash Flow, step 1: the user's own earned-income streams (private to them, no
 * co-owner sharing). Same dev-only mock-auth bypass as the other dashboard pages.
 */
export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
  const supabase = mockUserId ? createMockAdminClient() : await createClient();
  const user = mockUserId ? { id: mockUserId } : (await supabase.auth.getUser()).data.user;
  if (!user) redirect("/login");
  if (!mockUserId && (await needsMfaStepUp(supabase))) redirect("/login/mfa");

  const [{ data: profile }, rates, { currency }, { streams, available }] = await Promise.all([
    supabase.from("profiles").select("default_currency").eq("id", user.id).single(),
    getExchangeRatesFromUsd(),
    searchParams,
    loadIncomeStreams(supabase, user.id),
  ]);
  const baseCurrency = currency || profile?.default_currency || DEFAULT_BASE_CURRENCY;

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <IncomeStreamsManager
        streams={streams}
        baseCurrency={baseCurrency}
        rates={rates}
        asOf={new Date().toISOString().slice(0, 10)}
        available={available}
        readOnly={isDemoUser(user.id)}
      />
    </div>
  );
}
