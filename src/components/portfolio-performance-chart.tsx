"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CATEGORY_NAME_KEYS } from "@/components/portfolio-groups";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import {
  PORTFOLIO_PERFORMANCE_TOTAL_KEY,
  type PortfolioPerformanceSeries,
} from "@/lib/portfolio-performance";
import type { TranslationKey } from "@/lib/i18n";

export function PortfolioPerformanceChart({
  series,
  currency,
}: {
  series: PortfolioPerformanceSeries;
  currency: string;
}) {
  const { t } = useLanguage();
  const { maskValue } = usePrivacy();
  const [activeFilter, setActiveFilter] = useState<string>(PORTFOLIO_PERFORMANCE_TOTAL_KEY);

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  function formatDate(isoDate: unknown): string {
    if (typeof isoDate !== "string") return String(isoDate ?? "");
    const parsed = new Date(isoDate);
    return Number.isNaN(parsed.getTime()) ? isoDate : dateFormatter.format(parsed);
  }

  function categoryLabel(category: string): string {
    const key = CATEGORY_NAME_KEYS[category] as TranslationKey | undefined;
    return key ? t(key) : category;
  }

  const activeKey = series.categories.includes(activeFilter)
    ? activeFilter
    : PORTFOLIO_PERFORMANCE_TOTAL_KEY;
  const activeLabel =
    activeKey === PORTFOLIO_PERFORMANCE_TOTAL_KEY ? t("net_worth") : categoryLabel(activeKey);

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">
          {t("portfolio_performance_title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {series.categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={activeKey === PORTFOLIO_PERFORMANCE_TOTAL_KEY ? "default" : "outline"}
              onClick={() => setActiveFilter(PORTFOLIO_PERFORMANCE_TOTAL_KEY)}
            >
              {t("portfolio_performance_filter_all")}
            </Button>
            {series.categories.map((category) => (
              <Button
                key={category}
                type="button"
                size="sm"
                variant={activeKey === category ? "default" : "outline"}
                onClick={() => setActiveFilter(category)}
              >
                {categoryLabel(category)}
              </Button>
            ))}
          </div>
        )}

        {series.points.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("portfolio_performance_empty")}
          </p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series.points}>
                <defs>
                  <linearGradient id="portfolioPerformanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="date"
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickFormatter={formatDate}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickFormatter={(v) => maskValue(currencyFormatter.format(v))}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-foreground)",
                  }}
                  labelFormatter={formatDate}
                  formatter={(value) => maskValue(currencyFormatter.format(Number(value)))}
                />
                <Area
                  type="monotone"
                  dataKey={activeKey}
                  name={activeLabel}
                  stroke="var(--color-primary)"
                  fill="url(#portfolioPerformanceGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
