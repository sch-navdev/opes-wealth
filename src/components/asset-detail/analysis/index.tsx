"use client";

import type { ComponentType } from "react";
import {
  AssuranceVieAnalysis,
  CashAnalysis,
  CompanyAnalysis,
  CryptoAnalysis,
  EquityAnalysis,
  ExoticAnalysis,
  GenericAnalysis,
  LiabilityAnalysis,
  MetalsAnalysis,
  PrivateEquityAnalysis,
  RealEstateAnalysis,
  ScpiAnalysis,
  StartupAnalysis,
  VehicleAnalysis,
} from "@/components/asset-detail/analysis/lazy";
import type { AssetAnalysisProps } from "@/components/asset-detail/analysis/types";

export type { AssetAnalysisProps } from "@/components/asset-detail/analysis/types";

/** Category name -> its analysis view. Anything not listed (a category added later) gets the generic value-history view. */
export const ANALYSIS_BY_CATEGORY: Record<string, ComponentType<AssetAnalysisProps>> = {
  Cash: CashAnalysis,
  Equities: EquityAnalysis,
  Crypto: CryptoAnalysis,
  "Precious Metals": MetalsAnalysis,
  Vehicles: VehicleAnalysis,
  "Real Estate": RealEstateAnalysis,
  "Private Equity": PrivateEquityAnalysis,
  SCPI: ScpiAnalysis,
  Companies: CompanyAnalysis,
  Startups: StartupAnalysis,
  "Exotic Assets": ExoticAnalysis,
  Liabilities: LiabilityAnalysis,
  "Assurance-Vie": AssuranceVieAnalysis,
};

/** The Analysis tab body: picks the per-category view (a liability always gets the liability view). */
export function AssetAnalysis(props: AssetAnalysisProps) {
  const category = props.asset.asset_categories?.name ?? "";
  const View = props.asset.is_liability && category !== "Cash" ? LiabilityAnalysis : (ANALYSIS_BY_CATEGORY[category] ?? GenericAnalysis);
  return <View {...props} />;
}
