"use client";

import { formatDecimal } from "@/lib/money-parts";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CategoryIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { CATEGORY_NAME_KEYS } from "@/components/portfolio-groups";
import { useTierMotion } from "@/components/tier-gate";
import { Card } from "@/components/ui/card";
import { tileEntranceStyle } from "@/lib/dashboard-tiers";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";

export type BentoTile = {
  /** DB category name ("Real Estate" | "Vehicles" | "Private Equity"). */
  category: string;
  /** Net contribution to Net Worth, in the Base Currency. */
  total: number;
  count: number;
};

/** Pointer readout for the hero chart: the date and the amount at the point under the cursor. */
function HeroTooltip({
  active,
  payload,
  currency,
  format,
}: {
  active?: boolean;
  payload?: { value?: number; payload?: { date: string } }[];
  currency: string;
  format: (date: string) => string;
}) {
  const point = payload?.[0];
  if (!active || !point || typeof point.value !== "number" || !point.payload) return null;
  return (
    <div className="border border-border bg-card px-2.5 py-1.5 text-xs shadow-none">
      <p className="text-muted-foreground tabular-nums">{format(point.payload.date)}</p>
      <p className="text-sm font-medium text-foreground">
        <Money value={point.value} currency={currency} showCurrency={false} decimals="hide" />
      </p>
    </div>
  );
}

export type BentoSparkPoint = { date: string; value: number };

/**
 * Dashboard header bento: a Net Worth hero tile (with a sparkline of the
 * portfolio's history) beside one tile per headline class — Real Estate,
 * Vehicles, Private Equity — each with its net total, holding count and share
 * of Net Worth.
 *
 * Layout and card treatment adapted from the 21st.dev "Financial Bento Grid"
 * (uiable/block-bento-5, id 30742): a 12-col-style grid of bordered `Card`
 * tiles around one area-chart tile. Everything is semantic tokens
 * (`bg-card`, `text-foreground`, `--chart-*`), so it follows light/dark.
 * Figures go through Privacy Mode (`maskValue`).
 */
export function DashboardBento({
  netWorth,
  baseCurrency,
  tiles,
  spark,
}: {
  netWorth: number;
  baseCurrency: string;
  tiles: BentoTile[];
  spark: BentoSparkPoint[];
}) {
  const { t, intlLocale } = useLanguage();
  const motion = useTierMotion();
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { month: "short", year: "2-digit" });
  const showSpark = spark.length > 1;

  return (
    <section aria-label={t("bento_aria")} className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <Card
        className="lit animate-in fade-in slide-in-from-bottom-2 gap-4 overflow-hidden border-border bg-card py-5 motion-reduce:animate-none sm:col-span-1 lg:col-span-2 lg:row-span-2"
        style={tileEntranceStyle(motion, 0)}
      >
        <div className="px-5">
          <p className="text-xs font-medium text-muted-foreground">
            {t("net_worth")} · {baseCurrency}
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-foreground sm:text-4xl">
            <Money value={netWorth} currency={baseCurrency} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("bento_hero_caption")}</p>
        </div>
        {showSpark && (
          <div className="min-h-32 flex-1 px-1" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%" minHeight={128}>
              <LineChart data={spark} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Tooltip
                  cursor={{ stroke: "var(--primary)", strokeWidth: 1, strokeDasharray: "2 3" }}
                  content={<HeroTooltip currency={baseCurrency} format={(d) => dateFormatter.format(new Date(d))} />}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  strokeWidth={1.6}
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
                  style={{ stroke: "var(--chart-1)" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {showSpark && <div aria-hidden="true" className="tick-rule mx-5" />}
        {showSpark && (
          <p className="px-5 text-xs text-muted-foreground tabular-nums">
            {dateFormatter.format(new Date(spark[0].date))} –{" "}
            {dateFormatter.format(new Date(spark[spark.length - 1].date))}
          </p>
        )}
      </Card>

      {tiles.map((tile, index) => {
        const nameKey = CATEGORY_NAME_KEYS[tile.category];
        const label = nameKey ? t(nameKey) : tile.category;
        const share = netWorth > 0 && tile.total > 0 ? Math.min(100, (tile.total / netWorth) * 100) : 0;
        return (
          <Card
            key={tile.category}
            className={cn(
              "lit animate-in fade-in slide-in-from-bottom-2 gap-3 border-border bg-card py-5 motion-reduce:animate-none",
              // Third tile spans the full row width beside the hero on lg.
              index === 2 && "lg:col-span-2",
            )}
            style={tileEntranceStyle(motion, index + 1)}
          >
            <div className="flex items-start justify-between gap-3 px-5">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                  <Money value={tile.total} currency={baseCurrency} showCurrency={false} />
                </p>
              </div>
              <div className="flex shrink-0 items-center justify-center text-primary">
                <CategoryIcon name={tile.category} className="size-4" />
              </div>
            </div>
            <div className="space-y-1.5 px-5">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={t("bento_share", { pct: formatDecimal(share, intlLocale, 0) })}
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {tile.count === 0
                    ? t("bento_empty")
                    : tile.count === 1
                      ? t("bento_holdings_one")
                      : t("bento_holdings", { n: tile.count })}
                </span>
                {tile.count > 0 && <span className="tabular-nums">{t("bento_share", { pct: formatDecimal(share, intlLocale, 0) })}</span>}
              </div>
            </div>
          </Card>
        );
      })}
    </section>
  );
}
