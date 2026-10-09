"use client";

import { moneyFormatter } from "@/lib/money-parts";
import { useState } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { CATEGORY_NAME_KEYS } from "@/components/portfolio-groups";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import type { AssetLineInput } from "@/lib/portfolio-performance";
import { cn } from "@/lib/utils";

/**
 * One clickable card per asset category (count, Net Worth contribution,
 * share of the portfolio). Clicking toggles that category's inline explorer
 * panel (`category-explorer-panel.tsx`) — the parent owns which one is open.
 */
export function CategoryCards({
  assets,
  currency,
  selected,
  onSelect,
}: {
  assets: AssetLineInput[];
  currency: string;
  /** Category whose inline explorer is open (highlighted), if any. */
  selected: string | null;
  onSelect: (category: string) => void;
}) {
  const { t, intlLocale } = useLanguage();
  const [sort, setSort] = useState<"share" | "alpha">("share");
  const { maskValue } = usePrivacy();
  const formatter = moneyFormatter(intlLocale, currency);

  const byCategory = new Map<string, { count: number; total: number }>();
  for (const asset of assets) {
    const entry = byCategory.get(asset.category) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += asset.currentValue;
    byCategory.set(asset.category, entry);
  }
  const grossTotal = Array.from(byCategory.values()).reduce(
    (sum, c) => sum + Math.max(0, c.total),
    0,
  );
  const labelOf = (category: string) => {
    const key = CATEGORY_NAME_KEYS[category];
    return key ? t(key) : category;
  };
  // "% of Portfolio" (default) = largest contribution first; "Alphabetical"
  // sorts by the translated, displayed name.
  const cards = Array.from(byCategory.entries()).sort((a, b) =>
    sort === "alpha"
      ? labelOf(a[0]).localeCompare(labelOf(b[0]))
      : Math.abs(b[1].total) - Math.abs(a[1].total),
  );

  if (cards.length === 0) return null;

  return (
    <section className="space-y-2" aria-label={t("category_cards_heading")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">{t("category_cards_heading")}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">{t("category_cards_hint")}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("category_sort_label")}</span>
            <Tabs value={sort} onValueChange={(next) => setSort(next as "share" | "alpha")}>
              <TabsList>
                <TabsTrigger value="share">{t("category_sort_share")}</TabsTrigger>
                <TabsTrigger value="alpha">{t("category_sort_alpha")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([category, { count, total }]) => {
          const label = labelOf(category);
          const share = grossTotal > 0 && total > 0 ? (total / grossTotal) * 100 : null;
          return (
            <button
              key={category}
              type="button"
              onClick={() => onSelect(category)}
              aria-pressed={selected === category}
              className="rounded-xl text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card
                className={cn(
                  "h-full border-border bg-card transition-colors hover:bg-muted",
                  selected === category && "border-primary bg-muted",
                )}
              >
                <CardContent className="space-y-2 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                      <span className="text-primary">
                        <CategoryIcon name={category} />
                      </span>
                      <span className="min-w-0 break-words leading-tight">{label}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">({count})</span>
                  </div>
                  <p
                    className={cn(
                      "text-lg font-semibold tabular-nums",
                      total < 0 ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {total < 0 ? "-" : ""}
                    {maskValue(formatter.format(Math.abs(total)))}
                  </p>
                  {share != null && (
                    <p className="text-xs text-muted-foreground">
                      {t("category_cards_share", { pct: new Intl.NumberFormat(intlLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(share) })}
                    </p>
                  )}
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
    </section>
  );
}
