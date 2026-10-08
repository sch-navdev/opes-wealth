"use client";

import { useState } from "react";
import { AllocationDial } from "@/components/allocation-dial";
import { PartitionBar } from "@/components/partition-bar";
import { CATEGORY_NAME_KEYS } from "@/components/portfolio-groups";
import { useTierMotion } from "@/components/tier-gate";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
import { requestOpenCategory } from "@/lib/category-events";
import { tileEntranceStyle, type AllocationSlice } from "@/lib/dashboard-tiers";
import { cn } from "@/lib/utils";

const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/**
 * The allocation tile shared by every tier: the Chronograph dial (a partition bar below 520 px, where a dial
 * would not fit) beside a text legend with the printed percentages, so colour is never the only cue.
 * The same component is used inside the Basic overview and as the stand-alone `allocation` block of
 * Standard and above; `compact` stacks the dial over the legend for narrow grid cells.
 *
 * Pointing at an arc (or a legend row) highlights that category in both and shows its share in the centre of
 * the dial, with no click needed. With `opensExplorer` (Standard and up, where the category explorer exists)
 * clicking an arc or a legend row opens that category's explorer on the dashboard; legend rows are real
 * buttons, so the keyboard does the same.
 */
export function AllocationCard({
  allocation,
  entranceIndex = 0,
  compact = false,
  opensExplorer = false,
  className,
}: {
  allocation: AllocationSlice[];
  /** Position in the tier's entrance stagger. */
  entranceIndex?: number;
  /** Always stack dial over legend (a one-third or half-width cell). */
  compact?: boolean;
  /** Clicking a category opens its explorer (needs the Analytics block, so Standard and above). */
  opensExplorer?: boolean;
  className?: string;
}) {
  const { t, intlLocale } = useLanguage();
  const motion = useTierMotion();
  const [active, setActive] = useState<string | null>(null);
  const percent = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 });
  const categoryLabel = (category: string) => {
    const key = CATEGORY_NAME_KEYS[category];
    return key ? t(key) : category;
  };
  const slices = allocation.map((slice, i) => ({
    key: slice.category,
    share: slice.share,
    color: SLICE_COLORS[i % SLICE_COLORS.length],
  }));
  const focus = allocation.find((s) => s.category === active) ?? allocation[0];
  const select = opensExplorer ? (category: string) => requestOpenCategory(category) : undefined;

  return (
    <Card
      className={cn(
        "animate-in fade-in slide-in-from-bottom-2 gap-4 border-border bg-card py-5 motion-reduce:animate-none",
        className,
      )}
      style={tileEntranceStyle(motion, entranceIndex)}
    >
      <h2 className="px-5 text-sm font-medium text-foreground">{t("dash_basic_alloc_title")}</h2>
      <div
        role="group"
        aria-label={t("dash_basic_alloc_aria")}
        className={cn(
          "flex flex-col items-center gap-4 px-5",
          !compact && "min-[520px]:flex-row lg:flex-col xl:flex-row",
        )}
      >
        <PartitionBar className="min-[520px]:hidden" segments={slices} />
        <AllocationDial
          className="hidden size-40 shrink-0 min-[520px]:block"
          size={160}
          slices={slices}
          centerValue={focus ? `${percent.format(focus.share)}%` : undefined}
          centerLabel={focus ? categoryLabel(focus.category) : undefined}
          activeKey={active}
          onActiveChange={setActive}
          onSelect={select}
        />
        <ul className="w-full min-w-0 flex-1 space-y-1" onPointerLeave={() => setActive(null)}>
          {allocation.map((slice, i) => {
            const label = categoryLabel(slice.category);
            const row = (
              <>
                <span className="flex min-w-0 items-start gap-2">
                  <span
                    className="mt-1 size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }}
                    aria-hidden="true"
                  />
                  <span className="line-clamp-2 min-w-0 break-words text-start text-foreground" title={label}>
                    {label}
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums text-muted-foreground">
                  {percent.format(slice.share)}%
                </span>
              </>
            );
            const rowClass = cn(
              "flex w-full items-start justify-between gap-3 px-2 py-1 text-sm transition-colors",
              active === slice.category && "bg-muted",
              active != null && active !== slice.category && "opacity-60",
            );
            return (
              <li key={slice.category}>
                {select ? (
                  <button
                    type="button"
                    className={cn(rowClass, "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring")}
                    onPointerEnter={() => setActive(slice.category)}
                    onFocus={() => setActive(slice.category)}
                    onBlur={() => setActive(null)}
                    onClick={() => select(slice.category)}
                    aria-label={`${label}, ${percent.format(slice.share)}%`}
                  >
                    {row}
                  </button>
                ) : (
                  <div className={rowClass} onPointerEnter={() => setActive(slice.category)}>
                    {row}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
