import { Factory, GitCompareArrows, Landmark, LayoutDashboard, ListChecks, Settings, ShieldCheck, Telescope } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";
import { isNavLinkVisible, type NavLinkId } from "@/lib/dashboard-tiers";
import type { ExpertiseLevel } from "@/stores/useUiTierStore";

export type NavItem = {
  id: NavLinkId;
  href: string;
  labelKey: TranslationKey;
  icon: typeof LayoutDashboard;
};

/**
 * Dashboard destinations, shared by the sidebar and the command palette. Which tier
 * shows each link lives in `lib/dashboard-tiers.ts` (`isNavLinkVisible`).
 */
export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", href: "/dashboard", labelKey: "nav_dashboard", icon: LayoutDashboard },
  { id: "dataQuality", href: "/dashboard/data-quality", labelKey: "nav_data_quality", icon: ListChecks },
  { id: "banking", href: "/dashboard/banking", labelKey: "nav_banking", icon: Landmark },
  { id: "companies", href: "/dashboard/companies", labelKey: "nav_companies", icon: Factory },
  { id: "planning", href: "/dashboard/planning", labelKey: "nav_planning", icon: Telescope },
  // `irr_nav_compare` lives in the pending i18n merge (.tmp-irr-keys.json): until then t() returns the key.
  { id: "compare", href: "/dashboard/compare", labelKey: "irr_nav_compare" as TranslationKey, icon: GitCompareArrows },
  { id: "settings", href: "/dashboard/settings", labelKey: "profile_settings", icon: Settings },
  { id: "security", href: "/dashboard/security", labelKey: "nav_security", icon: ShieldCheck },
];

/** The destinations shown at `tier`. */
export function visibleNavItems(tier: ExpertiseLevel): NavItem[] {
  return NAV_ITEMS.filter((item) => isNavLinkVisible(item.id, tier));
}
