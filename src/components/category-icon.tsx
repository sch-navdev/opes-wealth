import {
  Banknote,
  Gem,
  Rocket,
  Bitcoin,
  Briefcase,
  Building2,
  Car,
  Coins,
  CreditCard,
  Factory,
  Landmark,
  LineChart,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

/**
 * One icon per asset category, shared by the portfolio group headers
 * (`portfolio-groups.tsx`), the generic asset rows (`portfolio-table.tsx`) and
 * the brokerage holdings table, so every class is covered and styled
 * identically. DB category names are the keys (`Equities` is displayed as
 * "Brokerage Account"). Unmapped names return `null` so callers can fall back
 * to an initial.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Real Estate": Building2,
  Vehicles: Car,
  "Private Equity": Briefcase,
  Equities: LineChart,
  Crypto: Bitcoin,
  "Precious Metals": Coins,
  "Exotic Assets": Gem,
  Startups: Rocket,
  Companies: Factory,
  Cash: Banknote,
  Liabilities: CreditCard,
  SCPI: Landmark,
  "Assurance-Vie": ShieldCheck,
};

export function categoryIconFor(name: string | null | undefined): LucideIcon | null {
  return (name && CATEGORY_ICONS[name]) || null;
}

export function CategoryIcon({
  name,
  className = "size-4",
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const Icon = name ? CATEGORY_ICONS[name] : undefined;
  return Icon ? <Icon className={className} /> : null;
}
