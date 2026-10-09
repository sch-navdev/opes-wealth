import { convertToBaseCurrency } from "@/lib/fx";
import {
  buildFundLedger,
  buildPortfolioLiquidity,
  scaleFundLedger,
  upcomingCalls,
  type FundLedger,
  type PortfolioLiquidity,
} from "@/lib/pe-liquidity";
import { parsePrivateEquityMetadata } from "@/lib/private-equity";

/**
 * Plain-JSON data for the Expert "Private-market liquidity" block: one row per Private Equity fund, the
 * portfolio roll-up and the capital calls due in the next 12 months, all in the Base Currency. Pure, no I/O.
 * Inputs are the dashboard's assets, already scaled to the viewer's ownership share (ratios do not depend on it).
 * A missing figure is `null` (the panel shows an en dash), never 0 or NaN.
 */

export type PeLiquidityAssetInput = {
  id: string;
  name: string;
  current_value: number;
  currency: string;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  asset_categories: { name: string } | null;
};

export type PeLiquidityRow = {
  id: string;
  name: string;
  currency: string;
  /** Money columns in the Base Currency; null when there is nothing to show. */
  paidIn: number | null;
  unfunded: number | null;
  nav: number | null;
  distributed: number | null;
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  /** Annualised net IRR as a fraction, or null with the reason in `irrGap`. */
  netIrr: number | null;
  irrGap: FundLedger["netIrrGap"];
};

export type PeUpcomingCall = {
  assetId: string;
  fund: string;
  callId: string;
  dueDate: string;
  /** Base Currency. */
  amount: number;
  overdue: boolean;
};

export type PeLiquidityData = {
  rows: PeLiquidityRow[];
  portfolio: Pick<PortfolioLiquidity, "dpi" | "rvpi" | "tvpi" | "netIrr" | "undatedFunds"> & {
    paidIn: number | null;
    unfunded: number | null;
    nav: number | null;
    distributed: number | null;
  };
  upcoming: PeUpcomingCall[];
  upcomingTotal: number;
  /** The ISO day the figures were computed for (anchors the 12-month strip). */
  today: string;
};

const finite = (n: number | null | undefined): number | null => (typeof n === "number" && Number.isFinite(n) ? n : null);
const orNull = (n: number, show: boolean): number | null => (show ? finite(n) : null);

export function buildPeLiquidityData(
  assets: PeLiquidityAssetInput[],
  displayCurrency: string,
  rates: Record<string, number>,
  today: string,
): PeLiquidityData {
  const funds = assets.filter((a) => !a.is_liability && a.asset_categories?.name === "Private Equity");
  const factorOf = (currency: string) => finite(convertToBaseCurrency(1, currency, displayCurrency, rates)) ?? 1;

  const parsed = funds.map((a) => ({ asset: a, md: parsePrivateEquityMetadata(a.metadata), factor: factorOf(a.currency) }));
  const ledgers = parsed.map((p) => scaleFundLedger(buildFundLedger(p.md, p.asset.current_value, today), p.factor));

  const rows: PeLiquidityRow[] = parsed.map((p, i) => {
    const l = ledgers[i];
    const hasData = l.paidIn > 0 || l.distributed > 0;
    const hasUnfunded = p.md.commitment_amount != null || p.md.capital_calls.length > 0;
    return {
      id: p.asset.id,
      name: p.asset.name,
      currency: p.asset.currency,
      paidIn: orNull(l.paidIn, l.paidIn > 0),
      unfunded: orNull(l.unfunded, hasUnfunded),
      nav: orNull(l.nav, l.nav > 0),
      distributed: orNull(l.distributed, hasData),
      dpi: finite(l.dpi),
      rvpi: finite(l.rvpi),
      tvpi: finite(l.tvpi),
      netIrr: finite(l.netIrr),
      irrGap: l.netIrrGap,
    };
  });

  const total = buildPortfolioLiquidity(ledgers);
  const anyPaid = total.paidIn > 0;
  const portfolio: PeLiquidityData["portfolio"] = {
    paidIn: orNull(total.paidIn, anyPaid),
    unfunded: orNull(total.unfunded, rows.some((r) => r.unfunded != null)),
    nav: orNull(total.nav, total.nav > 0),
    distributed: orNull(total.distributed, anyPaid || total.distributed > 0),
    dpi: finite(total.dpi),
    rvpi: finite(total.rvpi),
    tvpi: finite(total.tvpi),
    netIrr: finite(total.netIrr),
    undatedFunds: total.undatedFunds,
  };

  const factorById = new Map(parsed.map((p) => [p.asset.id, p.factor]));
  const upcoming: PeUpcomingCall[] = upcomingCalls(
    parsed.map((p) => ({ assetId: p.asset.id, name: p.asset.name, md: p.md })),
    today,
    365,
  ).map((c) => ({
    assetId: c.assetId,
    fund: c.fund,
    callId: c.callId,
    dueDate: c.dueDate,
    amount: c.amount * (factorById.get(c.assetId) ?? 1),
    overdue: c.overdue,
  }));

  return { rows, portfolio, upcoming, upcomingTotal: upcoming.reduce((s, c) => s + c.amount, 0), today };
}
