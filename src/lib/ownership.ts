/**
 * Co-ownership: types, validation and pro-rata scaling (pure — no I/O, usable
 * on the client and the server). Storage and workflow live in migration 0025
 * and `lib/shared-assets/server.ts`.
 *
 * Model: an asset with NO `asset_owners` rows belongs 100% to `assets.profile_id`
 * (every asset created before this feature). A shared asset has one row per
 * owner, percentages summing to exactly 100, one row flagged `is_creator`.
 *
 * Pro-rata: dashboards and aggregates work on `scaleAssetForOwner(asset, f)`,
 * a copy of the asset reduced to the viewer's share `f` (0–1) — so an asset
 * worth $1M that you own 50% of contributes $500k to your net worth.
 */

export type OwnerInput = {
  /** Set for a registered owner (the creator, or a co-owner already on the app). */
  profileId?: string | null;
  name: string;
  /** Required for every co-owner; used to invite them and to link their account on signup. */
  email: string;
  /** Percent, 0 < p <= 100. */
  percentage: number;
  isCreator?: boolean;
};

export type OwnerRow = {
  profile_id: string | null;
  name: string;
  email: string | null;
  ownership_percentage: number;
  is_creator: boolean;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Percentages are compared to 100 with this tolerance (e.g. 33 + 33 + 34, or 33.33 x 3 = 99.99). */
const TOLERANCE = 0.005;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Unmet requirements as translation keys. An asset with a single 100% owner needs no validation. */
export function validateOwners(owners: OwnerInput[]): string[] {
  const errors: string[] = [];
  if (owners.length === 0) return ["owners_required"];

  for (const o of owners) {
    if (!(o.percentage > 0) || o.percentage > 100 || !Number.isFinite(o.percentage)) {
      errors.push("owners_percentage_invalid");
      break;
    }
  }
  const total = owners.reduce((sum, o) => sum + (Number.isFinite(o.percentage) ? o.percentage : 0), 0);
  if (Math.abs(total - 100) > TOLERANCE) errors.push("owners_total_must_be_100");

  const coOwners = owners.filter((o) => !o.isCreator);
  if (coOwners.some((o) => !o.name.trim())) errors.push("owners_name_required");
  if (coOwners.some((o) => !EMAIL.test(o.email.trim()))) errors.push("owners_email_invalid");

  const emails = coOwners.map((o) => normalizeEmail(o.email)).filter(Boolean);
  if (new Set(emails).size !== emails.length) errors.push("owners_email_duplicate");
  if (owners.filter((o) => o.isCreator).length !== 1) errors.push("owners_creator_required");
  return errors;
}

/**
 * The viewer's share of an asset as a 0–1 factor. No owner rows → the creator
 * owns it all (1). The viewer is matched by profile id, so an unlinked
 * invitation never counts as theirs.
 */
export function ownershipFactor(
  assetProfileId: string,
  rows: Pick<OwnerRow, "profile_id" | "ownership_percentage">[] | undefined,
  viewerId: string,
): number {
  if (!rows || rows.length === 0) return assetProfileId === viewerId ? 1 : 0;
  const mine = rows.find((r) => r.profile_id === viewerId);
  return mine ? mine.ownership_percentage / 100 : 0;
}

/** Registered owners other than `selfId` — the people who must approve `selfId`'s edit. */
export function otherRegisteredOwners<T extends Pick<OwnerRow, "profile_id">>(
  rows: T[] | undefined,
  selfId: string,
): (T & { profile_id: string })[] {
  return (rows ?? []).filter((r): r is T & { profile_id: string } => !!r.profile_id && r.profile_id !== selfId);
}

// ---------------------------------------------------------------------------
// Pro-rata scaling
// ---------------------------------------------------------------------------

type Meta = Record<string, unknown>;
type Scalable = {
  category: string;
  quantity: number;
  current_value: number;
  metadata: Meta | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function scaleKeys(obj: Meta, keys: string[], f: number): Meta {
  const out: Meta = { ...obj };
  for (const k of keys) {
    const v = out[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = round2(v * f);
  }
  return out;
}

function scaleList(list: unknown, keys: string[], f: number): unknown {
  return Array.isArray(list)
    ? list.map((item) => (item && typeof item === "object" ? scaleKeys(item as Meta, keys, f) : item))
    : list;
}

const REAL_ESTATE_MONEY = [
  "market_valuation", "purchasePrice", "agencyFees", "notaryFees", "registration_fee_amount",
  "renovationFees", "furnishingFees", "transfer_trustee_fees", "agent_sales_progression_fees",
  "rera_title_deed_processing_fees", "rera_mortgage_registration_fees", "rera_knowledge_fee",
  "in_principle_bank_approval_fee", "property_valuation_fee", "bank_processing_fees",
  "yearly_insurance_fee", "contract_price", "adm_fee_amount", "paid_to_date", "outstanding_balance",
];

/** Categories whose `quantity` is a count of units held (shares, coins, bars, bottles): the share scales it. */
const QUANTITY_BASED = new Set(["Equities", "Crypto", "Precious Metals", "SCPI", "Startups"]);

/**
 * A copy of the asset reduced to the viewer's share `f` (0–1): `current_value`
 * always; money fields in the category's metadata where known (real estate,
 * vehicles, private equity, brokerage trades and income); and `quantity` for
 * unit-based categories. Per-unit prices, percentages, areas and dates are left
 * alone. `f === 1` returns the asset untouched.
 */
export function scaleAssetForOwner<T extends Scalable>(asset: T, f: number): T {
  if (f === 1) return asset;
  const out: T = { ...asset, current_value: round2(asset.current_value * f) };
  if (QUANTITY_BASED.has(asset.category)) out.quantity = asset.quantity * f;

  const md = asset.metadata;
  if (!md) return out;
  let next: Meta = { ...md };

  switch (asset.category) {
    case "Real Estate": {
      next = scaleKeys(md, REAL_ESTATE_MONEY, f);
      if (md.linked_loan && typeof md.linked_loan === "object") {
        next.linked_loan = scaleKeys(md.linked_loan as Meta, ["amount", "outstanding_principal", "monthly_payment"], f);
      }
      next.payment_schedule = scaleList(md.payment_schedule, ["amount"], f);
      next.tenancy_contracts = scaleList(md.tenancy_contracts, ["annual_rent", "contract_value"], f);
      next.property_expenses = scaleList(md.property_expenses, ["amount"], f);
      break;
    }
    case "Vehicles": {
      next = scaleKeys(md, ["purchase_price", "maintenance_costs", "modifications", "insurance_registration", "market_valuation"], f);
      next.expenses = scaleList(md.expenses, ["amount"], f);
      break;
    }
    case "Private Equity": {
      next = scaleKeys(md, ["commitment_amount", "called_capital_manual", "distributions_to_date"], f);
      next.capital_calls = scaleList(md.capital_calls, ["amount"], f);
      next.projected_distributions = scaleList(md.projected_distributions, ["amount"], f);
      break;
    }
    case "Equities": {
      next = scaleKeys(md, ["total_income"], f);
      next.trades = scaleList(md.trades, ["quantity", "bookedAmount", "brokerage"], f);
      next.income = scaleList(md.income, ["amount"], f);
      break;
    }
    case "SCPI": {
      next.dividends = scaleList(md.dividends, ["amount"], f);
      break;
    }
    default:
      break;
  }
  out.metadata = next;
  return out;
}

/** Scales a stored history row (value and net equity) to the viewer's share. */
export function scaleHistoryValue(value: number, f: number): number {
  return f === 1 ? value : round2(value * f);
}
