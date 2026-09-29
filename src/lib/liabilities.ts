import { canAmortize, getOutstandingPrincipalAt } from "@/lib/amortization";
import { parseRealEstateMetadata, resolveOutstandingLoanBalance } from "@/lib/real-estate";

export type AssetForLiabilities = {
  current_value: number;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  asset_categories: { name: string } | null;
};

/**
 * The dashboard's "Total Assets"/"Total Liabilities" split, done properly for
 * Real Estate: `assets.current_value` for a Real Estate asset is already its
 * Equity (market value minus its linked loan's outstanding balance — see
 * `updateAssetValuation` in `dashboard/actions.ts`), so simply summing
 * `current_value` for "Total Assets" silently nets the mortgage debt out of
 * both totals, leaving "Total Liabilities" blind to it entirely (the bug this
 * fixes). Splitting it back into `grossAssetValue` (the property's actual
 * market value) and `assetLiability` (its outstanding loan) keeps Net Worth
 * (`grossAssetValue - assetLiability`) numerically identical to before —
 * these two are a decomposition of the same figure, not a new one — while
 * making the debt itself visible in "Total Liabilities".
 */
export function grossAssetValue(asset: AssetForLiabilities): number {
  if (asset.asset_categories?.name === "Real Estate") {
    const metadata = parseRealEstateMetadata(asset.metadata);
    return metadata.market_valuation ?? asset.current_value;
  }
  return asset.current_value;
}

/**
 * The debt this asset contributes to "Total Liabilities": a standalone
 * liability-flagged asset's own value, or — for Real Estate — its linked
 * loan's outstanding principal (via the amortization engine when the loan
 * has enough data to run it, `lib/amortization.ts`) plus any off-plan
 * outstanding balance, mirroring exactly what `updateAssetValuation` already
 * subtracts to produce that asset's `current_value`/Equity.
 */
export function assetLiability(asset: AssetForLiabilities): number {
  if (asset.is_liability) return asset.current_value;

  if (asset.asset_categories?.name === "Real Estate") {
    const metadata = parseRealEstateMetadata(asset.metadata);
    const loan = metadata.linked_loan;
    const today = new Date().toISOString().slice(0, 10);
    const loanBalance = canAmortize(loan)
      ? getOutstandingPrincipalAt(loan, today)
      : resolveOutstandingLoanBalance(loan);
    const offplanBalance = metadata.is_offplan ? metadata.outstanding_balance : 0;
    return loanBalance + offplanBalance;
  }

  return 0;
}
