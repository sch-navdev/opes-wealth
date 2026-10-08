"use client";

import dynamic from "next/dynamic";

/**
 * The Settings tab's per-category detail sections, split into their own chunks. Radix only mounts the
 * active tab, so a section's code is downloaded the first time the Settings tab is opened (and only for
 * the categories the asset actually is), instead of with every asset detail page.
 */
function SectionSkeleton() {
  return <div aria-hidden="true" className="h-40 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />;
}

export const RealEstateSettings = dynamic(
  () => import("@/components/asset-detail/real-estate-settings").then((m) => m.RealEstateSettings),
  { loading: SectionSkeleton },
);
export const VehicleSettings = dynamic(
  () => import("@/components/asset-detail/vehicle-settings").then((m) => m.VehicleSettings),
  { loading: SectionSkeleton },
);
export const ScpiSettings = dynamic(
  () => import("@/components/asset-detail/scpi-settings").then((m) => m.ScpiSettings),
  { loading: SectionSkeleton },
);
export const CompanySettings = dynamic(
  () => import("@/components/asset-detail/company-settings").then((m) => m.CompanySettings),
  { loading: SectionSkeleton },
);
export const PrivateEquityDetailsSettings = dynamic(
  () => import("@/components/asset-detail/private-equity-details-settings").then((m) => m.PrivateEquityDetailsSettings),
  { loading: SectionSkeleton },
);
export const PrivateEquityCommitmentSettings = dynamic(
  () =>
    import("@/components/asset-detail/private-equity-commitment-settings").then((m) => m.PrivateEquityCommitmentSettings),
  { loading: SectionSkeleton },
);
export const EquitySettings = dynamic(
  () => import("@/components/asset-detail/equity-settings").then((m) => m.EquitySettings),
  { loading: SectionSkeleton },
);
export const PreciousMetalSettings = dynamic(
  () => import("@/components/asset-detail/precious-metal-settings").then((m) => m.PreciousMetalSettings),
  { loading: SectionSkeleton },
);
export const CryptoSettings = dynamic(
  () => import("@/components/asset-detail/crypto-settings").then((m) => m.CryptoSettings),
  { loading: SectionSkeleton },
);
