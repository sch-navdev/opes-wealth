import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { IrrCompare } from "@/components/irr-compare";
import { getComparableHoldings } from "./actions";

/**
 * Compare returns (IRR / TRI): two savings plans or holdings side by side on the effective annual
 * rate. Same dev-only mock-auth bypass as the other dashboard pages (hard-gated on NODE_ENV).
 * The holdings and their cash flows are built on the server (`./actions.ts`, which also returns the
 * viewer's base currency); the maths and the comparison run in the browser so every keystroke
 * recomputes instantly.
 */
export default async function ComparePage() {
  if (!isMockAuthEnabled() || !getMockUserId()) {
    const supabase = await createClient();
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) redirect("/login");
    if (await needsMfaStepUp(supabase)) redirect("/login/mfa");
  }

  const result = await getComparableHoldings();
  // The picker degrades to "no investments" if the holdings could not be loaded; manual mode still works.
  return (
    <IrrCompare
      holdings={result.ok ? result.holdings : []}
      baseCurrency={result.ok ? result.baseCurrency : "USD"}
      loadFailed={!result.ok}
    />
  );
}
