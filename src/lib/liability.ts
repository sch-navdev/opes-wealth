/**
 * Metadata for standalone liabilities (loans, mortgages not tied to a tracked
 * property, credit cards), stored in `assets.metadata` of rows with
 * `is_liability = true` in the "Liabilities" category — same jsonb pattern as
 * the other categories. `assets.current_value` holds the balance OWED as a
 * positive number (that is what `assetLiability` in `lib/liabilities.ts`
 * returns); the UI shows it negative and Net Worth subtracts it.
 *
 * A mortgage on a property you track belongs in that property's own Loan
 * section instead: it amortizes automatically and reduces that property's
 * equity, so adding it here as well would count the debt twice.
 */
export type LiabilityType = "loan" | "mortgage" | "credit_card" | "other";

export const LIABILITY_TYPES: LiabilityType[] = ["loan", "mortgage", "credit_card", "other"];

export type LiabilityMetadata = {
  liability_type: LiabilityType;
  lender_name: string;
  /** Annual percentage rate, e.g. 4.5. */
  interest_rate: number | null;
  monthly_payment: number | null;
  /** Credit cards only. */
  credit_limit: number | null;
};

export const EMPTY_LIABILITY_METADATA: LiabilityMetadata = {
  liability_type: "loan",
  lender_name: "",
  interest_rate: null,
  monthly_payment: null,
  credit_limit: null,
};

export function parseLiabilityMetadata(raw: unknown): LiabilityMetadata {
  if (!raw || typeof raw !== "object") return EMPTY_LIABILITY_METADATA;
  return { ...EMPTY_LIABILITY_METADATA, ...(raw as Partial<LiabilityMetadata>) };
}

/** Unmet requirements as translation keys (same pattern as `getVehicleMetadataErrors`). */
export function getLiabilityErrors(
  name: string,
  balance: number,
  metadata: LiabilityMetadata,
): string[] {
  const errors: string[] = [];
  if (!name.trim()) errors.push("liability_name_required");
  if (!Number.isFinite(balance) || balance < 0) errors.push("liability_balance_invalid");
  if (metadata.interest_rate != null && (metadata.interest_rate < 0 || metadata.interest_rate > 100)) {
    errors.push("liability_rate_invalid");
  }
  return errors;
}
