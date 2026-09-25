/**
 * Metadata shape for the "Vehicles" asset category, stored in `assets.metadata`
 * (same jsonb-per-category pattern as `RealEstateMetadata` in `real-estate.ts`
 * — no dedicated `vehicles` table). Consumed by `vehicle-fields.tsx` (add/edit
 * form) and the Settings tab of `asset-detail-view.tsx` (read-only display).
 */
export type VehicleMetadata = {
  vin: string;
  make: string;
  model: string;
  year: string;
};

export const EMPTY_VEHICLE_METADATA: VehicleMetadata = {
  vin: "",
  make: "",
  model: "",
  year: "",
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
