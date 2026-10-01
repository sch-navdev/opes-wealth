"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { cumulativeCashFlowSeries, type PrivateEquityMetadata } from "@/lib/private-equity";

/**
 * A fund's scheduled cash flows: capital calls out (bars below zero),
 * projected distributions in (bars above), and the cumulative net position
 * (line) — the J-curve: the line dips while capital is called and recovers as
 * distributions arrive.
 */
export function PeCashFlowChart({
  metadata,
  currency,
}: {
  metadata: PrivateEquityMetadata;
  currency: string;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const formatter = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  const data = cumulativeCashFlowSeries(metadata).map((p) => ({
    date: p.date,
    calls: -p.calls,
    distributions: p.distributions,
    cumulative: p.cumulative,
  }));
  if (data.length === 0) return null;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={12} />
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
            formatter={(value) => maskValue(formatter.format(Number(value)))}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="calls" name={t("pe_chart_calls")} fill="var(--color-destructive)" />
          <Bar dataKey="distributions" name={t("pe_chart_distributions")} fill="var(--color-success)" />
          <Line
            type="monotone"
            dataKey="cumulative"
            name={t("pe_chart_cumulative")}
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
