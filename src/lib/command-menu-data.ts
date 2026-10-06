import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { createMockAdminClient, getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { loadCoOwnedAssets, loadOwnershipFactors } from "@/lib/shared-assets/load";
import { capHoldings, MAX_COMMAND_HOLDINGS, type CommandHolding } from "@/lib/command-menu-items";

type Row = {
  id: string;
  profile_id: string;
  name: string;
  ticker_symbol: string | null;
  is_liability: boolean;
  asset_categories: { name: string } | null;
};

const COLUMNS = "id, profile_id, name, ticker_symbol, is_liability, asset_categories(name)";

/**
 * Light holdings list for the command palette (server only; never fetched from the client).
 * Same data path as the dashboard: the user's own active assets plus the ones shared with
 * them (assets they own none of are dropped). Never throws: the palette just gets no holdings.
 */
export async function loadCommandHoldings(): Promise<CommandHolding[]> {
  try {
    // DEV-ONLY MOCK AUTH: same gate and pattern as app/dashboard/page.tsx.
    const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
    const supabase = mockUserId ? createMockAdminClient() : await createClient();
    const user = mockUserId ? { id: mockUserId } : (await supabase.auth.getUser()).data.user;
    if (!user) return [];
    // A session still owed an MFA step-up is redirected by the pages; do not list its holdings meanwhile.
    if (!mockUserId && (await needsMfaStepUp(supabase))) return [];

    const [{ data: own }, shared] = await Promise.all([
      supabase
        .from("assets")
        .select(COLUMNS)
        .eq("profile_id", user.id)
        .eq("status", "active")
        .order("name")
        .limit(MAX_COMMAND_HOLDINGS)
        .returns<Row[]>(),
      loadCoOwnedAssets<Row>(supabase, user.id, COLUMNS, new Set()),
    ]);
    const ownRows = own ?? [];
    const ownIds = new Set(ownRows.map((a) => a.id));
    const rows = [...ownRows, ...shared.filter((a) => !ownIds.has(a.id))];
    const factors = await loadOwnershipFactors(supabase, user.id, rows);

    return capHoldings(
      rows
        .filter((a) => (factors.get(a.id) ?? 1) > 0)
        .map((a) => ({
          id: a.id,
          name: a.name,
          ticker_symbol: a.ticker_symbol,
          category: a.asset_categories?.name ?? null,
          is_liability: a.is_liability,
        })),
    );
  } catch {
    return [];
  }
}
