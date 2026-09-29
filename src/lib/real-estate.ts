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

/** One tenancy period for this property — a property is re-let contract after contract (e.g. 2025-2026, then 2026-2027), so these accumulate rather than being overwritten. `imported_from_file`/`uploaded_at` record provenance when a row came from a parsed PDF (`lib/tenancy-parser.ts`) rather than manual entry. */
export type TenancyContract = {
  id: string;
  tenant_name: string;
  start_date: string;
  end_date: string;
  /** Annual rent (Ejari "Annual Amount" / Tawtheeq "Annual Rent"). */
  annual_rent: number | null;
  /** Total contract value over the full tenancy term (Ejari "Contract Amount" / Tawtheeq "Contract Value") — may span multiple years and differ from `annual_rent * years`. */
  contract_value: number | null;
  imported_from_file: string;
  uploaded_at: string;
};

/** A single logged property expense (maintenance, service charges, repairs, etc.) — kept as a running, dated ledger rather than one lump "monthly" figure, since real costs are lumpy and don't accrue evenly. */
export type PropertyExpense = {
  id: string;
  description: string;
  date: string;
  amount: number;
};

/** "fixed" = `interest_rate` applies for the full `duration_months`. "hybrid" = a fixed teaser rate for `fixed_period_months`, then a variable rate for the remainder (the common UAE "salary transfer" mortgage structure). */
export type LoanRateType = "fixed" | "hybrid";

export type LinkedLoan = {
  lender_name: string;
  amount: number | null;
  /** Rate used for the whole term when `rate_type === "fixed"`, and for the initial teaser period when `rate_type === "hybrid"`. Annual percentage, e.g. `3.99`. */
  interest_rate: number | null;
  duration_months: number | null;
  start_date: string;
  monthly_payment: number | null;
  /** Current principal still owed — the actual liability, distinct from `amount` (the original loan). Falls back to `amount` (see `resolveOutstandingLoanBalance`) for loans entered before this field existed, or when there isn't enough data to run the amortization engine (see `lib/amortization.ts`). */
  outstanding_principal: number | null;

  rate_type: LoanRateType;
  /** Hybrid only — how many months `interest_rate` (the fixed teaser rate) applies before switching to the variable rate. */
  fixed_period_months: number | null;
  /** Hybrid only — margin added on top of the reference rate (e.g. 3-month EIBOR) once the fixed period ends. Annual percentage points, e.g. `1.79`. */
  variable_margin: number | null;
  /** Hybrid only — the reference index rate (e.g. current 3-month EIBOR), entered manually since this app has no live rate feed. Annual percentage. */
  reference_rate: number | null;
  /** Hybrid only — the variable rate never goes below this floor, even if `reference_rate + variable_margin` would be lower. Annual percentage. */
  floor_rate: number | null;
  /** Hybrid only — whether the borrower's salary transfer to the lender is still active. Many UAE mortgages carry a materially higher rate if it lapses. */
  salary_transfer_active: boolean;
  /** Hybrid only — annual rate applied instead of `reference_rate + variable_margin` (still floored by `floor_rate`) once `salary_transfer_active` is false. */
  fallback_rate: number | null;
};

export type RegistrationFeeType = "Notary" | "RERA" | "ADM";

/** Which emirate's land authority this property is registered with — gates whether the DLD (Dubai) or ADREC/DARI (Abu Dhabi) identifier panels and refresh actions apply, since a property is registered with exactly one. */
export type Emirate = "dubai" | "abu_dhabi";

export type RealEstateMetadata = {
  address: string;
  propertyType: string;
  automaticEstimation: boolean;
  elevator: boolean;
  newConstruction: boolean;
  furnished: boolean;
  purchasePrice: number | null;
  agencyFees: number | null;
  /** @deprecated superseded by `registration_fee_type`/`registration_fee_amount`; kept only as a legacy fallback for older saved assets. */
  notaryFees: number | null;
  registration_fee_type: RegistrationFeeType;
  registration_fee_amount: number;
  renovationFees: number | null;
  furnishingFees: number | null;
  transfer_trustee_fees: number | null;
  agent_sales_progression_fees: number | null;
  rera_title_deed_processing_fees: number | null;
  rera_mortgage_registration_fees: number | null;
  rera_knowledge_fee: number | null;
  in_principle_bank_approval_fee: number | null;
  property_valuation_fee: number | null;
  bank_processing_fees: number | null;
  /** Recurring annual cost — not included in the one-time acquisition cost basis. */
  yearly_insurance_fee: number | null;
  /** Total floor area — kept in sync as `internal_area + terrace_area` whenever either changes. */
  surfaceArea: number | null;
  internal_area: number | null;
  terrace_area: number | null;
  gardenArea: number | null;
  /** @deprecated superseded by `terrace_area`; kept only so older saved assets don't lose this figure. */
  balconyArea: number | null;
  floors: number;
  rooms: number;
  garageCount: number;
  yearOfConstruction: string;
  epcRating: string;
  condition: ConditionRatings;
  ownership: OwnershipEntry[];

  /** Which emirate's land authority this property is registered with — see `Emirate`. Defaults to `"dubai"`; assets saved before this field existed are treated as Dubai (the only emirate this app originally supported). */
  emirate: Emirate;

  // Off-plan property tracking
  is_offplan: boolean;
  /** The property's current fair-market valuation, entered by the user.
   *  Kept separate from the asset's `current_value` column, which for
   *  off-plan assets stores the computed net equity instead. */
  market_valuation: number | null;
  contract_price: number | null;
  /** @deprecated superseded by `registration_fee_type`/`registration_fee_amount`; kept only as a legacy fallback for older saved assets. */
  adm_fee_percent: number | null;
  /** @deprecated superseded by `registration_fee_type`/`registration_fee_amount`; kept only as a legacy fallback for older saved assets. */
  adm_fee_amount: number | null;
  paid_to_date: number;
  outstanding_balance: number;
  payment_schedule: PaymentMilestone[];

  // Dubai Land Department / RERA property identifiers, used to look up
  // this property in the DLD integration (`lib/services/dld-client.ts`).
  /** Ready-built only — Smart Valuation API input. */
  title_deed_number: string;
  /** Ready-built only — "Municipality Plot ID / Area ID", Smart Valuation API input. */
  plot_id: string;
  /** Off-plan only — Oqood & TAS Project Status API input. */
  oqood_number: string;
  /** Off-plan only — Oqood & TAS Project Status API input. */
  project_number: string;
  /** Off-plan only — Oqood & TAS Project Status API input. */
  escrow_id: string;
  /** Either property type — Ejari Rental Index API's "Area / Community ID" input. */
  community_id: string;

  // Off-plan project status, last fetched from the Oqood & TAS Project
  // Status API (`refreshDldValuation` in `dashboard/actions.ts`). Unlike
  // Smart Valuation, that API returns no monetary figure, so it updates
  // these fields instead of `market_valuation`/`current_value`.
  completion_percentage: number | null;
  escrow_balance_status: string;
  latest_inspection_date: string;

  // Abu Dhabi Real Estate Centre (ADREC) / DARI property identifiers —
  // the Abu Dhabi equivalent of the DLD/RERA fields above, used to look up
  // this property in `lib/services/adrec-client.ts`. Kept as a fully
  // separate field set rather than reused, since a property is registered
  // with exactly one emirate's land authority.
  /** Ready-built only — DARI Certificates API input. */
  adrec_plot_number: string;
  /** Ready-built only — DARI Certificates API input. */
  adrec_unit_id: string;
  /** Ready-built only — DARI Certificates API input. */
  adrec_title_deed: string;
  /** Off-plan only — ADREC Projects & Escrow API input. */
  adrec_project_id: string;
  /** Off-plan only — ADREC Projects & Escrow API input. */
  adrec_developer_id: string;

  // Off-plan project status, last fetched from the ADREC Projects & Escrow
  // API (`refreshAdrecValuation` in `dashboard/actions.ts`). Same
  // no-fabricated-valuation rationale as the DLD fields above.
  adrec_completion_rate: number | null;
  adrec_escrow_status: string;
  adrec_construction_stage: string;
  adrec_inspection_date: string;

  // Financing linked to this property, subtracted from the market value to get Equity.
  linked_loan: LinkedLoan;

  // Tenancy / rental tracking — one entry per tenancy period (a property is
  // re-let contract after contract, e.g. 2025-2026 then 2026-2027), each
  // typically filled by parsing an uploaded Ejari (Dubai) or Tawtheeq (Abu
  // Dhabi) contract PDF (see `lib/tenancy-parser.ts`). Every logged expense
  // (maintenance, service charges, etc.) is tracked separately so it
  // accumulates over time rather than being overwritten by the next import.
  tenancy_contracts: TenancyContract[];
  property_expenses: PropertyExpense[];
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
  registration_fee_type: "Notary",
  registration_fee_amount: 0,
  renovationFees: null,
  furnishingFees: null,
  transfer_trustee_fees: null,
  agent_sales_progression_fees: null,
  rera_title_deed_processing_fees: null,
  rera_mortgage_registration_fees: null,
  rera_knowledge_fee: null,
  in_principle_bank_approval_fee: null,
  property_valuation_fee: null,
  bank_processing_fees: null,
  yearly_insurance_fee: null,
  surfaceArea: null,
  internal_area: null,
  terrace_area: null,
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

  emirate: "dubai",

  is_offplan: false,
  market_valuation: null,
  contract_price: null,
  adm_fee_percent: 2,
  adm_fee_amount: null,
  paid_to_date: 0,
  outstanding_balance: 0,
  payment_schedule: [],

  title_deed_number: "",
  plot_id: "",
  oqood_number: "",
  project_number: "",
  escrow_id: "",
  community_id: "",

  completion_percentage: null,
  escrow_balance_status: "",
  latest_inspection_date: "",

  adrec_plot_number: "",
  adrec_unit_id: "",
  adrec_title_deed: "",
  adrec_project_id: "",
  adrec_developer_id: "",

  adrec_completion_rate: null,
  adrec_escrow_status: "",
  adrec_construction_stage: "",
  adrec_inspection_date: "",

  linked_loan: {
    lender_name: "",
    amount: null,
    interest_rate: null,
    duration_months: null,
    start_date: "",
    monthly_payment: null,
    outstanding_principal: null,
    rate_type: "fixed",
    fixed_period_months: null,
    variable_margin: null,
    reference_rate: null,
    floor_rate: null,
    salary_transfer_active: true,
    fallback_rate: null,
  },

  tenancy_contracts: [],
  property_expenses: [],
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
    tenancy_contracts: Array.isArray(r.tenancy_contracts)
      ? r.tenancy_contracts
      : migrateLegacyTenancyContract(raw),
    property_expenses: Array.isArray(r.property_expenses)
      ? r.property_expenses
      : EMPTY_REAL_ESTATE_METADATA.property_expenses,
  };
}

/**
 * Reads a single tenancy contract's worth of fields (`tenant_name`,
 * `tenancy_start_date`, `tenancy_end_date`, `tenancy_contract_value`,
 * `annual_rent`) that pre-date the `tenancy_contracts` array, so a property
 * saved before that array existed doesn't silently lose its one contract on
 * the next read.
 */
function migrateLegacyTenancyContract(raw: object): TenancyContract[] {
  const legacy = raw as {
    tenant_name?: unknown;
    tenancy_start_date?: unknown;
    tenancy_end_date?: unknown;
    tenancy_contract_value?: unknown;
    annual_rent?: unknown;
  };

  const hasLegacyData =
    typeof legacy.tenant_name === "string" && legacy.tenant_name.trim() !== "";
  if (!hasLegacyData) return [];

  return [
    {
      id: "legacy-tenancy-contract",
      tenant_name: legacy.tenant_name as string,
      start_date: typeof legacy.tenancy_start_date === "string" ? legacy.tenancy_start_date : "",
      end_date: typeof legacy.tenancy_end_date === "string" ? legacy.tenancy_end_date : "",
      annual_rent: typeof legacy.annual_rent === "number" ? legacy.annual_rent : null,
      contract_value:
        typeof legacy.tenancy_contract_value === "number" ? legacy.tenancy_contract_value : null,
      imported_from_file: "",
      uploaded_at: "",
    },
  ];
}

/** Max number of images stored per asset (multi-image carousel). */
export const MAX_ASSET_IMAGES = 3;

/**
 * The single registration/notarization fee paid at signing — `registration_fee_amount`
 * if it's set, otherwise the sum of the legacy `notaryFees`/`adm_fee_amount`
 * fields it replaced, so assets saved before this consolidation still cost
 * out correctly without a data migration.
 */
export function resolveRegistrationFee(metadata: RealEstateMetadata): number {
  if (metadata.registration_fee_amount) return metadata.registration_fee_amount;
  return (metadata.notaryFees ?? 0) + (metadata.adm_fee_amount ?? 0);
}

/**
 * The actual liability to subtract for Net Equity/NAV: the loan's current
 * `outstanding_principal` if it's been entered, otherwise the original
 * `amount` as a fallback (for loans saved before this field existed, or
 * simply never updated after origination).
 */
export function resolveOutstandingLoanBalance(loan: LinkedLoan): number {
  return loan.outstanding_principal ?? loan.amount ?? 0;
}

/**
 * Sum of every one-time fee paid to acquire the property, excluding the
 * base price itself. Excludes `yearly_insurance_fee`, which is a recurring
 * annual cost rather than part of the acquisition cost basis.
 */
export function sumAcquisitionFees(metadata: RealEstateMetadata): number {
  return (
    resolveRegistrationFee(metadata) +
    (metadata.agencyFees ?? 0) +
    (metadata.renovationFees ?? 0) +
    (metadata.furnishingFees ?? 0) +
    (metadata.transfer_trustee_fees ?? 0) +
    (metadata.agent_sales_progression_fees ?? 0) +
    (metadata.rera_title_deed_processing_fees ?? 0) +
    (metadata.rera_mortgage_registration_fees ?? 0) +
    (metadata.rera_knowledge_fee ?? 0) +
    (metadata.in_principle_bank_approval_fee ?? 0) +
    (metadata.property_valuation_fee ?? 0) +
    (metadata.bank_processing_fees ?? 0)
  );
}

/**
 * All-in cost basis: the contract/purchase price plus every fee paid to
 * acquire the property (registration, agency, renovation, furnishing, and
 * the RERA/bank/transfer fees). `fallbackValue` is used when neither
 * `contract_price` nor `purchasePrice` is set (e.g. a bare market
 * valuation with no purchase history entered yet).
 */
export function calculateTotalCost(
  metadata: RealEstateMetadata,
  fallbackValue: number,
): number {
  const base = metadata.contract_price ?? metadata.purchasePrice ?? fallbackValue;
  return base + sumAcquisitionFees(metadata);
}

/**
 * For off-plan properties: actual cash paid out so far — the payment
 * milestones marked "paid" plus every acquisition fee (registration,
 * agency, renovation, furnishing, RERA/bank/transfer fees), which are
 * typically paid up front rather than staged with the contract.
 */
export function calculateCashInvestedToDate(metadata: RealEstateMetadata): number {
  return (metadata.paid_to_date ?? 0) + sumAcquisitionFees(metadata);
}

/** Equity = current market value minus the outstanding loan balance still owed against it. */
export function calculateEquity(
  marketValuation: number,
  outstandingLoanBalance: number,
): number {
  return marketValuation - outstandingLoanBalance;
}

/** Unrealized Gain / Net Profit against the full cost basis (not just the raw purchase price), and that gain as a percentage of the cost basis. */
export function calculateUnrealizedGain(
  marketValuation: number,
  totalCost: number,
): { amount: number; percent: number | null } {
  const amount = marketValuation - totalCost;
  const percent = totalCost !== 0 ? (amount / totalCost) * 100 : null;
  return { amount, percent };
}

/** Total floor area — the sum of the internal and terrace/balcony areas. */
export function calculateTotalArea(
  internalArea: number | null,
  terraceArea: number | null,
): number {
  return (internalArea ?? 0) + (terraceArea ?? 0);
}

let milestoneCounter = 0;

/** Generates a stable-enough client-side id for a new payment milestone row. */
export function nextMilestoneId(): string {
  milestoneCounter += 1;
  return `milestone-${Date.now()}-${milestoneCounter}`;
}

let recordCounter = 0;

/** Generates a stable-enough id for a new tenancy contract or property expense row (server-side, unlike `nextMilestoneId`, so no import needed there just for id generation). */
function nextRecordId(prefix: string): string {
  recordCounter += 1;
  return `${prefix}-${Date.now()}-${recordCounter}`;
}

export function nextTenancyContractId(): string {
  return nextRecordId("tenancy");
}

export function nextPropertyExpenseId(): string {
  return nextRecordId("expense");
}

/**
 * The tenancy contract in effect on `onDate` (default today) — the one
 * whose `start_date`/`end_date` bracket it — falling back to the most
 * recently started contract if none currently applies (e.g. between leases,
 * or a contract with no end date on file yet).
 */
export function findActiveTenancyContract(
  contracts: TenancyContract[],
  onDate: string = new Date().toISOString().slice(0, 10),
): TenancyContract | null {
  if (contracts.length === 0) return null;

  const current = contracts.find(
    (c) => c.start_date && c.start_date <= onDate && (!c.end_date || c.end_date >= onDate),
  );
  if (current) return current;

  return [...contracts].sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
}

/** Sum of every logged property expense — a running total, not a "monthly" rate, since real costs are lumpy. */
export function sumPropertyExpenses(expenses: PropertyExpense[]): number {
  return expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
}

export const REGISTRATION_FEE_TYPES: RegistrationFeeType[] = [
  "Notary",
  "RERA",
  "ADM",
];

export const EMIRATES: Emirate[] = ["dubai", "abu_dhabi"];

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
