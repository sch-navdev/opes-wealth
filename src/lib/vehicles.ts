/**
 * Metadata shape for the "Vehicles" asset category, stored in `assets.metadata`
 * (same jsonb-per-category pattern as `RealEstateMetadata` in `real-estate.ts`
 * — no dedicated `vehicles` table). No UI consumes this yet; it exists so a
 * future Vehicles form/detail view has a typed shape to build against.
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
