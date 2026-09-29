/**
 * Metadata shape for the "Vehicles" asset category, stored in `assets.metadata`
 * (same jsonb-per-category pattern as `RealEstateMetadata` in `real-estate.ts`
 * — no dedicated `vehicles` table). Consumed by `vehicle-fields.tsx` (add/edit
 * form) and the Specifications tab of `asset-detail-view.tsx` (read-only display).
 */
export type VehicleMetadata = {
  vin: string;
  make: string;
  model: string;
  year: string;
  license_plate: string;
  purchase_price: number | null;
  mileage: number | null;
  maintenance_costs: number | null;
  modifications: number | null;
  insurance_registration: number | null;
  /** Last valuation fetched from the French vehicle valuation client (`lib/services/vehicle-valuation-client.ts`) — kept separate from `assets.current_value` only for parity with the Real Estate pattern; there's no off-plan-style liability to net out here, so the two are always set together. */
  market_valuation: number | null;
  last_valuation_source: string;
  last_valuation_date: string;
};

export const EMPTY_VEHICLE_METADATA: VehicleMetadata = {
  vin: "",
  make: "",
  model: "",
  year: "",
  license_plate: "",
  purchase_price: null,
  mileage: null,
  maintenance_costs: null,
  modifications: null,
  insurance_registration: null,
  market_valuation: null,
  last_valuation_source: "",
  last_valuation_date: "",
};

/**
 * Merges a raw `assets.metadata` value into a complete `VehicleMetadata`,
 * same defensive pattern as `parseRealEstateMetadata`.
 */
export function parseVehicleMetadata(raw: unknown): VehicleMetadata {
  if (!raw || typeof raw !== "object") {
    return EMPTY_VEHICLE_METADATA;
  }

  return {
    ...EMPTY_VEHICLE_METADATA,
    ...(raw as Partial<VehicleMetadata>),
  };
}

/**
 * Returns every unmet requirement for a `VehicleMetadata` payload before it's
 * serialized into `assets.metadata` — same "collect every error, not just the
 * first" pattern as `getPasswordRequirementErrors` in `auth-validation.ts`.
 * A blank Year is treated as a plain required-field error; the value itself
 * isn't otherwise range-checked since it's a free-text field (some vehicles
 * are titled by model-year ranges, not a single number).
 */
export function getVehicleMetadataErrors(
  metadata: VehicleMetadata,
): string[] {
  const errors: string[] = [];

  if (!metadata.make.trim()) errors.push("vehicle_make_required");
  if (!metadata.model.trim()) errors.push("vehicle_model_required");
  if (!metadata.year.trim()) errors.push("vehicle_year_required");
  if (!metadata.vin.trim()) errors.push("vehicle_vin_required");

  return errors;
}

/**
 * Sum of every ownership cost beyond the purchase price itself — maintenance,
 * modifications, and insurance/registration — mirroring `sumAcquisitionFees`
 * in `real-estate.ts` for the same "all-in cost basis" purpose.
 */
export function sumVehicleOwnershipCosts(metadata: VehicleMetadata): number {
  return (
    (metadata.maintenance_costs ?? 0) +
    (metadata.modifications ?? 0) +
    (metadata.insurance_registration ?? 0)
  );
}

/**
 * Total Cost of Ownership: purchase price (falling back to the asset's
 * current value when no purchase price was entered) plus every ownership
 * cost since — the vehicle equivalent of `calculateTotalCost` for Real Estate.
 */
export function calculateVehicleTotalCost(
  metadata: VehicleMetadata,
  fallbackValue: number,
): number {
  return (metadata.purchase_price ?? fallbackValue) + sumVehicleOwnershipCosts(metadata);
}

/** Depreciation vs. purchase price: positive means the vehicle has lost value. `null` when no purchase price was entered (nothing to compare against). */
export function calculateVehicleDepreciation(
  currentValue: number,
  purchasePrice: number | null,
): { amount: number; percent: number | null } | null {
  if (purchasePrice == null) return null;
  const amount = purchasePrice - currentValue;
  const percent = purchasePrice !== 0 ? (amount / purchasePrice) * 100 : null;
  return { amount, percent };
}
