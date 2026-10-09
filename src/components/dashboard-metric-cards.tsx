"use client";

import { moneyFormatter } from "@/lib/money-parts";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePrivacy } from "@/context/privacy-context";
import { useLanguage } from "@/context/language-context";
import { CATEGORY_NAME_KEYS } from "@/components/portfolio-groups";
import { Money } from "@/components/money";
import { cn } from "@/lib/utils";

/** One asset's contribution to a dashboard total, already converted into the Base Currency. */
export type BreakdownRow = {
  id: string;
  name: string;
  category: string;
  amount: number;
  /** Unrealized-gain breakdown only. */
  marketValue?: number;
  costBasis?: number;
  /** Liabilities breakdown: set (possibly "") when the debt is this property's own linked loan — shows which asset it belongs to. */
  linkedLender?: string;
};

export type DashboardBreakdowns = {
  netWorth: BreakdownRow[];
  assets: BreakdownRow[];
  liabilities: BreakdownRow[];
  gain: BreakdownRow[];
};

type MetricKey = keyof DashboardBreakdowns;

function MetricCard({
  label,
  value,
  icon,
  valueClassName,
  animationDelayMs,
  onClick,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  valueClassName?: string;
  animationDelayMs: number;
  onClick: () => void;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className="rounded-xl text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card
        className="lit h-full border-border bg-card transition-colors animate-in fade-in slide-in-from-bottom-2 duration-300 hover:bg-muted motion-reduce:animate-none"
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
          <div className="flex shrink-0 items-center justify-center text-primary">
            {icon}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function BreakdownDialog({
  metric,
  rows,
  currency,
  onClose,
}: {
  metric: MetricKey | null;
  rows: BreakdownRow[];
  currency: string;
  onClose: () => void;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const formatter = useMemo(
    () => moneyFormatter(intlLocale, currency),
    [intlLocale, currency],
  );

  const titleKey = {
    netWorth: "net_worth",
    assets: "total_assets",
    liabilities: "total_liabilities",
    gain: "real_estate_unrealized_gain",
  } as const;

  const sorted = useMemo(
    () => [...rows].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    [rows],
  );
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const isGain = metric === "gain";
  const money = (n: number) => maskValue(formatter.format(n));

  return (
    <Dialog open={metric !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-background sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {metric ? t(titleKey[metric]) : ""}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("breakdown_desc", { currency })}
          </DialogDescription>
        </DialogHeader>

        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("breakdown_empty")}</p>
        ) : (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-muted-foreground">{t("breakdown_asset")}</TableHead>
                  {isGain ? (
                    <>
                      <TableHead className="text-end text-muted-foreground">
                        {t("breakdown_market_value")}
                      </TableHead>
                      <TableHead className="text-end text-muted-foreground">
                        {t("breakdown_cost_basis")}
                      </TableHead>
                    </>
                  ) : (
                    <TableHead className="text-muted-foreground">
                      {t("breakdown_category")}
                    </TableHead>
                  )}
                  <TableHead className="text-end text-muted-foreground">
                    {isGain ? t("breakdown_gain") : t("breakdown_amount")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-foreground">
                      <Link
                        href={`/dashboard/assets/${row.id}`}
                        className="hover:underline"
                        onClick={onClose}
                      >
                        {row.name}
                      </Link>
                      {row.linkedLender !== undefined && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {row.linkedLender
                            ? t("liability_linked_loan_lender", { lender: row.linkedLender })
                            : t("liability_linked_loan")}
                        </span>
                      )}
                    </TableCell>
                    {isGain ? (
                      <>
                        <TableCell className="text-end tabular-nums text-foreground">
                          {money(row.marketValue ?? 0)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums text-muted-foreground">
                          {money(row.costBasis ?? 0)}
                        </TableCell>
                      </>
                    ) : (
                      <TableCell className="text-muted-foreground">
                        {CATEGORY_NAME_KEYS[row.category]
                          ? t(CATEGORY_NAME_KEYS[row.category])
                          : row.category}
                      </TableCell>
                    )}
                    <TableCell
                      className={cn(
                        "text-end tabular-nums",
                        row.amount < 0 ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {money(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell
                    colSpan={isGain ? 3 : 2}
                    className="font-medium text-foreground"
                  >
                    {t("breakdown_total")}
                  </TableCell>
                  <TableCell className="text-end font-semibold tabular-nums text-foreground">
                    {money(total)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DashboardMetricCards({
  netWorth,
  assets,
  liabilities,
  hasLiabilities,
  unrealizedGain,
  unrealizedGainSign,
  baseCurrency,
  breakdowns,
}: {
  netWorth: number;
  assets: number;
  liabilities: number;
  hasLiabilities: boolean;
  unrealizedGain: number;
  unrealizedGainSign: "+" | "-" | null;
  baseCurrency: string;
  breakdowns: DashboardBreakdowns;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState<MetricKey | null>(null);

  // Headline figures: the house Money figure (rolls only the digits that change; Privacy Mode masks it).
  const ticker = (n: number) => <Money value={n} currency={baseCurrency} showCurrency={false} />;

  const gainColorClass =
    unrealizedGainSign === "+"
      ? "text-success"
      : unrealizedGainSign === "-"
        ? "text-destructive"
        : undefined;

  const hint = t("breakdown_click_hint");

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t("base_currency_note", { currency: baseCurrency })}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t("net_worth")}
          value={ticker(netWorth)}
          icon={<Wallet className="size-4" />}
          animationDelayMs={0}
          onClick={() => setOpen("netWorth")}
          hint={hint}
        />
        <MetricCard
          label={t("total_assets")}
          value={ticker(assets)}
          icon={<TrendingUp className="size-4" />}
          animationDelayMs={75}
          onClick={() => setOpen("assets")}
          hint={hint}
        />
        <MetricCard
          label={t("total_liabilities")}
          value={ticker(liabilities)}
          icon={<TrendingDown className="size-4" />}
          valueClassName={hasLiabilities ? "text-destructive" : undefined}
          animationDelayMs={150}
          onClick={() => setOpen("liabilities")}
          hint={hint}
        />
        <MetricCard
          label={t("real_estate_unrealized_gain")}
          value={
            <>
              {unrealizedGainSign}
              {ticker(unrealizedGain)}
            </>
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
          onClick={() => setOpen("gain")}
          hint={hint}
        />
      </div>

      <BreakdownDialog
        metric={open}
        rows={open ? breakdowns[open] : []}
        currency={baseCurrency}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
