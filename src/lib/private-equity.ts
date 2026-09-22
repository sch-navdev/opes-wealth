/**
 * Metadata shape for the "Private Equity" asset category, stored in
 * `assets.metadata` (same jsonb-per-category pattern as `RealEstateMetadata`
 * in `real-estate.ts` — no dedicated `private_equity` table). No UI consumes
 * this yet; it exists so a future Private Equity form/detail view has a
 * typed shape to build against.
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
