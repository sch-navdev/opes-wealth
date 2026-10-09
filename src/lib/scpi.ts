/**
 * Metadata for the "SCPI" asset category (Sociétés Civiles de Placement
 * Immobilier — "pierre-papier" collective real estate vehicles), stored in
 * `assets.metadata`. The category itself has existed since migration 0001
 * (and Finary files SCPI under real estate too); this module gives it its own
 * fields instead of the generic Value form.
 *
 * Model:
 *  - `assets.quantity` = number of SHARES (parts) held.
 *  - `subscription_price` = price per share paid at subscription, INCLUDING the
 *    entry fee (`entry_fee_pct`, typically 8–12%). Invested capital =
 *    shares × price; the fee portion is not recoverable.
 *  - `withdrawal_value` = what a share is worth today if sold back (valeur de
 *    retrait); when blank it is derived as price × (1 − fee). `assets.current_value`
 *    = shares × withdrawal value.
 *  - Income is paid QUARTERLY (mid-month after the quarter, e.g. mid-April,
 *    July, October, January) and tracked in `dividends`; distribution rates
 *    (TDVM, typically 4–6%) by year in `yield_history`.
 */
export type ScpiHoldingMode = "pleine_propriete" | "nue_propriete" | "usufruit";

export const SCPI_HOLDING_MODES: ScpiHoldingMode[] = [
  "pleine_propriete",
  "nue_propriete",
  "usufruit",
];

export type ScpiDividend = {
  id: string;
  /** Payment date (ISO). */
  date: string;
  /** Gross amount received for the quarter, in the asset's currency. */
  amount: number;
  status: "received" | "expected";
  /** e.g. "T1 2026" — display only (also used to find the year a payment belongs to). */
  quarter: string;
  /** Exceptional payment (e.g. a share of capital gains); flagged in the yearly summary. */
  exceptional?: boolean;
};

export type ScpiYield = { id: string; year: number; rate: number };

/** A price revalorisation: the new per-share subscription price from `date` on (the % is derived). */
export type ScpiRevalorisation = { id: string; price: number; date: string };

/**
 * One dated publication of the management company's two reference values, per share:
 * VDRec (valeur de reconstitution) and VDRea (valeur de réalisation). `source_note` says where the
 * figures were read (e.g. "Annual report 2025, p. 12"). Entered by hand; the app never fetches them.
 */
export type ScpiIndicator = {
  id: string;
  as_of: string;
  vdrec: number | null;
  vdrea: number | null;
  source_note: string;
};

/** Caps that keep the metadata JSON small and the editors usable. */
export const SCPI_MAX_REVALORISATIONS = 20;
export const SCPI_MAX_INDICATORS = 60;
export const SCPI_MAX_REGISTER_CHARS = 500;
export const SCPI_MAX_NOTE_CHARS = 200;

/** Current shape of the SCPI metadata JSON (older rows have no version and are read as 1). */
export const SCPI_SCHEMA_VERSION = 2;

export type ScpiMetadata = {
  /** Metadata schema version; older rows lack it. Never required to read a row. */
  schema_version: number;
  /** Catalog entry the name was picked from (`src/lib/scpi-catalog.ts`), or "". */
  catalog_id: string;
  /**
   * How the name was entered: "catalog" = picked from the verified catalog, "manual" = typed
   * ("Not listed, add manually": the name is unverified), "" = unknown (rows created before).
   */
  name_source: "" | "catalog" | "manual";
  /** Date de souscription. */
  subscription_date: string;
  /** Numéros des parts (share register numbers), free text. */
  register_numbers: string;
  /** Price revalorisations, oldest to newest or in any order (sorted on read). */
  revalorisations: ScpiRevalorisation[];
  /** Dated history of VDRec / VDRea publications. */
  indicators: ScpiIndicator[];
  management_company: string;
  sector: string;
  geography: string;
  holding_mode: ScpiHoldingMode;
  financed_by_credit: boolean;
  /** Date de jouissance — when the shares start earning income. */
  jouissance_date: string;
  /** Per-share subscription price, entry fee included. */
  subscription_price: number | null;
  /** Entry fee in percent of the subscription price (typically 8–12). */
  entry_fee_pct: number | null;
  /** Per-share withdrawal value; blank = derived from price and fee. */
  withdrawal_value: number | null;
  /** Annual distribution rate the SCPI targets, in percent. */
  target_yield_pct: number | null;
  yield_history: ScpiYield[];
  dividends: ScpiDividend[];
};

export const EMPTY_SCPI_METADATA: ScpiMetadata = {
  schema_version: SCPI_SCHEMA_VERSION,
  catalog_id: "",
  name_source: "",
  subscription_date: "",
  register_numbers: "",
  revalorisations: [],
  indicators: [],
  management_company: "",
  sector: "",
  geography: "",
  holding_mode: "pleine_propriete",
  financed_by_credit: false,
  jouissance_date: "",
  subscription_price: null,
  entry_fee_pct: null,
  withdrawal_value: null,
  target_yield_pct: null,
  yield_history: [],
  dividends: [],
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function posNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * Reads stored metadata of any version. Never throws: unknown shapes become defaults, the new
 * lists are repaired row by row and capped. Rows with an invalid date or price are kept as typed
 * where the editor can show them (validation reports them); only structurally unusable rows go.
 */
export function parseScpiMetadata(raw: unknown): ScpiMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_SCPI_METADATA;
  const r = raw as Record<string, unknown> & Partial<ScpiMetadata>;
  const revalorisations: ScpiRevalorisation[] = (Array.isArray(r.revalorisations) ? (r.revalorisations as unknown[]) : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .slice(0, SCPI_MAX_REVALORISATIONS)
    .map((x, i) => ({
      id: typeof x.id === "string" && x.id ? x.id : `rev-${i}`,
      price: typeof x.price === "number" && Number.isFinite(x.price) ? x.price : 0,
      date: typeof x.date === "string" ? x.date : "",
    }));
  const indicators: ScpiIndicator[] = (Array.isArray(r.indicators) ? (r.indicators as unknown[]) : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .slice(0, SCPI_MAX_INDICATORS)
    .map((x, i) => ({
      id: typeof x.id === "string" && x.id ? x.id : `ind-${i}`,
      as_of: typeof x.as_of === "string" ? x.as_of : "",
      vdrec: posNumberOrNull(x.vdrec),
      vdrea: posNumberOrNull(x.vdrea),
      source_note: cleanText(x.source_note, SCPI_MAX_NOTE_CHARS),
    }));
  return {
    ...EMPTY_SCPI_METADATA,
    ...r,
    schema_version: SCPI_SCHEMA_VERSION,
    catalog_id: cleanText(r.catalog_id, 80),
    name_source: r.name_source === "catalog" || r.name_source === "manual" ? r.name_source : "",
    subscription_date: typeof r.subscription_date === "string" ? r.subscription_date : "",
    register_numbers: cleanText(r.register_numbers, SCPI_MAX_REGISTER_CHARS),
    revalorisations,
    indicators,
    yield_history: Array.isArray(r.yield_history) ? r.yield_history : [],
    dividends: Array.isArray(r.dividends) ? r.dividends : [],
  };
}

/** Unmet requirements as translation keys. */
export function getScpiMetadataErrors(metadata: ScpiMetadata, shares: number): string[] {
  const errors: string[] = [];
  if (!(shares > 0)) errors.push("scpi_shares_required");
  if (!(metadata.subscription_price != null && metadata.subscription_price > 0)) {
    errors.push("scpi_price_required");
  }
  const fee = metadata.entry_fee_pct;
  if (fee != null && (fee < 0 || fee >= 100)) errors.push("scpi_fee_invalid");
  if (metadata.dividends.some((d) => !d.date || !(d.amount >= 0))) errors.push("scpi_dividend_invalid");
  return errors;
}

/** Capital invested: shares × subscription price (entry fee included). */
export function scpiInvested(metadata: ScpiMetadata, shares: number): number {
  return (metadata.subscription_price ?? 0) * shares;
}

/** Entry fees paid (the part of the price that is not recoverable). */
export function scpiEntryFees(metadata: ScpiMetadata, shares: number): number {
  return (scpiInvested(metadata, shares) * (metadata.entry_fee_pct ?? 0)) / 100;
}

/** Per-share withdrawal value: the typed one, else price × (1 − entry fee). */
export function scpiWithdrawalValue(metadata: ScpiMetadata): number | null {
  if (metadata.withdrawal_value != null && metadata.withdrawal_value > 0) return metadata.withdrawal_value;
  if (metadata.subscription_price == null) return null;
  return metadata.subscription_price * (1 - (metadata.entry_fee_pct ?? 0) / 100);
}

/** What the holding is worth if the shares were sold back today. */
export function scpiCurrentValue(metadata: ScpiMetadata, shares: number): number | null {
  const unit = scpiWithdrawalValue(metadata);
  return unit == null ? null : unit * shares;
}

/** Dividends actually received (status `received`), optionally only since `from`. */
export function scpiReceived(metadata: ScpiMetadata, from?: string): number {
  return metadata.dividends
    .filter((d) => d.status === "received" && (!from || d.date >= from))
    .reduce((sum, d) => sum + d.amount, 0);
}

function minusOneYear(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/** Realised yield: dividends received over the last 12 months ÷ invested capital (percent), or null. */
export function scpiTrailingYield(metadata: ScpiMetadata, shares: number, today: string): number | null {
  const invested = scpiInvested(metadata, shares);
  if (!(invested > 0)) return null;
  const received = scpiReceived(metadata, minusOneYear(today));
  return received > 0 ? (received / invested) * 100 : null;
}

/** Average of the recorded annual distribution rates (percent), or null. */
export function scpiAverageYield(metadata: ScpiMetadata): number | null {
  const rates = metadata.yield_history.map((y) => y.rate).filter((r) => Number.isFinite(r));
  return rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
}

/** Quarterly payment dates: mid-month AFTER each quarter closes (15 Apr, 15 Jul, 15 Oct, 15 Jan). */
const PAYMENT_MONTHS = [3, 6, 9, 0]; // Apr, Jul, Oct, Jan (0-indexed)

/**
 * Generates the quarterly dividend ledger from the date de jouissance up to
 * `quarters` payments past `today`: invested × yield ÷ 4 each quarter.
 * Payments on/before today are `received` (assumed paid — each row stays
 * editable), later ones `expected`. The first payment is the first scheduled
 * date on/after the jouissance date. Returns [] without a yield or a start.
 */
export function generateQuarterlyDividends(opts: {
  invested: number;
  yieldPct: number;
  jouissanceDate: string;
  today: string;
  futureQuarters?: number;
}): ScpiDividend[] {
  const { invested, yieldPct, jouissanceDate, today } = opts;
  if (!(invested > 0) || !(yieldPct > 0) || !jouissanceDate) return [];

  const perQuarter = Math.round(((invested * yieldPct) / 100 / 4) * 100) / 100;
  const start = new Date(`${jouissanceDate}T00:00:00Z`);
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 3 * (opts.futureQuarters ?? 4));

  const out: ScpiDividend[] = [];
  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear() + 1; year++) {
    for (const month of [0, 3, 6, 9]) {
      const date = new Date(Date.UTC(year, month, 15));
      if (date < start || date > end) continue;
      const iso = date.toISOString().slice(0, 10);
      // Paid in `month` for the PREVIOUS quarter (Apr → T1, Jul → T2, Oct → T3, Jan → T4 of last year).
      const quarterIndex = PAYMENT_MONTHS.indexOf(month) + 1;
      const quarterYear = month === 0 ? year - 1 : year;
      out.push({
        id: `div-${iso}`,
        date: iso,
        amount: perQuarter,
        status: iso <= today ? "received" : "expected",
        quarter: `T${quarterIndex} ${quarterYear}`,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- Phase 1 additions: methodology of the SCPI tracking sheet ---------- */

/** Delay between subscription and entry into enjoyment, in months, by the sheet's 30.5-day rule. */
const DAYS_PER_MONTH = 30.5;

/**
 * (jouissance - subscription) / 30.5, to one decimal. Null when either date is missing/invalid
 * or the enjoyment date is before the subscription date.
 */
export function scpiEnjoymentDelayMonths(subscriptionDate: string, jouissanceDate: string): number | null {
  if (!isIsoDate(subscriptionDate) || !isIsoDate(jouissanceDate)) return null;
  const days =
    (new Date(`${jouissanceDate}T00:00:00Z`).getTime() - new Date(`${subscriptionDate}T00:00:00Z`).getTime()) /
    86_400_000;
  if (days < 0) return null;
  return Math.round((days / DAYS_PER_MONTH) * 10) / 10;
}

export type ScpiRevalorisationStep = {
  id: string;
  date: string;
  /** Price before this step (the subscription price for the first one). */
  previousPrice: number | null;
  price: number;
  /** Change versus the previous price, in percent; null when there is no previous price. */
  changePct: number | null;
};

/** Valid revalorisations (positive price, real date), oldest first, with the change of each step. */
export function scpiRevalorisationSteps(metadata: ScpiMetadata): ScpiRevalorisationStep[] {
  const valid = metadata.revalorisations
    .filter((r) => r.price > 0 && isIsoDate(r.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  let previous = metadata.subscription_price != null && metadata.subscription_price > 0 ? metadata.subscription_price : null;
  return valid.map((r) => {
    const step: ScpiRevalorisationStep = {
      id: r.id,
      date: r.date,
      previousPrice: previous,
      price: r.price,
      changePct: previous != null ? ((r.price - previous) / previous) * 100 : null,
    };
    previous = r.price;
    return step;
  });
}

/** Total revalorisation since subscription, in percent (latest price vs subscription price), or null. */
export function scpiTotalRevalorisationPct(metadata: ScpiMetadata): number | null {
  const steps = scpiRevalorisationSteps(metadata);
  const sub = metadata.subscription_price;
  if (steps.length === 0 || sub == null || !(sub > 0)) return null;
  return ((steps[steps.length - 1].price - sub) / sub) * 100;
}

/**
 * MDS: the current per-share subscription price = the latest revalorisation, else the subscription
 * price paid. (The management company's current price may differ; keep revalorisations up to date.)
 */
export function scpiCurrentSubscriptionPrice(metadata: ScpiMetadata): number | null {
  const steps = scpiRevalorisationSteps(metadata);
  if (steps.length > 0) return steps[steps.length - 1].price;
  return metadata.subscription_price != null && metadata.subscription_price > 0 ? metadata.subscription_price : null;
}

export type ScpiSaleVsPurchase = {
  /** Withdrawal value minus subscription price, per share. */
  perShare: number;
  /** The same, in percent of the subscription price. */
  pct: number;
  /** Per share x shares. */
  total: number;
};

/** Sale-minus-purchase difference ("différence vente-achat"): withdrawal value vs price paid. */
export function scpiSaleVsPurchase(metadata: ScpiMetadata, shares: number): ScpiSaleVsPurchase | null {
  const sub = metadata.subscription_price;
  const pdr = scpiWithdrawalValue(metadata);
  if (sub == null || !(sub > 0) || pdr == null || !(shares > 0)) return null;
  const perShare = pdr - sub;
  return { perShare, pct: (perShare / sub) * 100, total: perShare * shares };
}

/** Indicator rows with at least one figure and a valid date, newest first. */
export function scpiIndicatorHistory(metadata: ScpiMetadata): ScpiIndicator[] {
  return metadata.indicators
    .filter((i) => isIsoDate(i.as_of) && (i.vdrec != null || i.vdrea != null))
    .sort((a, b) => b.as_of.localeCompare(a.as_of));
}

export type ScpiRatioReading = "above" | "below" | "equal";

export type ScpiIndicatorReading = {
  asOf: string;
  vdrec: number | null;
  vdrea: number | null;
  sourceNote: string;
  /** Per-share current subscription price (MDS) the VDRec ratio is measured against. */
  mds: number | null;
  /** Per-share withdrawal price (PDR) the VDRea ratio is measured against. */
  pdr: number | null;
  /** VDRec / MDS, in percent. */
  vdrecRatioPct: number | null;
  /** VDRea / PDR, in percent. */
  vdreaRatioPct: number | null;
  vdrecReading: ScpiRatioReading | null;
  vdreaReading: ScpiRatioReading | null;
};

function readingOf(ratioPct: number | null): ScpiRatioReading | null {
  if (ratioPct == null) return null;
  const r = Math.round(ratioPct * 100) / 100;
  return r > 100 ? "above" : r < 100 ? "below" : "equal";
}

/** The latest dated indicators with the two ratios, as of that date (never advice: a reading is a fact). */
export function scpiLatestIndicators(metadata: ScpiMetadata): ScpiIndicatorReading | null {
  const latest = scpiIndicatorHistory(metadata)[0];
  if (!latest) return null;
  const mds = scpiCurrentSubscriptionPrice(metadata);
  const pdr = scpiWithdrawalValue(metadata);
  const vdrecRatioPct = latest.vdrec != null && mds != null ? (latest.vdrec / mds) * 100 : null;
  const vdreaRatioPct = latest.vdrea != null && pdr != null && pdr > 0 ? (latest.vdrea / pdr) * 100 : null;
  return {
    asOf: latest.as_of,
    vdrec: latest.vdrec,
    vdrea: latest.vdrea,
    sourceNote: latest.source_note,
    mds,
    pdr,
    vdrecRatioPct,
    vdreaRatioPct,
    vdrecReading: readingOf(vdrecRatioPct),
    vdreaReading: readingOf(vdreaRatioPct),
  };
}

/** Whether `asOf` is more than 12 months before `today` (both ISO dates). Invalid input -> true. */
export function isIndicatorStale(asOf: string, today: string): boolean {
  if (!isIsoDate(asOf) || !isIsoDate(today)) return true;
  return asOf < minusOneYear(today);
}

export type ScpiQuarterRate = {
  id: string;
  quarter: string;
  date: string;
  amount: number;
  exceptional: boolean;
  /** amount / subscription amount x 4, in percent (the sheet's quarterly rate); null without a basis. */
  ratePct: number | null;
};

export type ScpiYearSummary = {
  year: number;
  total: number;
  exceptionalTotal: number;
  /** total / subscription amount, in percent. */
  ratePct: number | null;
  /** Without exceptional payments. */
  ordinaryRatePct: number | null;
  count: number;
};

/** The year a payment belongs to: the year in its "T2 2025" label, else the year of its date. */
function dividendYear(d: ScpiDividend): number | null {
  const m = /(\d{4})/.exec(d.quarter ?? "");
  if (m) return Number(m[1]);
  return isIsoDate(d.date) ? Number(d.date.slice(0, 4)) : null;
}

/** Per-quarter rates, newest first, using the existing dividend ledger (received and expected). */
export function scpiQuarterRates(metadata: ScpiMetadata, shares: number): ScpiQuarterRate[] {
  const basis = scpiInvested(metadata, shares);
  return metadata.dividends
    .filter((d) => Number.isFinite(d.amount) && isIsoDate(d.date))
    .map((d) => ({
      id: d.id,
      quarter: d.quarter,
      date: d.date,
      amount: d.amount,
      exceptional: d.exceptional === true,
      ratePct: basis > 0 ? ((d.amount * 4) / basis) * 100 : null,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Per-year totals and rates over RECEIVED payments, newest year first. */
export function scpiYearSummaries(metadata: ScpiMetadata, shares: number): ScpiYearSummary[] {
  const basis = scpiInvested(metadata, shares);
  const byYear = new Map<number, ScpiYearSummary>();
  for (const d of metadata.dividends) {
    if (d.status !== "received" || !Number.isFinite(d.amount)) continue;
    const year = dividendYear(d);
    if (year == null) continue;
    const row = byYear.get(year) ?? { year, total: 0, exceptionalTotal: 0, ratePct: null, ordinaryRatePct: null, count: 0 };
    row.total += d.amount;
    if (d.exceptional) row.exceptionalTotal += d.amount;
    row.count += 1;
    byYear.set(year, row);
  }
  return [...byYear.values()]
    .map((row) => ({
      ...row,
      ratePct: basis > 0 ? (row.total / basis) * 100 : null,
      ordinaryRatePct: basis > 0 ? ((row.total - row.exceptionalTotal) / basis) * 100 : null,
    }))
    .sort((a, b) => b.year - a.year);
}

/* ---------- validation of the Phase 1 fields ---------- */

export type ScpiIssueCode =
  | "scpi2_err_subscription_date"
  | "scpi2_err_jouissance_date"
  | "scpi2_err_jouissance_before_subscription"
  | "scpi2_err_revalorisation_invalid"
  | "scpi2_err_revalorisations_too_many"
  | "scpi2_err_indicator_invalid"
  | "scpi2_err_indicators_too_many"
  | "scpi2_err_register_too_long";

export type ScpiIssue = { code: ScpiIssueCode; message: string };

/** English messages; the UI translates by `code` (keys of the same name) and falls back to these. */
export const SCPI_ISSUE_MESSAGES: Record<ScpiIssueCode, string> = {
  scpi2_err_subscription_date: "The subscription date is not a valid date.",
  scpi2_err_jouissance_date: "The date income starts is not a valid date.",
  scpi2_err_jouissance_before_subscription: "Income cannot start before the subscription date.",
  scpi2_err_revalorisation_invalid: "Each revalorisation needs a valid date and a price above zero.",
  scpi2_err_revalorisations_too_many: "At most 20 revalorisations can be recorded.",
  scpi2_err_indicator_invalid: "Each indicator entry needs a valid date and at least one value above zero.",
  scpi2_err_indicators_too_many: "At most 60 indicator entries can be recorded.",
  scpi2_err_register_too_long: "The share numbers can hold at most 500 characters.",
};

/**
 * Problems with the new fields, in a stable order, empty when fine. Never throws. Empty optional
 * fields are fine; the legacy checks stay in `getScpiMetadataErrors`.
 */
export function validateScpiExtras(metadata: ScpiMetadata): ScpiIssue[] {
  const codes: ScpiIssueCode[] = [];
  const add = (c: ScpiIssueCode) => {
    if (!codes.includes(c)) codes.push(c);
  };
  if (metadata.subscription_date !== "" && !isIsoDate(metadata.subscription_date)) add("scpi2_err_subscription_date");
  if (metadata.jouissance_date !== "" && !isIsoDate(metadata.jouissance_date)) add("scpi2_err_jouissance_date");
  if (
    isIsoDate(metadata.subscription_date) &&
    isIsoDate(metadata.jouissance_date) &&
    metadata.jouissance_date < metadata.subscription_date
  ) {
    add("scpi2_err_jouissance_before_subscription");
  }
  if (metadata.revalorisations.length > SCPI_MAX_REVALORISATIONS) add("scpi2_err_revalorisations_too_many");
  if (metadata.revalorisations.some((r) => !(r.price > 0) || !isIsoDate(r.date))) add("scpi2_err_revalorisation_invalid");
  if (metadata.indicators.length > SCPI_MAX_INDICATORS) add("scpi2_err_indicators_too_many");
  if (
    metadata.indicators.some(
      (i) => !isIsoDate(i.as_of) || (!(i.vdrec != null && i.vdrec > 0) && !(i.vdrea != null && i.vdrea > 0)),
    )
  ) {
    add("scpi2_err_indicator_invalid");
  }
  if (metadata.register_numbers.length > SCPI_MAX_REGISTER_CHARS) add("scpi2_err_register_too_long");
  return codes.map((code) => ({ code, message: SCPI_ISSUE_MESSAGES[code] }));
}

/** Rate used for the dashboard's weighted average: realised 12-month yield, else target, else average (percent). */
export function scpiHoldingRate(metadata: ScpiMetadata, shares: number, today: string): number | null {
  return scpiTrailingYield(metadata, shares, today) ?? metadata.target_yield_pct ?? scpiAverageYield(metadata);
}
