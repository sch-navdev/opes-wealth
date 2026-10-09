import { convertToBaseCurrency } from "@/lib/fx";
import {
  isIndicatorStale,
  parseScpiMetadata,
  scpiHoldingRate,
  scpiInvested,
  scpiLatestIndicators,
  type ScpiRatioReading,
} from "@/lib/scpi";

/** The fields of an asset row the SCPI dashboard block reads (a subset of the page's AssetRow). */
export type ScpiBlockAsset = {
  id: string;
  name: string;
  quantity: number;
  current_value: number;
  currency: string;
  is_liability?: boolean;
  metadata: Record<string, unknown> | null;
  asset_categories: { name: string } | null;
};

export type ScpiBlockHolding = {
  id: string;
  name: string;
  managementCompany: string;
  /** Current value in the base currency. */
  valueBase: number;
  /** Capital invested in the base currency (the weight of the rate average). */
  investedBase: number;
  /** Realised 12-month yield, else target, else average of recorded rates; percent. */
  ratePct: number | null;
  /** Date of the latest indicator entry, or null when none. */
  asOf: string | null;
  /** More than 12 months old (only meaningful with an `asOf`). */
  stale: boolean;
  vdrecRatioPct: number | null;
  vdreaRatioPct: number | null;
  vdrecReading: ScpiRatioReading | null;
  vdreaReading: ScpiRatioReading | null;
};

export type ScpiBlockData = {
  holdings: ScpiBlockHolding[];
  /** Sum of the holdings' values, base currency. */
  totalValueBase: number;
  /** Rate weighted by invested capital over the holdings that have a rate; null when none. */
  weightedRatePct: number | null;
};

/**
 * Pure builder of the dashboard SCPI block: SCPI holdings only (not liabilities), largest first,
 * everything in the base currency. Never throws on odd metadata.
 */
export function buildScpiBlockData(
  assets: readonly ScpiBlockAsset[],
  baseCurrency: string,
  rates: Record<string, number>,
  today: string,
): ScpiBlockData {
  const holdings: ScpiBlockHolding[] = [];
  for (const asset of assets) {
    if (asset.asset_categories?.name !== "SCPI" || asset.is_liability) continue;
    const md = parseScpiMetadata(asset.metadata);
    const latest = scpiLatestIndicators(md);
    const toBase = (n: number) => convertToBaseCurrency(n, asset.currency, baseCurrency, rates);
    holdings.push({
      id: asset.id,
      name: asset.name,
      managementCompany: md.management_company,
      valueBase: toBase(asset.current_value),
      investedBase: toBase(scpiInvested(md, asset.quantity)),
      ratePct: scpiHoldingRate(md, asset.quantity, today),
      asOf: latest?.asOf ?? null,
      stale: latest ? isIndicatorStale(latest.asOf, today) : false,
      vdrecRatioPct: latest?.vdrecRatioPct ?? null,
      vdreaRatioPct: latest?.vdreaRatioPct ?? null,
      vdrecReading: latest?.vdrecReading ?? null,
      vdreaReading: latest?.vdreaReading ?? null,
    });
  }
  holdings.sort((a, b) => b.valueBase - a.valueBase || a.name.localeCompare(b.name));

  const weighted = holdings.filter((h) => h.ratePct != null && h.investedBase > 0);
  const weight = weighted.reduce((sum, h) => sum + h.investedBase, 0);
  return {
    holdings,
    totalValueBase: holdings.reduce((sum, h) => sum + h.valueBase, 0),
    weightedRatePct:
      weight > 0 ? weighted.reduce((sum, h) => sum + (h.ratePct as number) * h.investedBase, 0) / weight : null,
  };
}
