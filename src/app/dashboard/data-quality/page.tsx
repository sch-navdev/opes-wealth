import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { createMockAdminClient, getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { DataQualityList } from "@/components/data-quality-list";
import { loadDataQualityReport } from "@/lib/data-quality-load";

/**
 * Data quality: every finding of the checks in `lib/data-quality.ts`, grouped by severity. Same
 * dev-only mock-auth bypass as the dashboard (hard-gated on NODE_ENV === "development"), same
 * MFA step-up and the same co-ownership scaling (the user's share of each asset).
 */
export default async function DataQualityPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
  const supabase = mockUserId ? createMockAdminClient() : await createClient();
  const user = mockUserId ? { id: mockUserId } : (await supabase.auth.getUser()).data.user;
  if (!user) redirect("/login");
  if (!mockUserId && (await needsMfaStepUp(supabase))) redirect("/login/mfa");

  const { currency } = await searchParams;
  const { report } = await loadDataQualityReport(supabase, user.id, currency);

  return (
    <div className="w-full px-4 py-10 sm:px-6 lg:px-8">
      <DataQualityList report={report} />
    </div>
  );
}
