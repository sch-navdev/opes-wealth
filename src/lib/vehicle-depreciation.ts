/**
 * Vehicle depreciation model (pure — no I/O). A signed annual change in percent:
 * NEGATIVE = the car loses value (depreciation), POSITIVE = it gains value
 * (appreciation, e.g. a collectible). Same sign convention as
 * `resolveVehicleValuation` in `vehicles.ts`.
 *
 * Two rates: the FIRST year (the showroom drop) and every later year. A
 * second-hand car has already taken the first-year drop with its previous
 * owner, so its first year uses the later-year rate, and a car that was already
 * 5+ years old when bought depreciates more slowly still.
 *
 * Defaults come from published UAE and US guides (Oct 2026 check): new cars
 * lose 20-30% in year one (9-11% the moment they leave the showroom) and 10-20%
 * a year after that, slowing to 5-10% from about year four; Japanese brands hold
 * value best, European luxury and EVs worst. They are starting points, not
 * forecasts: every rate can be overridden by hand.
 */

export type DepreciationGroup =
  | "japanese"
  | "luxury_suv"
  | "european_luxury"
  | "sports"
  | "electric"
  | "general";

export type DepreciationRates = { first: number; annual: number };

/** Mid-points of the published ranges. `sports` is an assumption (not in the sources): such cars hold value better than mainstream luxury. */
export const DEPRECIATION_DEFAULTS: Record<DepreciationGroup, DepreciationRates> = {
  japanese: { first: -17.5, annual: -9 }, // 15-20% / 8-10%
  luxury_suv: { first: -12.5, annual: -6.5 }, // 10-15% / 5-8%
  european_luxury: { first: -30, annual: -17.5 }, // 25-35% / 15-20%
  sports: { first: -15, annual: -7 },
  electric: { first: -35, annual: -17.5 }, // 30-40% / 15-20%
  general: { first: -25, annual: -12.5 }, // 20-30% / 10-15%
};

const norm = (s: string) => s.trim().toLowerCase();

const EV_MAKES = ["tesla", "byd", "rivian", "lucid", "polestar", "nio", "xpeng", "zeekr"];
const EV_MODEL = /\b(ev\d?|electric|e-?tron|ioniq|taycan|eq[a-z]|id\.?\s?\d|i[3-8]|ix\d?)\b/i;
const LUXURY_SUV_MODEL = /(patrol|land\s?cruiser|prado|\blx\s?\d*)/i;
const JAPANESE = ["toyota", "nissan", "honda", "mazda", "lexus", "mitsubishi", "suzuki", "subaru", "infiniti"];
const EUROPEAN_LUXURY = ["bmw", "mercedes", "mercedes-benz", "audi", "land rover", "range rover", "jaguar", "bentley", "maserati", "rolls-royce"];
const SPORTS = ["porsche", "ferrari", "lamborghini", "mclaren", "aston martin", "lotus", "bugatti"];

export function depreciationGroup(make: string, model: string): DepreciationGroup {
  const mk = norm(make);
  if (EV_MAKES.includes(mk) || EV_MODEL.test(model)) return "electric";
  if (LUXURY_SUV_MODEL.test(model)) return "luxury_suv";
  if (SPORTS.includes(mk)) return "sports";
  if (EUROPEAN_LUXURY.includes(mk)) return "european_luxury";
  if (JAPANESE.includes(mk)) return "japanese";
  return "general";
}

/** Suggested rates for a car. `ageAtPurchase` = purchase year minus model year (when both are known). */
export function suggestDepreciation(opts: {
  make: string;
  model: string;
  secondHand: boolean;
  ageAtPurchase: number | null;
}): DepreciationRates & { group: DepreciationGroup } {
  const group = depreciationGroup(opts.make, opts.model);
  const base = DEPRECIATION_DEFAULTS[group];
  if (!opts.secondHand) return { group, ...base };
  const eased = opts.ageAtPurchase != null && opts.ageAtPurchase >= 5 ? Math.round(base.annual * 0.75 * 10) / 10 : base.annual;
  return { group, first: eased, annual: eased };
}

/** Purchase year minus model year, when both parse as plausible years. */
export function ageAtPurchase(modelYear: string, purchaseDate: string | null | undefined): number | null {
  const y = Number.parseInt(modelYear, 10);
  const p = purchaseDate ? Number.parseInt(purchaseDate.slice(0, 4), 10) : NaN;
  if (!Number.isFinite(y) || !Number.isFinite(p) || y < 1900 || y > 2100) return null;
  return Math.max(0, p - y);
}

/** Fractional years from `fromIso` to `toIso` (never negative). */
export function yearsBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  return Number.isFinite(ms) && ms > 0 ? ms / (365.25 * 24 * 3_600_000) : 0;
}

/**
 * Value after `years` of ownership, compounding: the first-year rate over year one
 * (pro rata inside it), the annual rate for every year after. A second-hand car
 * uses the annual rate throughout. Never below zero.
 */
export function depreciatedValue(
  price: number,
  rates: DepreciationRates,
  years: number,
  secondHand: boolean,
): number {
  const first = secondHand ? rates.annual : rates.first;
  const y = Math.max(0, years);
  // Clamp the growth factors at 0 so a rate below -100% can't yield NaN (negative base ** fractional exponent).
  const value =
    price *
    Math.pow(Math.max(0, 1 + first / 100), Math.min(y, 1)) *
    Math.pow(Math.max(0, 1 + rates.annual / 100), Math.max(y - 1, 0));
  return Math.max(0, Math.round(value * 100) / 100);
}
