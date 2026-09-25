/**
 * Metadata shape for the "Private Equity" asset category, stored in
 * `assets.metadata` (same jsonb-per-category pattern as `RealEstateMetadata`
 * in `real-estate.ts` — no dedicated `private_equity` table). Consumed by
 * `private-equity-fields.tsx` (add/edit form) and the Settings tab of
 * `asset-detail-view.tsx` (read-only display).
 */
export type PrivateEquityMetadata = {
  share_class: string;
  ownership_percentage: number | null;
  entity_name: string;
};

export const EMPTY_PRIVATE_EQUITY_METADATA: PrivateEquityMetadata = {
  share_class: "",
  ownership_percentage: null,
  entity_name: "",
};

/**
 * Merges a raw `assets.metadata` value into a complete
 * `PrivateEquityMetadata`, same defensive pattern as `parseRealEstateMetadata`.
 */
export function parsePrivateEquityMetadata(raw: unknown): PrivateEquityMetadata {
  if (!raw || typeof raw !== "object") {
    return EMPTY_PRIVATE_EQUITY_METADATA;
  }

  return {
    ...EMPTY_PRIVATE_EQUITY_METADATA,
    ...(raw as Partial<PrivateEquityMetadata>),
  };
}

/**
 * Returns every unmet requirement for a `PrivateEquityMetadata` payload
 * before it's serialized into `assets.metadata` — same "collect every error"
 * pattern as `getVehicleMetadataErrors`/`getPasswordRequirementErrors`.
 */
export function getPrivateEquityMetadataErrors(
  metadata: PrivateEquityMetadata,
): string[] {
  const errors: string[] = [];

  if (!metadata.entity_name.trim()) errors.push("entity_name_required");
  if (!metadata.share_class.trim()) errors.push("share_class_required");

  if (
    metadata.ownership_percentage === null ||
    Number.isNaN(metadata.ownership_percentage)
  ) {
    errors.push("ownership_percentage_required");
  } else if (
    metadata.ownership_percentage < 0 ||
    metadata.ownership_percentage > 100
  ) {
    errors.push("ownership_percentage_range");
  }

  return errors;
}
