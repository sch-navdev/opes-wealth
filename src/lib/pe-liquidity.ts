import { xirr } from "@/lib/irr";
import type { DatedFlow } from "@/lib/irr-compare-types";
import {
  calledCapital,
  distributedCapital,
  unfundedCommitment,
  type CapitalCall,
  type PrivateEquityMetadata,
} from "@/lib/private-equity";

/**
 * Private-market liquidity: the capital account of a fund, built from the dated calls and distributions in
 * `assets.metadata` (see `lib/private-equity.ts`). Pure, no I/O. ACTUALS ONLY: projected distributions never
 * enter these figures (they stay out of net worth as everywhere else in the app).
 *
 * Definitions (all on the investor's paid-in capital; a fund with nothing paid in has no ratios):
 *  - paid-in   = paid capital calls (or the hand-entered called capital when there is no schedule)
 *  - unfunded  = commitment - paid-in, never negative
 *  - DPI  = distributions received / paid-in
 *  - RVPI = current NAV / paid-in
 *  - TVPI = DPI + RVPI (identical to the Expert panel's (NAV + distributions) / paid-in)
 *  - net IRR = XIRR of dated paid calls (out), dated distributions (in) and the NAV as a terminal value.
 *    It is `null`, never a guess, when the flows are not all dated (a hand-entered called capital, or only the
 *    legacy undated distribution lump), when there is no sign change, or when no rate solves.
 */

export type FundLedger = {
  commitment: number | null;
  paidIn: number;
  unfunded: number;
  distributed: number;
  nav: number;
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  /** Annualised net IRR as a fraction (0.12 = 12%), or null. */
  netIrr: number | null;
  /** Why `netIrr` is null (for an explanatory hint), or null when it is available. */
  netIrrGap: "no_paid_in" | "undated_flows" | "no_solution" | null;
  /** The dated cash flows behind the IRR (calls negative, distributions positive, NAV last). Empty when undated. */
  flows: DatedFlow[];
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function callDate(call: CapitalCall): string {
  return call.paid_date && ISO_DAY.test(call.paid_date) ? call.paid_date : call.due_date;
}

/** The ledger of one fund. `nav` is in the fund currency, `today` is an ISO day (injected for determinism). */
export function buildFundLedger(md: PrivateEquityMetadata, nav: number, today: string): FundLedger {
  const paidIn = calledCapital(md);
  const distributed = distributedCapital(md);
  const safeNav = Number.isFinite(nav) && nav > 0 ? nav : 0;
  const ratio = (n: number) => (paidIn > 0 ? n / paidIn : null);

  const base = {
    commitment: md.commitment_amount,
    paidIn,
    unfunded: unfundedCommitment(md),
    distributed,
    nav: safeNav,
    dpi: ratio(distributed),
    rvpi: ratio(safeNav),
    tvpi: ratio(distributed + safeNav),
  };

  if (!(paidIn > 0)) return { ...base, netIrr: null, netIrrGap: "no_paid_in", flows: [] };

  const scheduled = md.capital_calls.length > 0;
  const lumpOnly = md.distributions.length === 0 && distributed > 0;
  if (!scheduled || lumpOnly) return { ...base, netIrr: null, netIrrGap: "undated_flows", flows: [] };

  const flows: DatedFlow[] = [];
  for (const c of md.capital_calls) {
    if (c.status === "paid" && ISO_DAY.test(callDate(c))) flows.push({ date: callDate(c), amount: -c.amount });
  }
  for (const d of md.distributions) flows.push({ date: d.date, amount: d.amount });
  if (safeNav > 0) {
    const last = flows.reduce((m, f) => (f.date > m ? f.date : m), "");
    const navDay = ISO_DAY.test(md.nav_date) ? md.nav_date : today;
    flows.push({ date: navDay > last ? navDay : last || today, amount: safeNav });
  }

  const result = xirr(flows);
  return result.ok
    ? { ...base, netIrr: result.rate, netIrrGap: null, flows }
    : { ...base, netIrr: null, netIrrGap: "no_solution", flows };
}

/** Multiplies every money amount (and flow) of a ledger, e.g. by an FX rate into the base currency. Ratios are unchanged. */
export function scaleFundLedger(l: FundLedger, factor: number): FundLedger {
  return {
    ...l,
    commitment: l.commitment == null ? null : l.commitment * factor,
    paidIn: l.paidIn * factor,
    unfunded: l.unfunded * factor,
    distributed: l.distributed * factor,
    nav: l.nav * factor,
    flows: l.flows.map((f) => ({ date: f.date, amount: f.amount * factor })),
  };
}

export type PortfolioLiquidity = {
  funds: number;
  commitment: number;
  paidIn: number;
  unfunded: number;
  distributed: number;
  nav: number;
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  /** Pooled net IRR over every fund whose flows are dated, or null. */
  netIrr: number | null;
  /** Funds left out of the pooled IRR because their flows are undated. */
  undatedFunds: number;
};

/**
 * Roll-up in ONE currency (callers scale each ledger first). Ratios come from the SUMMED paid-in, distributions
 * and NAV, never from averaging the funds' ratios, so a large fund weighs more than a small one.
 */
export function buildPortfolioLiquidity(ledgers: FundLedger[]): PortfolioLiquidity {
  const sum = (pick: (l: FundLedger) => number) => ledgers.reduce((t, l) => t + pick(l), 0);
  const paidIn = sum((l) => l.paidIn);
  const distributed = sum((l) => l.distributed);
  const nav = sum((l) => l.nav);
  const dated = ledgers.filter((l) => l.flows.length > 0);
  const pooled = dated.length > 0 ? xirr(dated.flatMap((l) => l.flows)) : null;
  const ratio = (n: number) => (paidIn > 0 ? n / paidIn : null);
  return {
    funds: ledgers.length,
    commitment: sum((l) => l.commitment ?? 0),
    paidIn,
    unfunded: sum((l) => l.unfunded),
    distributed,
    nav,
    dpi: ratio(distributed),
    rvpi: ratio(nav),
    tvpi: ratio(distributed + nav),
    netIrr: pooled?.ok ? pooled.rate : null,
    undatedFunds: ledgers.filter((l) => l.paidIn > 0 && l.flows.length === 0).length,
  };
}

export type UpcomingCall = {
  assetId: string;
  fund: string;
  callId: string;
  dueDate: string;
  amount: number;
  overdue: boolean;
};

/**
 * Pending capital calls due within `horizonDays` of `today`, plus every overdue one (due before today and still
 * pending), earliest first. Amounts are in the fund currency; the caller converts for display.
 */
export function upcomingCalls(
  funds: { assetId: string; name: string; md: PrivateEquityMetadata }[],
  today: string,
  horizonDays = 365,
): UpcomingCall[] {
  const end = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return [];
  end.setUTCDate(end.getUTCDate() + horizonDays);
  const limit = end.toISOString().slice(0, 10);
  const out: UpcomingCall[] = [];
  for (const f of funds) {
    for (const c of f.md.capital_calls) {
      if (c.status !== "pending" || !ISO_DAY.test(c.due_date) || !(c.amount > 0)) continue;
      if (c.due_date > limit) continue;
      out.push({ assetId: f.assetId, fund: f.name, callId: c.id, dueDate: c.due_date, amount: c.amount, overdue: c.due_date < today });
    }
  }
  return out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
}
