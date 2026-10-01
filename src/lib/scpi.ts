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
  /** e.g. "T1 2026" — display only. */
  quarter: string;
};

export type ScpiYield = { id: string; year: number; rate: number };

export type ScpiMetadata = {
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

export function parseScpiMetadata(raw: unknown): ScpiMetadata {
  if (!raw || typeof raw !== "object") return EMPTY_SCPI_METADATA;
  const r = raw as Partial<ScpiMetadata>;
  return {
    ...EMPTY_SCPI_METADATA,
    ...r,
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
