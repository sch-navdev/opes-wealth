"use client";

import { ArrowDownRight, ArrowUpRight, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { usePrivacy } from "@/context/privacy-context";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";

function MetricCard({
  label,
  value,
  icon,
  valueClassName,
  animationDelayMs,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueClassName?: string;
  animationDelayMs: number;
}) {
  return (
    <Card
      className="border-border bg-card animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none"
      style={{ animationDelay: `${animationDelayMs}ms`, animationFillMode: "backwards" }}
    >
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p
            className={cn(
              "text-lg font-semibold tabular-nums text-foreground",
              valueClassName,
            )}
          >
            {value}
          </p>
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center border border-border bg-background text-primary">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardMetricCards({
  netWorthFormatted,
  assetsFormatted,
  liabilitiesFormatted,
  hasLiabilities,
  unrealizedGainFormatted,
  unrealizedGainSign,
  baseCurrency,
}: {
  netWorthFormatted: string;
  assetsFormatted: string;
  liabilitiesFormatted: string;
  hasLiabilities: boolean;
  unrealizedGainFormatted: string;
  unrealizedGainSign: "+" | "-" | null;
  baseCurrency: string;
}) {
  const { maskValue } = usePrivacy();
  const { t } = useLanguage();

  const gainColorClass =
    unrealizedGainSign === "+"
      ? "text-success"
      : unrealizedGainSign === "-"
        ? "text-destructive"
        : undefined;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t("base_currency_note", { currency: baseCurrency })}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t("net_worth")}
          value={maskValue(netWorthFormatted)}
          icon={<Wallet className="size-4" />}
          animationDelayMs={0}
        />
        <MetricCard
          label={t("total_assets")}
          value={maskValue(assetsFormatted)}
          icon={<TrendingUp className="size-4" />}
          animationDelayMs={75}
        />
        <MetricCard
          label={t("total_liabilities")}
          value={maskValue(liabilitiesFormatted)}
          icon={<TrendingDown className="size-4" />}
          valueClassName={hasLiabilities ? "text-destructive" : undefined}
          animationDelayMs={150}
        />
        <MetricCard
          label={t("real_estate_unrealized_gain")}
          value={
            unrealizedGainSign
              ? `${unrealizedGainSign}${maskValue(unrealizedGainFormatted)}`
              : maskValue(unrealizedGainFormatted)
          }
          icon={
            unrealizedGainSign === "-" ? (
              <ArrowDownRight className="size-4" />
            ) : (
              <ArrowUpRight className="size-4" />
            )
          }
          valueClassName={gainColorClass}
          animationDelayMs={225}
        />
      </div>
    </div>
  );
}
