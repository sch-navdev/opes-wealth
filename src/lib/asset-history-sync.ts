import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRealEstateMetadata, sumAcquisitionFees } from "@/lib/real-estate";
import { estimateOffplanValueAt } from "@/lib/real-estate-analytics";
import { parsePrivateEquityMetadata, pendingCapitalCallsTotal } from "@/lib/private-equity";
import type { Json } from "@/types/supabase";

/**
 * Auto-generates the `asset_history` timeline for an asset whenever it's
 * created or updated: a starting point on the earliest payment milestone's
 * due date (for off-plan Real Estate, the down payment milestone), one
 * point per "paid" milestone with the cumulative paid-to-date amount up to
 * that date, and one "current snapshot" point. That snapshot uses
 * `explicitDate` when given — `addAsset` passes the user's Purchase Date so
 * a freshly created asset's curve starts there instead of at row-creation
 * time — and otherwise falls back to today, which is what `updateAsset`
 * relies on (editing an asset always re-stamps today's snapshot; it never
 * moves the original purchase point). Since there's no recorded historical
 * market valuation at each past milestone date, those historical points use
 * cumulative cash invested (paid milestones + fees) for both `value` and
 * `net_equity` — a deliberate simplification flagged in the tracker notes,
 * not a claim that net equity equals cash invested in general. Upserts on
 * (asset_id, recorded_date) so re-saving the form regenerates the same
 * points instead of duplicating them.
 */
export async function syncAssetHistory(
  supabase: SupabaseClient,
  assetId: string,
  currentValue: number,
  categoryName: string | null | undefined,
  metadata: Json,
  explicitDate?: string,
) {
  const snapshotDate = explicitDate || new Date().toISOString().slice(0, 10);
  const points = new Map<
    string,
    { asset_id: string; recorded_date: string; value: number; net_equity: number; source: "manual" }
  >();

  function addPoint(date: string, value: number, netEquity: number) {
    if (!date) return;
    points.set(date, {
      asset_id: assetId,
      recorded_date: date,
      value,
      net_equity: netEquity,
      source: "manual",
    });
  }

  const isRealEstate = categoryName === "Real Estate";

  if (isRealEstate) {
    const re = parseRealEstateMetadata(metadata);
    const totalFees = sumAcquisitionFees(re);

    const sortedMilestones = re.payment_schedule
      .filter((m) => m.due_date)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));

    const marketValuation = re.market_valuation ?? currentValue;

    if (sortedMilestones.length > 0 && re.is_offplan) {
      // Off-plan: the log must reflect the unit's estimated MARKET value on
      // each milestone date (contract price drifting toward today's
      // valuation), not the installments paid. Equity is that value minus
      // what is still owed to the developer at that point.
      const contractPrice = re.contract_price ?? re.purchasePrice ?? marketValuation;
      const startDate = sortedMilestones[0].due_date;
      const valueAt = (date: string) =>
        estimateOffplanValueAt({
          contractPrice,
          startDate,
          currentMarketValue: marketValuation,
          snapshotDate,
          date,
        });

      let cumulativePaid = sortedMilestones[0].status === "paid" ? 0 : sortedMilestones[0].amount;
      for (const milestone of sortedMilestones) {
        if (milestone.status === "paid") cumulativePaid += milestone.amount;
        if (milestone.status === "paid" || milestone === sortedMilestones[0]) {
          const value = valueAt(milestone.due_date);
          addPoint(milestone.due_date, value, value - Math.max(0, contractPrice - cumulativePaid));
        }
      }
    } else if (sortedMilestones.length > 0) {
      const first = sortedMilestones[0];
      addPoint(first.due_date, first.amount + totalFees, first.amount + totalFees);

      let cumulativePaid = 0;
      for (const milestone of sortedMilestones) {
        if (milestone.status === "paid") {
          cumulativePaid += milestone.amount;
          const cumulativeWithFees = cumulativePaid + totalFees;
          addPoint(milestone.due_date, cumulativeWithFees, cumulativeWithFees);
        }
      }
    }

    addPoint(snapshotDate, marketValuation, currentValue);
  } else if (categoryName === "Private Equity") {
    // NAV is the gross value; capital calls still pending are a forward
    // liability, so Net Worth (which sums `net_equity`) sees NAV minus them.
    const owed = pendingCapitalCallsTotal(parsePrivateEquityMetadata(metadata));
    addPoint(snapshotDate, currentValue, currentValue - owed);
  } else {
    addPoint(snapshotDate, currentValue, currentValue);
  }

  const rows = Array.from(points.values());
  if (rows.length === 0) return;

  await supabase
    .from("asset_history")
    .upsert(rows, { onConflict: "asset_id,recorded_date" });
}
