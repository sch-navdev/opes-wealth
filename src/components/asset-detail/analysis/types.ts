import type { AnalysisPortfolio } from "@/lib/asset-analysis/common";
import type { StoredTransactionRow } from "@/lib/transaction-detail";

/** The asset as the Analysis tab reads it (structurally the detail page's `AssetDetail`). */
export type AnalysisAsset = {
  id: string;
  name: string;
  quantity: number;
  current_value: number;
  currency: string;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  ticker_symbol: string | null;
  purchase_date: string;
  asset_categories: { name: string } | null;
};

export type AnalysisHistoryRow = { recorded_date: string; value: number; net_equity: number | null };

export type AssetAnalysisProps = {
  /** The viewer's SHARE of the asset (display values: what the page shows). */
  asset: AnalysisAsset;
  /** The RAW whole-asset record (100 %), only for components that take it by contract (tax lots). */
  rawAsset: AnalysisAsset;
  /** History rows already reduced to the viewer's share. */
  history: AnalysisHistoryRow[];
  /** Stored bank transactions (Cash accounts), newest first. */
  transactions: StoredTransactionRow[];
  ratesFromUsd: Record<string, number>;
  ownerFactor: number;
  /** ISO day, injected for determinism. */
  today: string;
  /** Portfolio figures for position share and linked accounts; null/undefined when not loaded. */
  portfolio?: AnalysisPortfolio | null;
};
