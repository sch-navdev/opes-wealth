/**
 * Metadata shape for the "Vehicles" asset category, stored in `assets.metadata`
 * (same jsonb-per-category pattern as `RealEstateMetadata` in `real-estate.ts`
 * — no dedicated `vehicles` table). Consumed by `vehicle-fields.tsx` (add/edit
 * form) and the Specifications tab of `asset-detail-view.tsx` (read-only display).
 */
import {
  ageAtPurchase,
  depreciatedValue,
  suggestDepreciation,
  yearsBetween,
  type DepreciationGroup,
  type DepreciationRates,
} from "@/lib/vehicle-depreciation";

/** Expense categories offered in the log. A stored value outside this list (e.g. from a future version) is shown as-is. */
export const VEHICLE_EXPENSE_CATEGORIES = [
  "maintenance",
  "fuel",
  "insurance",
  "registration",
  "tires",
  "parking",
  "modifications",
  "other",
] as const;

export type VehicleExpenseCategory = (typeof VEHICLE_EXPENSE_CATEGORIES)[number];

export function isVehicleExpenseCategory(value: unknown): value is VehicleExpenseCategory {
  return typeof value === "string" && (VEHICLE_EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * One dated running cost of the vehicle (service, fuel, insurance renewal…),
 * in the asset's own currency. Kept as a ledger in `metadata.expenses` — the
 * same idea as a property's `property_expenses` — so costs accumulate over
 * time instead of overwriting a single lump figure.
 */
export type VehicleExpense = {
  id: string;
  date: string;
  category: VehicleExpenseCategory;
  /** Optional free-text detail ("Annual service at the dealer"). */
  description: string;
  amount: number;
};

export function nextVehicleExpenseId(): string {
  return `vexp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sumVehicleExpenses(expenses: VehicleExpense[]): number {
  return expenses.reduce((sum, e) => sum + e.amount, 0);
}

/** Totals per category, largest first (categories with no spend are left out). */
export function vehicleExpensesByCategory(
  expenses: VehicleExpense[],
): { category: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const e of expenses) {
    const entry = map.get(e.category) ?? { total: 0, count: 0 };
    entry.total += e.amount;
    entry.count += 1;
    map.set(e.category, entry);
  }
  return [...map.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.total - a.total);
}

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
  /** Bought used? A used car skips the showroom drop (see `vehicle-depreciation.ts`). */
  second_hand: boolean;
  /** Annual value change in percent, signed: negative = depreciation, positive = appreciation. Ignored for the first year of a second-hand car. */
  depreciation_first_year: number | null;
  depreciation_annual: number | null;
  /** The user typed the rates; otherwise they follow the brand-based suggestion. */
  depreciation_manual: boolean;
  /** Official price-guide valuation (Blue Book / Argus / Parkers…), kept apart from the market value. */
  blue_book_value: number | null;
  /** Which guide issued it, as the user or the PDF named it. */
  blue_book_source: string;
  blue_book_date: string;
  /** File name of the uploaded valuation PDF (the file itself is not stored). */
  blue_book_document: string;
  /** Dated expense ledger (see `VehicleExpense`); counts toward Total Cost of Ownership on top of the lump-sum cost fields above. */
  expenses: VehicleExpense[];
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
  second_hand: false,
  depreciation_first_year: null,
  depreciation_annual: null,
  depreciation_manual: false,
  blue_book_value: null,
  blue_book_source: "",
  blue_book_date: "",
  blue_book_document: "",
  expenses: [],
};

/**
 * Merges a raw `assets.metadata` value into a complete `VehicleMetadata`,
 * same defensive pattern as `parseRealEstateMetadata`.
 */
export function parseVehicleMetadata(raw: unknown): VehicleMetadata {
  if (!raw || typeof raw !== "object") {
    return EMPTY_VEHICLE_METADATA;
  }

  const r = raw as Partial<VehicleMetadata>;
  return {
    ...EMPTY_VEHICLE_METADATA,
    ...r,
    expenses: Array.isArray(r.expenses) ? r.expenses : [],
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
    (metadata.insurance_registration ?? 0) +
    sumVehicleExpenses(metadata.expenses)
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

/**
 * Valuation history as it should be PLOTTED: starting strictly on the
 * purchase date, running to `today`.
 *
 * Why this exists: a vehicle's chart used to plot every `asset_history` row it
 * had, so a vehicle whose only rows were recent (a valuation refresh, or an
 * edit — `updateAsset` re-stamps today's snapshot) started "today" instead of
 * on the day it was bought, and rows dated before the purchase (a stale
 * purchase date edited later) leaked in too. Now:
 *
 * - rows before `purchaseDate` are dropped;
 * - a point is guaranteed ON `purchaseDate`: the purchase price when one was
 *   entered (it overrides a stored row on that day), otherwise the earliest
 *   kept valuation (or, failing that, the last one before the purchase) so
 *   the line starts flat at the first known value instead of being invented;
 * - the line is carried flat to `today` so it spans the whole ownership period.
 *
 * `make` builds a synthetic row of the caller's own row type. With no
 * `purchaseDate` (or a future one) the input is returned untouched.
 */
export function buildVehicleHistoryFromPurchase<
  T extends { recorded_date: string; value: number },
>(
  sortedHistory: T[],
  purchaseDate: string | null | undefined,
  purchasePrice: number | null | undefined,
  today: string,
  make: (date: string, value: number) => T,
): T[] {
  if (!purchaseDate || purchaseDate > today) return sortedHistory;

  const kept = sortedHistory.filter((h) => h.recorded_date >= purchaseDate);
  const before = sortedHistory.filter((h) => h.recorded_date < purchaseDate);
  const hasPrice = purchasePrice != null && purchasePrice > 0;
  const anchorValue = hasPrice
    ? purchasePrice
    : (kept[0]?.value ?? before[before.length - 1]?.value ?? null);
  if (anchorValue == null) return sortedHistory;

  const result = kept.some((h) => h.recorded_date === purchaseDate)
    ? hasPrice
      ? kept.map((h) =>
          h.recorded_date === purchaseDate ? { ...h, value: anchorValue } : h,
        )
      : kept
    : [make(purchaseDate, anchorValue), ...kept];

  const last = result[result.length - 1];
  if (last.recorded_date < today) result.push(make(today, last.value));
  return result;
}

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

/**
 * The depreciation rates in force for this vehicle: the user's own when they typed
 * them (`depreciation_manual`), otherwise the brand-based suggestion for new vs
 * second-hand (see `vehicle-depreciation.ts`).
 */
export function effectiveDepreciation(
  metadata: VehicleMetadata,
  purchaseDate: string | null | undefined,
): DepreciationRates & { group: DepreciationGroup } {
  const suggested = suggestDepreciation({
    make: metadata.make,
    model: metadata.model,
    secondHand: metadata.second_hand,
    ageAtPurchase: ageAtPurchase(metadata.year, purchaseDate),
  });
  if (metadata.depreciation_manual && metadata.depreciation_first_year != null && metadata.depreciation_annual != null) {
    return { group: suggested.group, first: metadata.depreciation_first_year, annual: metadata.depreciation_annual };
  }
  return suggested;
}

/** Writes the rates in force into the metadata, so a saved vehicle keeps the figures it was valued with. */
export function withEffectiveDepreciation(metadata: VehicleMetadata, purchaseDate: string | null | undefined): VehicleMetadata {
  const { first, annual } = effectiveDepreciation(metadata, purchaseDate);
  return { ...metadata, depreciation_first_year: first, depreciation_annual: annual };
}

/** Estimated value today from the purchase price and the rates in force; null without a price or purchase date. */
export function estimateDepreciatedValue(
  metadata: VehicleMetadata,
  purchaseDate: string | null | undefined,
  today: string = new Date().toISOString().slice(0, 10),
): number | null {
  if (!metadata.purchase_price || metadata.purchase_price <= 0 || !purchaseDate) return null;
  return depreciatedValue(
    metadata.purchase_price,
    effectiveDepreciation(metadata, purchaseDate),
    yearsBetween(purchaseDate, today),
    metadata.second_hand,
  );
}
