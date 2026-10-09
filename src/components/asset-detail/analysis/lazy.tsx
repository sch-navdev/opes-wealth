"use client";

import dynamic from "next/dynamic";

/**
 * The Analysis tab's per-category views, each split into its own chunk. Radix only mounts the active tab, so a
 * class's analysis code (recharts cards, metrics) is downloaded the first time the Analysis tab is opened and only
 * for the category the asset is. Same pattern as `asset-detail/lazy.tsx` (the options object must stay an inline literal).
 */
function AnalysisSkeleton() {
  return <div aria-hidden="true" className="h-40 animate-pulse border border-border bg-muted motion-reduce:animate-none" />;
}

export const CashAnalysis = dynamic(() => import("@/components/asset-detail/analysis/cash").then((m) => m.CashAnalysis), { loading: AnalysisSkeleton });
export const EquityAnalysis = dynamic(() => import("@/components/asset-detail/analysis/equity").then((m) => m.EquityAnalysis), { loading: AnalysisSkeleton });
export const CryptoAnalysis = dynamic(() => import("@/components/asset-detail/analysis/crypto").then((m) => m.CryptoAnalysis), { loading: AnalysisSkeleton });
export const MetalsAnalysis = dynamic(() => import("@/components/asset-detail/analysis/metals").then((m) => m.MetalsAnalysis), { loading: AnalysisSkeleton });
export const VehicleAnalysis = dynamic(() => import("@/components/asset-detail/analysis/vehicle").then((m) => m.VehicleAnalysis), { loading: AnalysisSkeleton });
export const RealEstateAnalysis = dynamic(() => import("@/components/asset-detail/analysis/real-estate").then((m) => m.RealEstateAnalysis), { loading: AnalysisSkeleton });
export const PrivateEquityAnalysis = dynamic(() => import("@/components/asset-detail/analysis/private-equity").then((m) => m.PrivateEquityAnalysis), { loading: AnalysisSkeleton });
export const ScpiAnalysis = dynamic(() => import("@/components/asset-detail/analysis/scpi").then((m) => m.ScpiAnalysis), { loading: AnalysisSkeleton });
export const CompanyAnalysis = dynamic(() => import("@/components/asset-detail/analysis/company").then((m) => m.CompanyAnalysis), { loading: AnalysisSkeleton });
export const StartupAnalysis = dynamic(() => import("@/components/asset-detail/analysis/startup").then((m) => m.StartupAnalysis), { loading: AnalysisSkeleton });
export const ExoticAnalysis = dynamic(() => import("@/components/asset-detail/analysis/exotic").then((m) => m.ExoticAnalysis), { loading: AnalysisSkeleton });
export const LiabilityAnalysis = dynamic(() => import("@/components/asset-detail/analysis/liability").then((m) => m.LiabilityAnalysis), { loading: AnalysisSkeleton });
export const AssuranceVieAnalysis = dynamic(() => import("@/components/asset-detail/analysis/assurance-vie").then((m) => m.AssuranceVieAnalysis), { loading: AnalysisSkeleton });
export const GenericAnalysis = dynamic(() => import("@/components/asset-detail/analysis/generic").then((m) => m.GenericAnalysis), { loading: AnalysisSkeleton });
