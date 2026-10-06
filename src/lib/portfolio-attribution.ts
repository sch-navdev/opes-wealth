/**
 * Sharesight-style performance attribution for a (possibly multi-currency)
 * holding, expressed in the user's BASE (display) currency. Pure functions.
 *
 * Notation: L = holding's local currency, B = base currency.
 *   C  = cost in L          V  = current value in L
 *   fC = base-per-local FX at cost/purchase date
 *   fN = base-per-local FX now
 *
 *   costBase     = C·fC
 *   valueBase    = V·fN
 *   totalBase    = valueBase − costBase
 *   capitalBase  = (V − C)·fC      price move valued at purchase FX
 *   currencyBase = V·(fN − fC)     FX move applied to the current value
 *   capitalBase + currencyBase === totalBase (exactly, no residual)
 *
 *   capitalPct  = V/C − 1          pure local price return (FX-independent)
 *   currencyPct = fN/fC − 1        pure FX move
 *   totalPct    = (1+capitalPct)(1+currencyPct) − 1 = totalBase/costBase
 *   capitalContributionPct  = capitalBase/costBase   } these two SUM to
 *   currencyContributionPct = currencyBase/costBase  } totalPct
 *
 * Nothing is rounded here; use `roundMoney` at the display edge.
 * Income (optional, local currency) is excluded by default; set
 * `includeIncome: true` to add it to V (a "total return" view).
 */

export type AttributionInput = {
  /** Cost in local currency. */
  costLocal: number;
  /** Current value in local currency. */
  valueLocal: number;
  /** Base-per-local FX at cost date. */
  fxAtCost: number;
  /** Base-per-local FX now. */
  fxNow: number;
  /** Local currency equals base: forces both rates to 1 (currency return 0). */
  sameCurrency?: boolean;
  /** Income received, local currency. Ignored unless `includeIncome`. */
  incomeLocal?: number;
  includeIncome?: boolean;
};

export type AttributionResult = {
  sameCurrency: boolean;
  costBase: number;
  valueBase: number;
  totalBase: number;
  capitalBase: number;
  currencyBase: number;
  /** Cost-weighted base-per-local rate at cost (equals fxAtCost for one lot). */
  fxAtCost: number;
  fxNow: number;
  /** Null when cost is 0 (percentages undefined). */
  capitalPct: number | null;
  currencyPct: number | null;
  totalPct: number | null;
  capitalContributionPct: number | null;
  currencyContributionPct: number | null;
  /** Local-currency cost/value used (value includes income when requested). */
  costLocal: number;
  valueLocal: number;
};

export function roundMoney(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
}

const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Shared builder from already-summed parts (single holding or lots). */
function build(parts: {
  costLocal: number;
  valueLocal: number;
  costBase: number;
  capitalBase: number;
  currencyBase: number;
  fxNow: number;
  sameCurrency: boolean;
}): AttributionResult {
  const { costLocal, valueLocal, costBase, capitalBase, currencyBase, fxNow, sameCurrency } = parts;
  const valueBase = valueLocal * fxNow;
  const totalBase = valueBase - costBase;
  const fxAtCost = costLocal !== 0 ? costBase / costLocal : fxNow;
  const hasCost = costLocal !== 0 && costBase !== 0;
  return {
    sameCurrency,
    costBase,
    valueBase,
    totalBase,
    capitalBase,
    currencyBase,
    fxAtCost,
    fxNow,
    capitalPct: hasCost ? valueLocal / costLocal - 1 : null,
    currencyPct: hasCost ? fxNow / fxAtCost - 1 : null,
    totalPct: hasCost ? totalBase / costBase : null,
    capitalContributionPct: hasCost ? capitalBase / costBase : null,
    currencyContributionPct: hasCost ? currencyBase / costBase : null,
    costLocal,
    valueLocal,
  };
}

/**
 * Null when amounts cannot be computed (non-finite inputs, fxAtCost <= 0 or
 * fxNow <= 0). Cost 0 still yields amounts, with null percentages.
 */
export function computeAttribution(input: AttributionInput): AttributionResult | null {
  const sameCurrency = input.sameCurrency === true;
  const fC = sameCurrency ? 1 : input.fxAtCost;
  const fN = sameCurrency ? 1 : input.fxNow;
  const C = input.costLocal;
  const V =
    input.valueLocal + (input.includeIncome && ok(input.incomeLocal) ? input.incomeLocal : 0);
  if (!ok(C) || !ok(input.valueLocal) || !ok(fC) || !ok(fN) || fC <= 0 || fN <= 0) return null;
  return build({
    costLocal: C,
    valueLocal: V,
    costBase: C * fC,
    capitalBase: (V - C) * fC,
    currencyBase: V * (fN - fC),
    fxNow: fN,
    sameCurrency,
  });
}

export type AggregateAttribution = {
  costBase: number;
  valueBase: number;
  totalBase: number;
  capitalBase: number;
  currencyBase: number;
  capitalPct: number | null;
  currencyPct: number | null;
  totalPct: number | null;
  capitalContributionPct: number | null;
  currencyContributionPct: number | null;
  /** included / total (1 when the list is empty). */
  coverage: number;
  included: number;
  total: number;
};

/**
 * Sums base amounts across holdings. Percentages are derived from the summed
 * costBase: contributions = amount / Σ costBase (they sum to totalPct);
 * capitalPct/currencyPct are the cost-weighted (base) contributions of each
 * component, i.e. identical to the contribution percentages, because holdings
 * in different currencies have no single local price return.
 */
export function aggregateAttribution(
  results: (AttributionResult | null | undefined)[],
): AggregateAttribution {
  const included = results.filter((r): r is AttributionResult => !!r);
  const sum = (f: (r: AttributionResult) => number) => included.reduce((s, r) => s + f(r), 0);
  const costBase = sum((r) => r.costBase);
  const capitalBase = sum((r) => r.capitalBase);
  const currencyBase = sum((r) => r.currencyBase);
  const valueBase = sum((r) => r.valueBase);
  const totalBase = valueBase - costBase;
  const div = (n: number) => (costBase > 0 ? n / costBase : null);
  return {
    costBase,
    valueBase,
    totalBase,
    capitalBase,
    currencyBase,
    capitalPct: div(capitalBase),
    currencyPct: div(currencyBase),
    totalPct: div(totalBase),
    capitalContributionPct: div(capitalBase),
    currencyContributionPct: div(currencyBase),
    coverage: results.length === 0 ? 1 : included.length / results.length,
    included: included.length,
    total: results.length,
  };
}

export type AttributionLot = {
  costLocal: number;
  /** Units held in this lot; used to allocate value when all lots have it. */
  quantity?: number;
  fxAtCost: number;
};

/**
 * Multiple lots bought at different FX. Current value `valueLocal` is allocated
 * to lots PRO RATA TO QUANTITY when every lot has quantity > 0 (same price per
 * unit for all lots, the correct rule for one security), otherwise pro rata to
 * cost. Then, with V_i, C_i, fC_i per lot:
 *   costBase = ΣC_i·fC_i, capitalBase = Σ(V_i−C_i)·fC_i, currencyBase = ΣV_i·(fN−fC_i)
 * so additivity holds exactly. Reported fxAtCost is the cost-weighted rate
 * ΣC_i·fC_i / ΣC_i, making (1+capitalPct)(1+currencyPct) = totalBase/costBase.
 */
export function attributionFromLots(
  lots: AttributionLot[],
  valueLocal: number,
  fxNow: number,
  opts: { sameCurrency?: boolean } = {},
): AttributionResult | null {
  const sameCurrency = opts.sameCurrency === true;
  const fN = sameCurrency ? 1 : fxNow;
  if (lots.length === 0 || !ok(valueLocal) || !ok(fN) || fN <= 0) return null;
  for (const l of lots) {
    const f = sameCurrency ? 1 : l.fxAtCost;
    if (!ok(l.costLocal) || !ok(f) || f <= 0) return null;
  }
  const totalQty = lots.reduce((s, l) => s + (l.quantity ?? 0), 0);
  const byQty = lots.every((l) => ok(l.quantity) && (l.quantity as number) > 0) && totalQty > 0;
  const totalCost = lots.reduce((s, l) => s + l.costLocal, 0);
  if (!byQty && totalCost === 0) return null;

  let costBase = 0;
  let capitalBase = 0;
  let currencyBase = 0;
  for (const l of lots) {
    const f = sameCurrency ? 1 : l.fxAtCost;
    const w = byQty ? (l.quantity as number) / totalQty : l.costLocal / totalCost;
    const v = valueLocal * w;
    costBase += l.costLocal * f;
    capitalBase += (v - l.costLocal) * f;
    currencyBase += v * (fN - f);
  }
  return build({
    costLocal: totalCost,
    valueLocal,
    costBase,
    capitalBase,
    currencyBase,
    fxNow: fN,
    sameCurrency,
  });
}
