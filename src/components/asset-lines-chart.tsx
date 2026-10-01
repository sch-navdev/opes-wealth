"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import type { LineSeries } from "@/lib/portfolio-performance";

// Only five chart tokens exist; beyond five lines the colour cycles and the
// dash pattern changes so lines stay distinguishable.
const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];
const DASHES = [undefined, "6 3", "2 3", "8 3 2 3"];
const PROJECTED_DASH = "10 6";
const INVESTED_DASH = "3 3";
const MAX_LEGEND_LINES = 8;

/** Stroke colour for the i-th individual line — shared with the selection list's colour dots. */
export function lineColor(index: number): string {
  return COLORS[index % COLORS.length];
}

function valueDash(index: number): string | undefined {
  return DASHES[Math.floor(index / COLORS.length) % DASHES.length];
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatTimestamp(ts: unknown): string {
  const n = Number(ts);
  return Number.isFinite(n) ? dateFormatter.format(new Date(n)) : "";
}

/**
 * Renders a `LineSeries` (see `lib/portfolio-performance.ts`). Every line
 * carries its own `kind`: recorded valuation (solid; the filled "Grouped
 * Aggregate" area when it is the only line of its kind), projection (dashed,
 * same colour as its asset) or cumulative invested capital (stepped, fine
 * dashes) — so history, forecast and capital-vs-value comparisons can share
 * one axis.
 */
export function AssetLinesChart({
  series,
  currency,
  aggregateLabel,
  heightClassName = "h-72",
}: {
  series: LineSeries;
  currency: string;
  /** Name of the grouped line (a category, "Net Worth", "Selection (n)"…). */
  aggregateLabel: string;
  heightClassName?: string;
}) {
  const { t } = useLanguage();
  const { maskValue } = usePrivacy();
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  if (series.points.length === 0 || series.lines.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("explorer_no_data")}</p>;
  }

  function lineName(line: LineSeries["lines"][number]): string {
    const base = line.assetId ? line.label : aggregateLabel;
    if (line.kind === "invested") {
      return line.assetId ? `${base} – ${t("chart_invested")}` : t("chart_invested");
    }
    if (line.kind === "projected") return `${base} ${t("projected_suffix")}`;
    return base;
  }

  return (
    <div className={`${heightClassName} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series.points}>
          <defs>
            <linearGradient id="assetLinesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            stroke="var(--color-muted-foreground)"
            fontSize={12}
            tickFormatter={formatTimestamp}
          />
          <YAxis
            stroke="var(--color-muted-foreground)"
            fontSize={12}
            tickFormatter={(v) => maskValue(formatter.format(v))}
            width={80}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              color: "var(--color-foreground)",
            }}
            labelFormatter={formatTimestamp}
            formatter={(value) => maskValue(formatter.format(Number(value)))}
            itemSorter={(item) => -Number(item.value ?? 0)}
          />
          {/* A legend for dozens of lines would swallow the plot; past a handful, the selection list's colour dots and the tooltip identify them. */}
          {series.lines.length > 1 && series.lines.length <= MAX_LEGEND_LINES && (
            <Legend wrapperStyle={{ fontSize: 12 }} />
          )}
          {series.lines.map((line) => {
            const kind = line.kind ?? "value";
            const grouped = line.group != null;
            const stroke = grouped
              ? lineColor(line.group!)
              : kind === "invested"
                ? "var(--color-muted-foreground)"
                : "var(--color-primary)";
            const dash =
              kind === "projected"
                ? PROJECTED_DASH
                : kind === "invested"
                  ? INVESTED_DASH
                  : grouped
                    ? valueDash(line.group!)
                    : undefined;
            const filled = kind === "value" && !grouped;
            return (
              <Area
                key={line.key}
                type={kind === "invested" ? "stepAfter" : "monotone"}
                dataKey={line.key}
                name={lineName(line)}
                stroke={stroke}
                strokeOpacity={kind === "value" ? 1 : 0.8}
                fill={filled ? "url(#assetLinesGradient)" : "transparent"}
                strokeWidth={2}
                strokeDasharray={dash}
                connectNulls={false}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
