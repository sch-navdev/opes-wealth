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
 * Total Cost of Ownership: the cost baseline (see `resolveVehicleValuation`:
 * the purchase price, else the earliest valuation) plus every ownership cost
 * since — the vehicle equivalent of `calculateTotalCost` for Real Estate.
 * `baseCost` falls back to whatever the caller passes (typically the current
 * value) when there is no baseline at all.
 */
export function calculateVehicleTotalCost(
  metadata: VehicleMetadata,
  baseCost: number,
): number {
  return baseCost + sumVehicleOwnershipCosts(metadata);
}

export type VehicleValuePoint = { recorded_date: string; value: number };

export type VehicleValuation = {
  /** The cost baseline: the purchase price if one was entered, else the EARLIEST valuation entry; `null` if there's nothing to compare against. */
  baselineCost: number | null;
  baselineSource: "purchase_price" | "first_valuation" | null;
  /** Date of the earliest valuation entry when it is the baseline. */
  baselineDate: string | null;
  /** The LATEST valuation entry (or `fallbackValue` when the log is empty). */
  currentMarketValue: number;
  /** Signed change from baseline to current: **positive = appreciation, negative = depreciation**. `null` when there's no baseline. */
  change: { amount: number; percent: number | null } | null;
};

/**
 * Resolves a vehicle's cost baseline and current market value from its
 * valuation log. The old calculation confused the two: with no purchase price
 * it fell back to the CURRENT value as the "cost" (so a 90,000 → 75,000 slide
 * showed no loss at all), and it reported depreciation with an inverted sign
 * (value gain shown as a negative number). Now:
 *
 * - baseline cost = `purchase_price` if set, otherwise the earliest entry in
 *   the valuation log (needs at least two entries — with a single one there is
 *   nothing to compare to, so no change is reported);
 * - current market value = the latest log entry;
 * - change = current − baseline, so a vehicle worth more than it cost is a
 *   positive number and one that lost value is negative.
 */
export function resolveVehicleValuation(
  metadata: VehicleMetadata,
  history: VehicleValuePoint[],
  fallbackValue: number,
): VehicleValuation {
  const sorted = [...history].sort((a, b) => a.recorded_date.localeCompare(b.recorded_date));
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  const currentMarketValue = latest?.value ?? fallbackValue;

  let baselineCost: number | null = null;
  let baselineSource: VehicleValuation["baselineSource"] = null;
  let baselineDate: string | null = null;
  if (metadata.purchase_price != null && metadata.purchase_price > 0) {
    baselineCost = metadata.purchase_price;
    baselineSource = "purchase_price";
  } else if (sorted.length >= 2 && first.value > 0) {
    baselineCost = first.value;
    baselineSource = "first_valuation";
    baselineDate = first.recorded_date;
  }

  const change =
    baselineCost != null
      ? (() => {
          const amount = currentMarketValue - baselineCost;
          return { amount, percent: (amount / baselineCost) * 100 };
        })()
      : null;

  return { baselineCost, baselineSource, baselineDate, currentMarketValue, change };
}
