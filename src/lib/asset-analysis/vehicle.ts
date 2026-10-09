import { depreciatedValue, yearsBetween as depYears } from "@/lib/vehicle-depreciation";
import {
  buildVehicleComparisonSeries,
  effectiveDepreciation,
  sumVehicleExpenses,
  vehicleExpensesByCategory,
  type VehicleComparisonRow,
  type VehicleMetadata,
} from "@/lib/vehicles";
import { isNum, monthsBetween } from "./common";

export type VehicleAnalysisInput = {
  metadata: VehicleMetadata;
  /** Value today in the asset currency (the latest market value). */
  currentValue: number;
  purchaseDate: string | null | undefined;
  today: string;
  /** Market valuations (asset_history) in the asset currency. */
  market: { recorded_date: string; value: number }[];
  /** Blue Book valuations converted to the asset currency. */
  guide: { date: string; value: number }[];
};

export type VehicleAnalysis = {
  purchasePrice: number | null;
  currentValue: number;
  latestBlueBook: number | null;
  /** Current value / purchase price, fraction. */
  residualPct: number | null;
  /** Purchase price minus current value (positive = value lost). */
  valueLost: number | null;
  ownershipMonths: number | null;
  valueLostPerMonth: number | null;
  /** Running costs: the dated expense ledger plus the lump-sum cost fields. */
  runningCosts: number;
  /** The dated expense ledger alone. */
  ledgerCosts: number;
  costsByCategory: { category: string; total: number; count: number }[];
  /** Value lost + running costs. */
  totalCostOfOwnership: number | null;
  tcoPerMonth: number | null;
  /** Total cost of ownership per kilometre on the odometer (mileage is the car's total, not only the owner's). */
  tcoPerKm: number | null;
  /** Share of the cost of ownership that is depreciation (fraction), null when nothing was lost. */
  depreciationShare: number | null;
  /** Market value minus the latest Blue Book (positive = market above the guide). */
  marketVsBlueBook: number | null;
};

/** Depreciation, residual value and cost of ownership of a vehicle. Pure; informational only. */
export function vehicleAnalysis(input: VehicleAnalysisInput): VehicleAnalysis {
  const { metadata, currentValue, purchaseDate, today } = input;
  const price = isNum(metadata.purchase_price) && metadata.purchase_price > 0 ? metadata.purchase_price : null;
  const months = purchaseDate && purchaseDate <= today ? monthsBetween(purchaseDate, today) : null;
  const valueLost = price != null ? price - currentValue : null;
  const ledgerCosts = sumVehicleExpenses(metadata.expenses);
  const runningCosts = ledgerCosts + (metadata.maintenance_costs ?? 0) + (metadata.modifications ?? 0) + (metadata.insurance_registration ?? 0);
  const tco = valueLost != null ? valueLost + runningCosts : null;
  const guide = [...input.guide].sort((a, b) => a.date.localeCompare(b.date));
  const latestBlueBook = guide.length > 0 ? guide[guide.length - 1].value : null;
  const categories = vehicleExpensesByCategory(metadata.expenses);
  return {
    purchasePrice: price,
    currentValue,
    latestBlueBook,
    residualPct: price != null ? currentValue / price : null,
    valueLost,
    ownershipMonths: months,
    valueLostPerMonth: valueLost != null && months != null && months >= 1 ? valueLost / months : null,
    runningCosts,
    ledgerCosts,
    costsByCategory: categories,
    totalCostOfOwnership: tco,
    tcoPerMonth: tco != null && months != null && months >= 1 ? tco / months : null,
    tcoPerKm: tco != null && isNum(metadata.mileage) && metadata.mileage > 0 ? tco / metadata.mileage : null,
    depreciationShare: tco != null && valueLost != null && valueLost > 0 && tco > 0 ? valueLost / tco : null,
    marketVsBlueBook: latestBlueBook != null ? currentValue - latestBlueBook : null,
  };
}

export type VehicleCurveRow = VehicleComparisonRow & {
  /** Modelled value from the depreciation rates in force (monthly points from the purchase date to today); null elsewhere. */
  model: number | null;
};

/**
 * The curves of the Analysis chart: market value, purchase price, Blue Book (step, carried forward) and the
 * MODELLED depreciation curve from the rates in force (`effectiveDepreciation`). `model` needs a purchase
 * price and date; at most ~48 monthly points are generated.
 */
export function vehicleCurveRows(input: VehicleAnalysisInput): VehicleCurveRow[] {
  const base = buildVehicleComparisonSeries({
    market: input.market,
    purchaseDate: input.purchaseDate,
    purchasePrice: input.metadata.purchase_price,
    guide: input.guide,
    today: input.today,
  });
  const rows = new Map<string, VehicleCurveRow>(base.map((r) => [r.date, { ...r, model: null }]));
  const price = input.metadata.purchase_price;
  const from = input.purchaseDate;
  if (isNum(price) && price > 0 && from && from <= input.today) {
    const rates = effectiveDepreciation(input.metadata, from);
    const totalMonths = Math.max(1, Math.round(monthsBetween(from, input.today)));
    const step = Math.max(1, Math.ceil(totalMonths / 48));
    const dates = new Set<string>([from, input.today]);
    const start = new Date(`${from}T00:00:00Z`);
    for (let m = step; m < totalMonths; m += step) {
      const d = new Date(start);
      d.setUTCMonth(d.getUTCMonth() + m);
      dates.add(d.toISOString().slice(0, 10));
    }
    for (const date of dates) {
      const row = rows.get(date) ?? { date, value: null, purchase: null, blueBook: null, blueBookStep: null, model: null };
      row.model = depreciatedValue(price, rates, depYears(from, date), input.metadata.second_hand);
      rows.set(date, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}
