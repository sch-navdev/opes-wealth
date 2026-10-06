/**
 * Adapter: app data -> `portfolio-attribution` inputs. Pure, no I/O; FX comes
 * in as arguments.
 *
 * FINDING on `EquityTrade.exchangeRate` / `ParsedTrade.exchangeRate`: no
 * broker parser (Saxo included) reads it from the file — it is only a UI
 * default typed in `add-investments-dialog.tsx`, with no documented currency
 * pair or direction, and it is not used in cost-basis math. It is therefore
 * AMBIGUOUS and deliberately NOT used here; every lot's FX comes from
 * `fxOnDate(tradeDate, tradeCurrency, base)` (historical ECB-based lookup).
 *
 * Conventions: every rate is base-per-local (units of `base` for 1 unit of
 * `currency`). Equity lots follow the project's average-cost convention
 * (`buildInvestedCapitalSeries`): buys add a lot costing `tradeCost(t)`; a
 * sell removes the same fraction from every open lot (so the average cost and
 * the cost-weighted FX of the remainder are unchanged). If the remaining lot
 * quantity differs from the live `quantity`, lots are scaled pro rata to match
 * `quantity` (FX weights preserved).
 *
 * Purchase assets (real estate, vehicles, private equity): purchase price and
 * date live in `assets.purchase_date` and metadata
 * (`contract_price ?? purchasePrice` for real estate, `purchase_price` for
 * vehicles); the caller resolves them and passes them in.
 */
import { tradeCost, type EquityTrade } from "./equities";
import {
  attributionFromLots,
  computeAttribution,
  type AttributionLot,
  type AttributionResult,
} from "./portfolio-attribution";

export type AttributionFailureReason =
  | "no_trades"
  | "no_open_lots"
  | "currency_mismatch"
  | "missing_purchase_price"
  | "missing_purchase_date"
  | "invalid_value"
  | "missing_fx_now"
  | "missing_fx_at_cost";

export type AttributionOutcome =
  | { ok: true; result: AttributionResult }
  | { ok: false; reason: AttributionFailureReason };

/** Base-per-local rate for `date`, or null when unknown. */
export type FxOnDate = (date: string, from: string, to: string) => number | null;

const validRate = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

export function buildEquityAttribution(args: {
  trades: EquityTrade[];
  quantity: number;
  currentValueLocal: number;
  currency: string;
  base: string;
  /** Base-per-local now. */
  fxNow: number | null;
  fxOnDate: FxOnDate;
}): AttributionOutcome {
  const { trades, quantity, currentValueLocal, currency, base, fxNow, fxOnDate } = args;
  if (!Number.isFinite(currentValueLocal)) return { ok: false, reason: "invalid_value" };
  if (trades.length === 0) return { ok: false, reason: "no_trades" };
  if (trades.some((t) => t.currency !== currency)) return { ok: false, reason: "currency_mismatch" };
  const same = currency === base;
  if (!same && !validRate(fxNow)) return { ok: false, reason: "missing_fx_now" };

  const sorted = [...trades].sort(
    (a, b) =>
      a.tradeDate.localeCompare(b.tradeDate) ||
      (a.side === b.side ? 0 : a.side === "buy" ? -1 : 1),
  );
  let lots: { quantity: number; costLocal: number; date: string }[] = [];
  for (const t of sorted) {
    if (t.side === "buy") {
      lots.push({ quantity: t.quantity, costLocal: tradeCost(t), date: t.tradeDate });
    } else {
      const held = lots.reduce((s, l) => s + l.quantity, 0);
      if (held <= 0) continue;
      const keep = 1 - Math.min(t.quantity, held) / held;
      lots = lots.map((l) => ({ ...l, quantity: l.quantity * keep, costLocal: l.costLocal * keep }));
    }
  }
  lots = lots.filter((l) => l.quantity > 1e-12);
  const held = lots.reduce((s, l) => s + l.quantity, 0);
  if (lots.length === 0 || !(quantity > 0)) return { ok: false, reason: "no_open_lots" };
  if (Math.abs(held - quantity) > 1e-9 * Math.max(1, quantity)) {
    const k = quantity / held;
    lots = lots.map((l) => ({ ...l, quantity: l.quantity * k, costLocal: l.costLocal * k }));
  }

  const attrLots: AttributionLot[] = [];
  for (const l of lots) {
    const fx = same ? 1 : fxOnDate(l.date, currency, base);
    if (!same && !validRate(fx)) return { ok: false, reason: "missing_fx_at_cost" };
    attrLots.push({ costLocal: l.costLocal, quantity: l.quantity, fxAtCost: fx as number });
  }
  const result = attributionFromLots(attrLots, currentValueLocal, same ? 1 : (fxNow as number), {
    sameCurrency: same,
  });
  return result ? { ok: true, result } : { ok: false, reason: "invalid_value" };
}

export function buildPurchaseAttribution(args: {
  purchasePriceLocal: number | null | undefined;
  purchaseDate: string | null | undefined;
  currentValueLocal: number;
  currency: string;
  base: string;
  fxNow: number | null;
  fxOnDate: FxOnDate;
}): AttributionOutcome {
  const { purchasePriceLocal, purchaseDate, currentValueLocal, currency, base, fxNow, fxOnDate } =
    args;
  if (!(typeof purchasePriceLocal === "number" && purchasePriceLocal > 0)) {
    return { ok: false, reason: "missing_purchase_price" };
  }
  if (!purchaseDate) return { ok: false, reason: "missing_purchase_date" };
  if (!Number.isFinite(currentValueLocal)) return { ok: false, reason: "invalid_value" };
  const same = currency === base;
  if (!same && !validRate(fxNow)) return { ok: false, reason: "missing_fx_now" };
  const fC = same ? 1 : fxOnDate(purchaseDate, currency, base);
  if (!same && !validRate(fC)) return { ok: false, reason: "missing_fx_at_cost" };
  const result = computeAttribution({
    costLocal: purchasePriceLocal,
    valueLocal: currentValueLocal,
    fxAtCost: fC as number,
    fxNow: same ? 1 : (fxNow as number),
    sameCurrency: same,
  });
  return result ? { ok: true, result } : { ok: false, reason: "invalid_value" };
}
