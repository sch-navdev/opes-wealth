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
import { useAnalysisText } from "@/components/asset-detail/analysis/text";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { moneyFormatter } from "@/lib/money-parts";
import type { VehicleComparisonRow } from "@/lib/vehicles";

export type VehicleChartRow = VehicleComparisonRow & {
  /** Modelled depreciation curve (Analysis tab only). */
  model?: number | null;
};

type TipEntry = { dataKey?: string | number; name?: string | number; value?: number | string | null; color?: string; payload?: VehicleChartRow };

function Tip({
  active,
  payload,
  label,
  fmt,
  fmtTs,
  carriedTip,
}: {
  active?: boolean;
  payload?: TipEntry[];
  label?: unknown;
  fmt: (n: number) => string;
  fmtTs: (ts: unknown) => string;
  carriedTip: string;
}) {
  if (!active || !payload) return null;
  const items = payload.filter((p) => p.value != null && p.dataKey !== "blueBook");
  if (items.length === 0) return null;
  return (
    <div className="border border-border bg-card px-3 py-2 text-xs text-foreground" data-testid="vehicle-chart-tooltip">
      <p className="mb-1 font-medium">{fmtTs(label)}</p>
      {items.map((p) => {
        const carried = p.dataKey === "blueBookStep" && p.payload?.blueBook == null;
        return (
          <p key={String(p.dataKey)} className="flex justify-between gap-4">
            <span style={{ color: p.color }}>
              {p.name}
              {carried && <span className="text-muted-foreground"> · {carriedTip}</span>}
            </span>
            <span className="tabular-nums">{fmt(Number(p.value))}</span>
          </p>
        );
      })}
    </div>
  );
}

/**
 * The vehicle "Valuation History" chart: market value (filled), purchase price (flat, dashed) and the Blue Book.
 * A Blue Book valuation is an INSTANT value (one dot per valuation), so it is drawn as a STEP line carried
 * forward from each valuation to the next one (and the last one to today), with a dot on every real observation:
 * that lets the three values be compared along the whole range. The tooltip and the caption say so.
 * Rows come from `buildVehicleComparisonSeries` (`blueBook` = the observation, `blueBookStep` = carried forward).
 */
export function VehicleValuationChart({
  rows,
  currency,
  heightClassName = "h-64",
  showModel = false,
}: {
  rows: VehicleChartRow[];
  currency: string;
  heightClassName?: string;
  /** Also draw the modelled depreciation curve (`model`). */
  showModel?: boolean;
}) {
  const { t, intlLocale } = useLanguage();
  const at = useAnalysisText();
  const { maskValue } = usePrivacy();
  const formatter = moneyFormatter(intlLocale, currency, { maximumFractionDigits: 0 });
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { day: "2-digit", month: "2-digit", year: "numeric" });
  const fmtTs = (ts: unknown) => (Number.isFinite(Number(ts)) ? dateFormatter.format(new Date(Number(ts))) : "");

  const data = rows.map((r) => ({ ...r, ts: new Date(r.date).getTime() }));
  const hasBlueBook = rows.some((r) => r.blueBook != null);
  const bbName = t("bluebook_title");

  return (
    <div className="space-y-2">
      <div className={`${heightClassName} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="vehicleValueGradient" x1="0" y1="0" x2="0" y2="1">
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
              tickFormatter={fmtTs}
            />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => maskValue(formatter.format(v))} width={90} />
            <Tooltip content={<Tip fmt={(n) => maskValue(formatter.format(n))} fmtTs={fmtTs} carriedTip={at("an_bluebook_carried_tip")} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="value" name="Market Value" stroke="var(--color-primary)" fill="url(#vehicleValueGradient)" strokeWidth={2} connectNulls />
            <Area
              type="monotone"
              dataKey="purchase"
              name={t("purchase_price")}
              stroke="var(--color-muted-foreground)"
              fill="transparent"
              strokeWidth={2}
              strokeDasharray="6 4"
              connectNulls
            />
            {showModel && (
              <Area
                type="monotone"
                dataKey="model"
                name={at("an_vehicle_model_line")}
                stroke="var(--color-chart-2)"
                fill="transparent"
                strokeWidth={2}
                strokeDasharray="2 3"
                connectNulls
              />
            )}
            {/* Blue Book: the instant valuation carried forward as a step line … */}
            <Area type="stepAfter" dataKey="blueBookStep" name={bbName} stroke="var(--color-chart-4)" fill="transparent" strokeWidth={2} connectNulls={false} />
            {/* … with a dot on each real observation (no line of its own, kept out of the legend and tooltip). */}
            <Area
              type="monotone"
              dataKey="blueBook"
              name={bbName}
              stroke="none"
              fill="none"
              dot={{ r: 4, fill: "var(--color-chart-4)", stroke: "var(--color-card)", strokeWidth: 1 }}
              activeDot={false}
              legendType="none"
              tooltipType="none"
              isAnimationActive={false}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {hasBlueBook && (
        <p className="text-xs text-muted-foreground" data-testid="bluebook-carried-note">
          {at("an_bluebook_carried_note")}
        </p>
      )}
    </div>
  );
}
