export type OwnershipEntry = {
  name: string;
  percentage: number;
};

export type ConditionRatings = {
  kitchen: string;
  bathrooms: string;
  flooring: string;
  windows: string;
  general: string;
};

export type PaymentMilestone = {
  id: string;
  milestone: string;
  due_date: string;
  amount: number;
  percentage: number;
  status: "paid" | "pending";
};

export type LinkedLoan = {
  amount: number | null;
  interest_rate: number | null;
  duration_months: number | null;
  start_date: string;
};

export type RealEstateMetadata = {
  address: string;
  propertyType: string;
  automaticEstimation: boolean;
  elevator: boolean;
  newConstruction: boolean;
  furnished: boolean;
  purchasePrice: number | null;
  agencyFees: number | null;
  notaryFees: number | null;
  renovationFees: number | null;
  furnishingFees: number | null;
  surfaceArea: number | null;
  gardenArea: number | null;
  balconyArea: number | null;
  floors: number;
  rooms: number;
  garageCount: number;
  yearOfConstruction: string;
  epcRating: string;
  condition: ConditionRatings;
  ownership: OwnershipEntry[];

  // Off-plan property tracking
  is_offplan: boolean;
  /** The property's current fair-market valuation, entered by the user.
   *  Kept separate from the asset's `current_value` column, which for
   *  off-plan assets stores the computed net equity instead. */
  market_valuation: number | null;
  contract_price: number | null;
  adm_fee_percent: number | null;
  adm_fee_amount: number | null;
  paid_to_date: number;
  outstanding_balance: number;
  payment_schedule: PaymentMilestone[];

  // Financing linked to this property, subtracted from Net Equity.
  linked_loan: LinkedLoan;
};

export const EMPTY_REAL_ESTATE_METADATA: RealEstateMetadata = {
  address: "",
  propertyType: "",
  automaticEstimation: false,
  elevator: false,
  newConstruction: false,
  furnished: false,
  purchasePrice: null,
  agencyFees: null,
  notaryFees: null,
  renovationFees: null,
  furnishingFees: null,
  surfaceArea: null,
  gardenArea: null,
  balconyArea: null,
  floors: 1,
  rooms: 1,
  garageCount: 0,
  yearOfConstruction: "",
  epcRating: "",
  condition: {
    kitchen: "",
    bathrooms: "",
    flooring: "",
    windows: "",
    general: "",
  },
  ownership: [{ name: "", percentage: 100 }],

  is_offplan: false,
  market_valuation: null,
  contract_price: null,
  adm_fee_percent: 2,
  adm_fee_amount: null,
  paid_to_date: 0,
  outstanding_balance: 0,
  payment_schedule: [],

  linked_loan: {
    amount: null,
    interest_rate: null,
    duration_months: null,
    start_date: "",
  },
};

/**
 * Merges a raw `assets.metadata` value (as read back from Supabase — may
 * be `{}`, partially shaped from an older save, or `null`/not an object)
 * into a complete `RealEstateMetadata`, so the edit form always has every
 * field defined even if the stored row predates a schema change.
 */
export function parseRealEstateMetadata(
  raw: unknown,
): RealEstateMetadata {
  if (!raw || typeof raw !== "object") {
    return EMPTY_REAL_ESTATE_METADATA;
  }

  const r = raw as Partial<RealEstateMetadata>;

  return {
    ...EMPTY_REAL_ESTATE_METADATA,
    ...r,
    condition: {
      ...EMPTY_REAL_ESTATE_METADATA.condition,
      ...(r.condition ?? {}),
    },
    ownership:
      Array.isArray(r.ownership) && r.ownership.length > 0
        ? r.ownership
        : EMPTY_REAL_ESTATE_METADATA.ownership,
    payment_schedule: Array.isArray(r.payment_schedule)
      ? r.payment_schedule
      : EMPTY_REAL_ESTATE_METADATA.payment_schedule,
    linked_loan: {
      ...EMPTY_REAL_ESTATE_METADATA.linked_loan,
      ...(r.linked_loan ?? {}),
    },
  };
}

/** Max number of images stored per asset (multi-image carousel). */
export const MAX_ASSET_IMAGES = 3;

/**
 * All-in cost basis: the contract/purchase price plus every fee paid to
 * acquire the property (ADM/municipal registration, notary, agency,
 * renovation, furnishing). `fallbackValue` is used when neither
 * `contract_price` nor `purchasePrice` is set (e.g. a bare market
 * valuation with no purchase history entered yet).
 */
export function calculateTotalCost(
  metadata: RealEstateMetadata,
  fallbackValue: number,
): number {
  const base = metadata.contract_price ?? metadata.purchasePrice ?? fallbackValue;
  return (
    base +
    (metadata.adm_fee_amount ?? 0) +
    (metadata.notaryFees ?? 0) +
    (metadata.agencyFees ?? 0) +
    (metadata.renovationFees ?? 0) +
    (metadata.furnishingFees ?? 0)
  );
}

/**
 * For off-plan properties: actual cash paid out so far — the payment
 * milestones marked "paid" plus every fee (ADM, notary, agency,
 * renovation, furnishing), which are typically paid up front rather than
 * staged with the contract.
 */
export function calculateCashInvestedToDate(metadata: RealEstateMetadata): number {
  return (
    (metadata.paid_to_date ?? 0) +
    (metadata.adm_fee_amount ?? 0) +
    (metadata.notaryFees ?? 0) +
    (metadata.agencyFees ?? 0) +
    (metadata.renovationFees ?? 0) +
    (metadata.furnishingFees ?? 0)
  );
}

/** Net gain against the full cost basis (not just the raw purchase price), and that gain as a percentage of the cost basis. */
export function calculateUnrealizedGain(
  marketValuation: number,
  totalCost: number,
): { amount: number; percent: number | null } {
  const amount = marketValuation - totalCost;
  const percent = totalCost !== 0 ? (amount / totalCost) * 100 : null;
  return { amount, percent };
}

let milestoneCounter = 0;

/** Generates a stable-enough client-side id for a new payment milestone row. */
export function nextMilestoneId(): string {
  milestoneCounter += 1;
  return `milestone-${Date.now()}-${milestoneCounter}`;
}

export const PROPERTY_TYPES = [
  "Apartment",
  "House",
  "Villa",
  "Land",
  "Commercial",
  "Parking",
  "Other",
];

export const EPC_RATINGS = ["A", "B", "C", "D", "E", "F", "G"];

export const CONDITION_RATINGS = [
  "Excellent",
  "Good",
  "Fair",
  "Poor",
  "To Renovate",
];

const CURRENT_YEAR = new Date().getFullYear();

/** Construction years from the current year down to 1900, newest first. */
export const CONSTRUCTION_YEARS = Array.from(
  { length: CURRENT_YEAR - 1900 + 1 },
  (_, i) => String(CURRENT_YEAR - i),
);
