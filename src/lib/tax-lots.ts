/**
 * Tax-lot accounting for an Equities holding (pure, no I/O).
 *
 * Matches every sell in the trade ledger (`EquityTrade[]`, see `equities.ts`) to the
 * purchase lots it consumed, under one of four common methods, and reports the open lots,
 * the realised matches and their totals. Informational only: there is no tax computation
 * here (no rates, allowances, wash-sale or bed-and-breakfast rules); which method applies,
 * if any, depends on the owner's tax residency. Equities are the only class with a trade
 * ledger; crypto holdings have none, so they have no lots.
 *
 * Conventions:
 *  - Processing order: trade date (YYYY-MM-DD), buys before sells on the same date, then
 *    input order (stable), the same date/side ordering as `buildInvestedCapitalSeries`.
 *  - Buy cost and sell proceeds come from `tradeCost` (the broker's booked amount when it
 *    is plausible, else quantity x price). `brokerage` is added to a buy's cost / taken off
 *    a sell's proceeds only when `tradeCost` fell back to quantity x price: a Saxo booked
 *    amount is the full cash effect and already includes the commission (see
 *    `enrichFromTransactions` in `parsers/saxo.ts`), so adding it again would double count.
 *  - A sell larger than the open quantity matches what exists; the rest is reported as an
 *    `oversold` warning (never a negative lot) and its proceeds are not counted.
 *  - Trades in another currency than the holding's are left out with a warning (amounts in
 *    two currencies are never mixed). A missing trade currency is taken as the holding's.
 *  - Trades with a zero/negative/non-finite quantity or price, an unknown side or an
 *    unreadable date are left out with a warning.
 *  - `average`: the cost of each sale is the running average cost of the pool (exactly the
 *    `buildInvestedCapitalSeries` math, so the remaining cost basis equals that series' last
 *    value when there are no separate brokerage fees); holding periods assume the oldest
 *    shares are sold first, and every open lot carries the pool's average unit cost.
 *  - `hifo`: the highest unit cost first; ties go to the oldest lot.
 */
import { tradeCost, type EquityTrade } from "@/lib/equities";

export type LotMethod = "fifo" | "lifo" | "hifo" | "average";

export const LOT_METHODS: readonly LotMethod[] = ["fifo", "lifo", "hifo", "average"];

export function isLotMethod(value: unknown): value is LotMethod {
  return typeof value === "string" && (LOT_METHODS as readonly string[]).includes(value);
}

export type OpenLot = {
  /** Id of the buy trade that opened this lot. */
  buyTradeId: string;
  /** Purchase date (YYYY-MM-DD). */
  date: string;
  /** Quantity bought by that trade. */
  originalQuantity: number;
  /** Quantity still held from this lot. */
  quantity: number;
  unitCost: number;
  /** Cost basis of the remaining quantity. */
  cost: number;
  /** Days held as of `asOf`. */
  heldDays: number;
  /** Held for at least twelve calendar months as of `asOf` (a neutral marker, not a tax status). */
  heldOverYear: boolean;
  /** Remaining quantity x current unit price; `null` without a price. */
  value: number | null;
  unrealisedGain: number | null;
};

export type RealisedMatch = {
  sellTradeId: string;
  sellDate: string;
  buyTradeId: string;
  lotDate: string;
  quantity: number;
  /** This match's share of the sell's (net) proceeds. */
  proceeds: number;
  cost: number;
  gain: number;
  holdingDays: number;
  heldOverYear: boolean;
};

export type YearRealised = { year: number; proceeds: number; cost: number; gain: number };

export type LotWarning =
  | { kind: "oversold"; tradeId: string; date: string; quantity: number }
  | { kind: "currency_mismatch"; tradeId: string; date: string; currency: string }
  | { kind: "invalid_trade"; tradeId: string; date: string }
  | { kind: "quantity_mismatch"; lotQuantity: number; heldQuantity: number };

export type LotMatchResult = {
  method: LotMethod;
  currency: string;
  openLots: OpenLot[];
  matches: RealisedMatch[];
  /** Realised totals by calendar year of the sell, oldest year first. */
  realisedByYear: YearRealised[];
  totalProceeds: number;
  totalRealisedCost: number;
  totalRealised: number;
  /** Cost basis of everything still held. */
  remainingCost: number;
  openQuantity: number;
  currentUnitPrice: number | null;
  /** Open quantity x current unit price; `null` without a price. */
  marketValue: number | null;
  unrealisedGain: number | null;
  warnings: LotWarning[];
  /** Number of trades that went into the matching (after exclusions). */
  tradesUsed: number;
};

export type MatchLotsOptions = {
  /** The holding's currency; trades in any other currency are left out. */
  currency: string;
  /** Current price per share in `currency` (see `unitPriceFromHolding`); `null`/absent = no unrealised figures. */
  currentUnitPrice?: number | null;
  /** Date the open lots' held days are measured to (YYYY-MM-DD). Defaults to today (UTC). */
  asOf?: string;
  /** The holding's recorded quantity, to flag a ledger that does not add up to it. */
  heldQuantity?: number | null;
};

/** Quantities below this are treated as zero (float residue of fractional shares). */
const QTY_EPS = 1e-9;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** The current price per share implied by a holding: `current_value / quantity`, or `null` when nothing is held. */
export function unitPriceFromHolding(quantity: number, currentValue: number): number | null {
  if (!(quantity > 0) || !Number.isFinite(currentValue) || !Number.isFinite(quantity)) return null;
  return currentValue / quantity;
}

function dayNumber(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD), never negative. */
export function daysBetween(from: string, to: string): number {
  const d = Math.round(dayNumber(to) - dayNumber(from));
  return Number.isFinite(d) ? Math.max(0, d) : 0;
}

/** True when `to` is at least twelve calendar months after `from` (29 Feb + 1 year = 1 Mar). */
export function heldTwelveMonths(from: string, to: string): boolean {
  const m = DATE_RE.exec(from);
  if (!m || !DATE_RE.test(to)) return false;
  const anniversary = new Date(Date.UTC(Number(m[1]) + 1, Number(m[2]) - 1, Number(m[3])))
    .toISOString()
    .slice(0, 10);
  return to.slice(0, 10) >= anniversary;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

type PreparedTrade = {
  id: string;
  date: string;
  side: "buy" | "sell";
  quantity: number;
  /** Buy: total cost incl. fee. Sell: net proceeds. */
  amount: number;
  index: number;
};

type WorkingLot = {
  buyTradeId: string;
  date: string;
  originalQuantity: number;
  quantity: number;
  /** Remaining cost (specific-lot methods); unused by `average`, which prices from the pool. */
  cost: number;
  unitCost: number;
  seq: number;
};

function normalizeCurrency(c: unknown): string {
  return typeof c === "string" ? c.trim().toUpperCase() : "";
}

/** Total cash amount of a valid trade: cost (+ fee) for a buy, proceeds (- fee) for a sell. */
function tradeAmount(t: EquityTrade): number {
  const gross = t.quantity * t.price;
  const base = tradeCost(t);
  const fee =
    base === gross && typeof t.brokerage === "number" && Number.isFinite(t.brokerage) && t.brokerage > 0
      ? t.brokerage
      : 0;
  return t.side === "buy" ? base + fee : base - fee;
}

function prepare(
  trades: readonly EquityTrade[],
  currency: string,
  warnings: LotWarning[],
): PreparedTrade[] {
  const holdingCurrency = normalizeCurrency(currency);
  const out: PreparedTrade[] = [];
  trades.forEach((t, index) => {
    const id = typeof t?.id === "string" && t.id ? t.id : `#${index + 1}`;
    const rawDate = typeof t?.tradeDate === "string" ? t.tradeDate : "";
    const date = DATE_RE.test(rawDate) ? rawDate.slice(0, 10) : "";
    const valid =
      !!date &&
      (t.side === "buy" || t.side === "sell") &&
      typeof t.quantity === "number" &&
      Number.isFinite(t.quantity) &&
      t.quantity > 0 &&
      typeof t.price === "number" &&
      Number.isFinite(t.price) &&
      t.price > 0;
    if (!valid) {
      warnings.push({ kind: "invalid_trade", tradeId: id, date: date || rawDate });
      return;
    }
    const tradeCurrency = normalizeCurrency(t.currency);
    if (tradeCurrency && holdingCurrency && tradeCurrency !== holdingCurrency) {
      warnings.push({ kind: "currency_mismatch", tradeId: id, date, currency: tradeCurrency });
      return;
    }
    out.push({ id, date, side: t.side, quantity: t.quantity, amount: tradeAmount(t), index });
  });
  return out.sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      (a.side === b.side ? 0 : a.side === "buy" ? -1 : 1) ||
      a.index - b.index,
  );
}

/** Index of the next lot to consume under a specific-lot method. */
function pickLot(lots: WorkingLot[], method: LotMethod): number {
  if (method === "lifo") return lots.length - 1;
  if (method === "hifo") {
    let best = 0;
    for (let i = 1; i < lots.length; i++) {
      // Strictly greater keeps the oldest lot on a tie (lots are in acquisition order).
      if (lots[i].unitCost > lots[best].unitCost) best = i;
    }
    return best;
  }
  return 0; // fifo and average (holding periods: oldest first)
}

/**
 * Matches sells to purchase lots. See the module comment for the conventions; amounts are
 * in `opts.currency`, for the whole holding (scale for a co-owner's share when displaying).
 */
export function matchLots(
  trades: readonly EquityTrade[],
  method: LotMethod,
  opts: MatchLotsOptions,
): LotMatchResult {
  const warnings: LotWarning[] = [];
  const prepared = prepare(trades ?? [], opts.currency, warnings);
  const asOf = opts.asOf && DATE_RE.test(opts.asOf) ? opts.asOf.slice(0, 10) : todayUtc();

  const lots: WorkingLot[] = [];
  const matches: RealisedMatch[] = [];
  // Running pool for the average method (mirrors `buildInvestedCapitalSeries`).
  let poolQty = 0;
  let poolCost = 0;
  let seq = 0;

  for (const trade of prepared) {
    if (trade.side === "buy") {
      lots.push({
        buyTradeId: trade.id,
        date: trade.date,
        originalQuantity: trade.quantity,
        quantity: trade.quantity,
        cost: trade.amount,
        unitCost: trade.amount / trade.quantity,
        seq: seq++,
      });
      poolQty += trade.quantity;
      poolCost += trade.amount;
      continue;
    }

    const proceedsPerUnit = trade.amount / trade.quantity;
    const available = lots.reduce((s, l) => s + l.quantity, 0);
    const matchable = Math.min(trade.quantity, available);
    // Average method: the whole sale is costed at the pool average; the pool empties exactly.
    const averageCost =
      method === "average" && matchable > QTY_EPS
        ? matchable >= poolQty - QTY_EPS
          ? poolCost
          : (poolCost / poolQty) * matchable
        : 0;

    let remaining = trade.quantity;
    while (remaining > QTY_EPS && lots.length > 0) {
      const i = pickLot(lots, method);
      const lot = lots[i];
      const take = Math.min(remaining, lot.quantity);
      const fullLot = take >= lot.quantity - QTY_EPS;
      let cost: number;
      if (method === "average") {
        cost = averageCost * (take / matchable);
      } else {
        cost = fullLot ? lot.cost : lot.cost * (take / lot.quantity);
        lot.cost -= cost;
      }
      const proceeds = proceedsPerUnit * take;
      matches.push({
        sellTradeId: trade.id,
        sellDate: trade.date,
        buyTradeId: lot.buyTradeId,
        lotDate: lot.date,
        quantity: take,
        proceeds,
        cost,
        gain: proceeds - cost,
        holdingDays: daysBetween(lot.date, trade.date),
        heldOverYear: heldTwelveMonths(lot.date, trade.date),
      });
      remaining -= take;
      if (fullLot) lots.splice(i, 1);
      else lot.quantity -= take;
    }

    // The pool is only read by the average method (its unit cost and remaining cost).
    if (method === "average" && matchable > QTY_EPS) {
      if (matchable >= poolQty - QTY_EPS) {
        poolQty = 0;
        poolCost = 0;
      } else {
        poolQty -= matchable;
        poolCost -= averageCost;
      }
    }

    if (remaining > QTY_EPS) {
      warnings.push({ kind: "oversold", tradeId: trade.id, date: trade.date, quantity: remaining });
    }
  }

  const price =
    typeof opts.currentUnitPrice === "number" && Number.isFinite(opts.currentUnitPrice) && opts.currentUnitPrice >= 0
      ? opts.currentUnitPrice
      : null;
  const poolUnitCost = poolQty > QTY_EPS ? poolCost / poolQty : 0;

  const openLots: OpenLot[] = lots
    .sort((a, b) => a.seq - b.seq)
    .map((lot) => {
      const unitCost = method === "average" ? poolUnitCost : lot.unitCost;
      const cost = method === "average" ? poolUnitCost * lot.quantity : lot.cost;
      const value = price != null ? price * lot.quantity : null;
      return {
        buyTradeId: lot.buyTradeId,
        date: lot.date,
        originalQuantity: lot.originalQuantity,
        quantity: lot.quantity,
        unitCost,
        cost,
        heldDays: daysBetween(lot.date, asOf),
        heldOverYear: heldTwelveMonths(lot.date, asOf),
        value,
        unrealisedGain: value != null ? value - cost : null,
      };
    });

  const byYear = new Map<number, YearRealised>();
  for (const m of matches) {
    const year = Number(m.sellDate.slice(0, 4));
    const row = byYear.get(year) ?? { year, proceeds: 0, cost: 0, gain: 0 };
    row.proceeds += m.proceeds;
    row.cost += m.cost;
    row.gain += m.gain;
    byYear.set(year, row);
  }
  const realisedByYear = [...byYear.values()].sort((a, b) => a.year - b.year);

  const sum = <T>(list: T[], pick: (x: T) => number) => list.reduce((s, x) => s + pick(x), 0);
  const openQuantity = sum(openLots, (l) => l.quantity);
  const remainingCost = method === "average" ? poolCost : sum(openLots, (l) => l.cost);
  const marketValue = price != null ? price * openQuantity : null;

  const held = opts.heldQuantity;
  if (typeof held === "number" && Number.isFinite(held)) {
    const tolerance = Math.max(1e-6, Math.abs(held) * 1e-6);
    if (Math.abs(openQuantity - held) > tolerance) {
      warnings.push({ kind: "quantity_mismatch", lotQuantity: openQuantity, heldQuantity: held });
    }
  }

  return {
    method,
    currency: opts.currency,
    openLots,
    matches,
    realisedByYear,
    totalProceeds: sum(matches, (m) => m.proceeds),
    totalRealisedCost: sum(matches, (m) => m.cost),
    totalRealised: sum(matches, (m) => m.gain),
    remainingCost,
    openQuantity,
    currentUnitPrice: price,
    marketValue,
    unrealisedGain: marketValue != null ? marketValue - remainingCost : null,
    warnings,
    tradesUsed: prepared.length,
  };
}
