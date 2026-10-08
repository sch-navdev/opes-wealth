"use client";

import { AllocationDial } from "@/components/allocation-dial";
import { PartitionBar } from "@/components/partition-bar";
import { CATEGORY_NAME_KEYS } from "@/components/portfolio-groups";
import { useTierMotion } from "@/components/tier-gate";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
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
 */
export function AllocationCard({
  allocation,
  entranceIndex = 0,
  compact = false,
  className,
}: {
  allocation: AllocationSlice[];
  /** Position in the tier's entrance stagger. */
  entranceIndex?: number;
  /** Always stack dial over legend (a one-third or half-width cell). */
  compact?: boolean;
  className?: string;
}) {
  const { t, intlLocale } = useLanguage();
  const motion = useTierMotion();
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
          centerValue={allocation[0] ? `${percent.format(allocation[0].share)}%` : undefined}
          centerLabel={allocation[0] ? categoryLabel(allocation[0].category) : undefined}
        />
        <ul className="w-full min-w-0 flex-1 space-y-2">
          {allocation.map((slice, i) => (
            <li key={slice.category} className="flex items-start justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-start gap-2">
                <span
                  className="mt-1 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }}
                  aria-hidden="true"
                />
                <span className="line-clamp-2 min-w-0 break-words text-foreground" title={categoryLabel(slice.category)}>
                  {categoryLabel(slice.category)}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums text-muted-foreground">
                {percent.format(slice.share)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
