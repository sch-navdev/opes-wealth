/**
 * Turns existing OW holdings into dated cash-flow streams for the IRR comparison tool. Pure, no I/O:
 * "today", the FX tables and the (already co-ownership-scaled) assets all come in as arguments.
 *
 * What a holding's flows contain (see tracker/Real-Estate-Multi-Currency.md, "IRR comparison"):
 *  - the money paid in, on its stored date (negative);
 *  - dated income that is actually STORED and already in the past (rent from tenancy contracts, dividends,
 *    SCPI dividends marked received, ...), positive;
 *  - dated running costs that are stored (property expenses, the vehicle expense ledger), negative;
 *  - the CURRENT value as a terminal positive flow dated `today`.
 * Nothing is invented: a missing purchase price/date or value gives a typed `unavailable` reason, undated
 * lump sums are never given a made-up date, and future (projected / scheduled) amounts are never included.
 *
 * Co-ownership: `assets` must already be reduced to the viewer's share, exactly like the dashboard
 * (`applyOwnershipFactors`); only per-unit prices that the share scaling leaves alone need the optional
 * `ownershipShare` (Exotic Assets).
 *
 * Currency: every flow is converted into the base currency with the rate of ITS OWN DATE (historical fixing,
 * the same source as the FX-vs-capital attribution), the terminal value with today's rate. The IRR in base
 * currency therefore contains the currency effect, like the attribution does. A missing rate gives
 * `unavailable: "missing_fx"` for the whole holding.
 *
 * `includes` semantics: `income`/`financing`/`costs` are `false` only when something of that kind EXISTS in the
 * data but is not in the flows (so the UI warns exactly then); a holding with nothing to include is complete.
 */
import type { ComparableHolding, DatedFlow, HoldingUnavailableReason } from "./irr-compare-types";
import { holdingDisplayName, parseEquityMetadata, tradeCost } from "./equities";
import { convertToBaseCurrency } from "./fx";
import { parseExoticMetadata } from "./exotic-assets";
import { parsePrivateEquityMetadata } from "./private-equity";
import { parseRealEstateMetadata, sumAcquisitionFees, type TenancyContract } from "./real-estate";
import { parseScpiMetadata, scpiInvested } from "./scpi";
import { parseStartupMetadata } from "./startups";
import { parseVehicleMetadata } from "./vehicles";

/** The asset columns the builder reads (a superset of the dashboard's `AssetRow`). */
export type HoldingAssetInput = {
  id: string;
  name: string;
  quantity: number;
  current_value: number;
  currency: string;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  purchase_date: string | null;
  ticker_symbol?: string | null;
  asset_categories: { name: string } | null;
  /** Viewer's share 0-1 (default 1); only used for per-unit prices the scaling does not touch (Exotic Assets). */
  ownershipShare?: number;
};

/** Historical base-per-local FX: `fxHistory[currency][YYYY-MM-DD]`. Missing entries mean "unavailable". */
export type HoldingFxHistory = Record<string, Record<string, number>>;

type NativeFlow = { date: string; amount: number; currency: string; terminal?: boolean };
type Includes = NonNullable<ComparableHolding["includes"]>;
type Native =
  | { ok: true; flows: NativeFlow[]; includes: Includes }
  | { ok: false; reason: HoldingUnavailableReason };

const fail = (reason: HoldingUnavailableReason): Native => ({ ok: false, reason });

// ---------------------------------------------------------------------------
// Small date / number helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` for a valid ISO date (or timestamp), else null. */
function validDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const day = value.slice(0, 10);
  return Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? null : day;
}

const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** `iso` + `months`, keeping the day of month (clamped to the month's length). */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const monthIndex = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

const minDay = (a: string, b: string) => (a < b ? a : b);

function terminal(asset: HoldingAssetInput, amount: number, today: string): NativeFlow {
  return { date: today, amount, currency: asset.currency, terminal: true };
}

// ---------------------------------------------------------------------------
// Per-category native flows (asset's own currency / trade currency)
// ---------------------------------------------------------------------------

/** Monthly rent (annual / 12, in arrears) from the tenancy contracts, for fully elapsed months only, up to `today`. */
function rentFlows(
  contracts: TenancyContract[],
  currency: string,
  purchaseDate: string | null,
  today: string,
): NativeFlow[] {
  const out: NativeFlow[] = [];
  for (const c of contracts) {
    const start = validDay(c.start_date);
    if (!start || start > today) continue;
    const end = validDay(c.end_date);
    let annual: number | null = positive(c.annual_rent) ? c.annual_rent : null;
    if (annual == null && positive(c.contract_value) && end && end > start) {
      const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / MS_PER_DAY + 1;
      annual = (c.contract_value * 365) / days;
    }
    if (annual == null) continue;
    // No end date on file: the lease is treated as running through today (same as the passive-income card).
    const cap = end ? minDay(end, today) : today;
    for (let k = 1; k <= 1200; k++) {
      const due = addMonths(start, k);
      // The k-th month is complete once the day after `cap` has been reached.
      if (due > addDays(cap, 1)) break;
      const date = minDay(due, cap);
      if (purchaseDate && date < purchaseDate) continue;
      out.push({ date, amount: annual / 12, currency });
    }
  }
  return out;
}

function dated(
  entries: { date?: unknown; amount?: unknown }[],
  sign: 1 | -1,
  currency: string,
  today: string,
): NativeFlow[] {
  const out: NativeFlow[] = [];
  for (const e of entries) {
    const date = validDay(e.date);
    if (!date || date > today || !positive(e.amount)) continue;
    out.push({ date, amount: sign * e.amount, currency });
  }
  return out;
}

function realEstate(asset: HoldingAssetInput, today: string): Native {
  const md = parseRealEstateMetadata(asset.metadata);
  const purchaseDate = validDay(asset.purchase_date);
  const fees = sumAcquisitionFees(md);
  const flows: NativeFlow[] = [];
  const loan = md.linked_loan;
  const hasLoan = positive(loan.amount) || positive(loan.outstanding_principal);

  let value: number;
  if (md.is_offplan) {
    // Off-plan: what was actually paid (milestones marked paid, or the lump `paid_to_date`) plus the up-front
    // fees; the terminal value is the position's equity (market value minus what is still owed the developer).
    const paid = dated(
      md.payment_schedule.filter((m) => m.status === "paid").map((m) => ({ date: m.due_date, amount: m.amount })),
      -1,
      asset.currency,
      today,
    );
    if (paid.length > 0) flows.push(...paid);
    else if (positive(md.paid_to_date) && purchaseDate) {
      flows.push({ date: purchaseDate, amount: -md.paid_to_date, currency: asset.currency });
    } else {
      return fail("missing_purchase_price");
    }
    if (fees > 0) {
      const feeDate = purchaseDate ?? flows.map((f) => f.date).sort()[0];
      flows.push({ date: feeDate, amount: -fees, currency: asset.currency });
    }
    value = positive(md.market_valuation)
      ? md.market_valuation - (md.outstanding_balance ?? 0)
      : asset.current_value; // off-plan current_value already is the net equity
  } else {
    const price = md.contract_price ?? md.purchasePrice;
    if (!positive(price)) return fail("missing_purchase_price");
    if (!purchaseDate) return fail("missing_purchase_date");
    flows.push({ date: purchaseDate, amount: -(price + fees), currency: asset.currency });
    // `current_value` of a property is its EQUITY (market value minus the loan): the gross market value is needed.
    if (positive(md.market_valuation)) value = md.market_valuation;
    else if (!hasLoan) value = asset.current_value;
    else return fail("missing_value");
  }
  if (!Number.isFinite(value) || value <= 0) return fail("missing_value");

  flows.push(...rentFlows(md.tenancy_contracts, asset.currency, purchaseDate, today));
  const costs = dated(md.property_expenses, -1, asset.currency, today);
  flows.push(...costs);
  flows.push(terminal(asset, value, today));
  return {
    ok: true,
    flows,
    includes: {
      purchase: true,
      income: true,
      currentValue: true,
      // The tool follows the PROPERTY (unlevered); a loan is not modelled, so say so when one exists.
      financing: !hasLoan,
      costs: costs.length > 0,
    },
  };
}

function vehicle(asset: HoldingAssetInput, today: string): Native {
  const md = parseVehicleMetadata(asset.metadata);
  if (!positive(md.purchase_price)) return fail("missing_purchase_price");
  const purchaseDate = validDay(asset.purchase_date);
  if (!purchaseDate) return fail("missing_purchase_date");
  if (!Number.isFinite(asset.current_value) || asset.current_value <= 0) return fail("missing_value");
  const costs = dated(md.expenses, -1, asset.currency, today);
  return {
    ok: true,
    flows: [
      { date: purchaseDate, amount: -md.purchase_price, currency: asset.currency },
      ...costs,
      terminal(asset, asset.current_value, today),
    ],
    // The lump-sum cost fields (maintenance, modifications, insurance) are undated and therefore left out.
    includes: { purchase: true, income: true, currentValue: true, financing: true, costs: costs.length > 0 },
  };
}

function equity(asset: HoldingAssetInput, today: string): Native {
  const md = parseEquityMetadata(asset.metadata);
  const trades = md.trades.filter((t) => validDay(t.tradeDate) && positive(t.quantity));
  if (trades.length === 0) return fail("missing_purchase_price");
  if (!Number.isFinite(asset.current_value)) return fail("missing_value");

  const sorted = [...trades].sort(
    (a, b) => a.tradeDate.localeCompare(b.tradeDate) || (a.side === b.side ? 0 : a.side === "buy" ? -1 : 1),
  );
  const flows: NativeFlow[] = [];
  let held = 0;
  for (const t of sorted) {
    const date = validDay(t.tradeDate) as string;
    if (date > today) continue;
    const cost = tradeCost(t);
    if (!(cost > 0)) return fail("missing_purchase_price");
    const currency = t.currency || asset.currency;
    if (t.side === "buy") {
      held += t.quantity;
      flows.push({ date, amount: -cost, currency });
    } else {
      held = Math.max(0, held - t.quantity);
      flows.push({ date, amount: cost, currency });
    }
  }
  // The trade ledger and the live quantity must agree, otherwise the terminal value would be matched against
  // the wrong cost: refuse rather than guess.
  const quantity = positive(asset.quantity) ? asset.quantity : 0;
  if (Math.abs(held - quantity) > 1e-4 * Math.max(1, quantity, held)) return fail("missing_value");
  if (quantity > 0) {
    if (asset.current_value <= 0) return fail("missing_value");
    flows.push(terminal(asset, asset.current_value, today));
  }

  const income = md.income ?? [];
  flows.push(...dated(income, 1, asset.currency, today));
  const undatedIncome = income.length === 0 && positive(md.total_income);
  return {
    ok: true,
    flows,
    includes: { purchase: true, income: !undatedIncome, currentValue: quantity > 0, financing: true },
  };
}

function scpi(asset: HoldingAssetInput, today: string): Native {
  const md = parseScpiMetadata(asset.metadata);
  const invested = scpiInvested(md, asset.quantity);
  if (!positive(invested)) return fail("missing_purchase_price");
  const purchaseDate = validDay(asset.purchase_date);
  if (!purchaseDate) return fail("missing_purchase_date");
  if (!Number.isFinite(asset.current_value) || asset.current_value <= 0) return fail("missing_value");
  const received = dated(
    md.dividends.filter((d) => d.status === "received"),
    1,
    asset.currency,
    today,
  );
  return {
    ok: true,
    flows: [
      { date: purchaseDate, amount: -invested, currency: asset.currency },
      ...received,
      terminal(asset, asset.current_value, today),
    ],
    includes: { purchase: true, income: true, currentValue: true, financing: !md.financed_by_credit },
  };
}

function privateEquity(asset: HoldingAssetInput, today: string): Native {
  const md = parsePrivateEquityMetadata(asset.metadata);
  const flows: NativeFlow[] = dated(
    md.capital_calls.filter((c) => c.status === "paid").map((c) => ({ date: c.due_date, amount: c.amount })),
    -1,
    asset.currency,
    today,
  );
  if (flows.length === 0) {
    const purchaseDate = validDay(asset.purchase_date);
    if (positive(md.called_capital_manual) && purchaseDate) {
      flows.push({ date: purchaseDate, amount: -md.called_capital_manual, currency: asset.currency });
    } else if (positive(md.called_capital_manual)) {
      return fail("missing_purchase_date");
    } else {
      return fail("missing_purchase_price");
    }
  }
  if (!Number.isFinite(asset.current_value) || asset.current_value <= 0) return fail("missing_value");
  flows.push(terminal(asset, asset.current_value, today));
  // `distributions_to_date` is a lump with no dates, and projected distributions are expectations, not receipts:
  // neither can be placed on the timeline, so the income side is flagged as incomplete when distributions exist.
  const missingDistributions = positive(md.distributions_to_date);
  return {
    ok: true,
    flows,
    includes: { purchase: true, income: !missingDistributions, currentValue: true, financing: true },
  };
}

function startup(asset: HoldingAssetInput, today: string): Native {
  const md = parseStartupMetadata(asset.metadata);
  if (!positive(md.avg_cost_per_share) || !positive(asset.quantity)) return fail("missing_purchase_price");
  const purchaseDate = validDay(asset.purchase_date);
  if (!purchaseDate) return fail("missing_purchase_date");
  if (!Number.isFinite(asset.current_value) || asset.current_value <= 0) return fail("missing_value");
  return {
    ok: true,
    flows: [
      { date: purchaseDate, amount: -(md.avg_cost_per_share * asset.quantity), currency: asset.currency },
      terminal(asset, asset.current_value, today),
    ],
    includes: { purchase: true, income: true, currentValue: true, financing: true },
  };
}

function exotic(asset: HoldingAssetInput, today: string): Native {
  const md = parseExoticMetadata(asset.metadata);
  if (!positive(md.purchase_price)) return fail("missing_purchase_price");
  const purchaseDate = validDay(asset.purchase_date);
  if (!purchaseDate) return fail("missing_purchase_date");
  if (!Number.isFinite(asset.current_value) || asset.current_value <= 0) return fail("missing_value");
  // `purchase_price` is per unit and `quantity` is not scaled by the co-ownership factor (the value is).
  const units = positive(asset.quantity) ? asset.quantity : 1;
  const share = positive(asset.ownershipShare) ? asset.ownershipShare : 1;
  return {
    ok: true,
    flows: [
      { date: purchaseDate, amount: -(md.purchase_price * units * share), currency: asset.currency },
      terminal(asset, asset.current_value, today),
    ],
    includes: { purchase: true, income: true, currentValue: true, financing: true },
  };
}

/** Native (own-currency) flows of one asset, or the typed reason it cannot be built. */
function describeHolding(asset: HoldingAssetInput, today: string): Native {
  if (asset.is_liability) return fail("unsupported_category");
  switch (asset.asset_categories?.name) {
    case "Real Estate":
      return realEstate(asset, today);
    case "Vehicles":
      return vehicle(asset, today);
    case "Equities":
      return equity(asset, today);
    case "SCPI":
      return scpi(asset, today);
    case "Private Equity":
      return privateEquity(asset, today);
    case "Startups":
      return startup(asset, today);
    case "Exotic Assets":
      return exotic(asset, today);
    default:
      // Cash, Crypto, Precious Metals, Companies, Liabilities, ...: no stored cost basis to start from.
      return fail("unsupported_category");
  }
}

// ---------------------------------------------------------------------------
// FX requests and the public builder
// ---------------------------------------------------------------------------

/**
 * The (currency -> sorted unique dates) the builder needs HISTORICAL rates for: every past, non-terminal flow in
 * a currency other than `baseCurrency`. Feed it to the FX history fetch, then pass the result as `fxHistory`.
 */
export function collectHoldingFxRequests(
  assets: HoldingAssetInput[],
  baseCurrency: string,
  today: string,
): Record<string, string[]> {
  const sets = new Map<string, Set<string>>();
  for (const asset of assets) {
    const native = describeHolding(asset, today);
    if (!native.ok) continue;
    for (const f of native.flows) {
      if (f.terminal || f.currency === baseCurrency || f.date >= today) continue;
      let set = sets.get(f.currency);
      if (!set) sets.set(f.currency, (set = new Set<string>()));
      set.add(f.date);
    }
  }
  return Object.fromEntries([...sets].map(([currency, dates]) => [currency, [...dates].sort()]));
}

/** Base-per-local rate for a flow, or null when unknown. */
function rateFor(
  flow: NativeFlow,
  baseCurrency: string,
  rates: Record<string, number>,
  fxHistory: HoldingFxHistory,
  today: string,
): number | null {
  if (flow.currency === baseCurrency) return 1;
  if (flow.terminal || flow.date >= today) {
    if (!(flow.currency in rates)) return null;
    const rate = convertToBaseCurrency(1, flow.currency, baseCurrency, rates);
    return positive(rate) ? rate : null;
  }
  const rate = fxHistory[flow.currency]?.[flow.date];
  return positive(rate) ? rate : null;
}

/**
 * One `ComparableHolding` per asset: flows in the base currency when they can be built, else a typed
 * `unavailable` reason. `rates` is the dashboard's base-anchored table (today's FX), `fxHistory` the historical
 * base-per-local rates for the dates `collectHoldingFxRequests` lists. Order follows `assets`.
 */
export function buildComparableHoldings(args: {
  assets: HoldingAssetInput[];
  baseCurrency: string;
  rates: Record<string, number>;
  fxHistory: HoldingFxHistory;
  today: string;
}): ComparableHolding[] {
  const { assets, baseCurrency, rates, fxHistory, today } = args;
  return assets.map((asset): ComparableHolding => {
    const category = asset.asset_categories?.name ?? "—";
    const name =
      category === "Equities"
        ? holdingDisplayName(asset.name, parseEquityMetadata(asset.metadata), asset.ticker_symbol ?? null)
        : asset.name;
    const head = { id: asset.id, name, category, currency: baseCurrency };

    const native = describeHolding(asset, today);
    if (!native.ok) return { ...head, unavailable: native.reason };

    const flows: DatedFlow[] = [];
    for (const f of native.flows) {
      const rate = rateFor(f, baseCurrency, rates, fxHistory, today);
      if (rate == null) return { ...head, unavailable: "missing_fx" };
      const amount = f.amount * rate;
      if (amount !== 0 && Number.isFinite(amount)) flows.push({ date: f.date, amount });
    }
    // Stable by date (the terminal flow, dated today, ends up last).
    flows.sort((a, b) => a.date.localeCompare(b.date));
    if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) {
      return { ...head, unavailable: "no_sign_change" };
    }
    return { ...head, flows, includes: native.includes };
  });
}
