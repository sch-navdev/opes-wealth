"use client";

import { moneyFormatter } from "@/lib/money-parts";
import Link from "next/link";
import { useMemo } from "react";
import { Eye, EyeOff, Telescope } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { useStored } from "@/lib/use-stored";
import { DEFAULT_MAX_DEBT_RATIO, evaluateProjects, overallVerdict, type ProjectInput } from "@/lib/planning";

/**
 * Dashboard widget for Future Projects: for each simulated project, the cash you would
 * put in on Day D and the amount you would borrow. Simulations are NOT in net worth;
 * this card is the only place they appear on the main dashboard, and it can be hidden
 * (remembered in this browser). The income used for the debt-ratio test is the one
 * typed on the planning page.
 */
export function FutureProjectsCard({
  baseCurrency,
  projects,
  liquidCash,
  existingMonthlyDebt,
  defaultMonthlyIncome,
}: {
  baseCurrency: string;
  projects: ProjectInput[];
  liquidCash: number;
  existingMonthlyDebt: number;
  /** Income assumed until the visitor types one on the planning page (the demo account). */
  defaultMonthlyIncome?: number;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const [hidden, setHidden] = useStored("ow_hide_future_projects");
  const [incomeText] = useStored("ow_planning_income");
  const [ratioText] = useStored("ow_planning_ratio");

  const income = Number(incomeText) > 0 ? Number(incomeText) : (defaultMonthlyIncome ?? null);
  const maxRatio = Number(ratioText) > 0 ? Number(ratioText) : DEFAULT_MAX_DEBT_RATIO;
  const results = useMemo(
    () => evaluateProjects(projects, { liquidCash, existingMonthlyDebt, monthlyIncome: income, maxDebtRatioPct: maxRatio }),
    [projects, liquidCash, existingMonthlyDebt, income, maxRatio],
  );
  const verdict = overallVerdict(results);

  const money = (n: number) => {
    try {
      return maskValue(moneyFormatter(intlLocale, baseCurrency, { maximumFractionDigits: 0 }).format(n));
    } catch {
      return maskValue(n.toLocaleString(intlLocale, { maximumFractionDigits: 0 }));
    }
  };

  if (hidden === "1") {
    return (
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => setHidden("0")}>
          <Eye className="size-4" />
          {t("planning_widget_show")}
        </Button>
      </div>
    );
  }

  const data = results.map((r) => ({ name: r.name, own: Math.round(r.cashNeeded), borrowed: Math.round(r.borrowing) }));
  const totalCash = results.reduce((s, r) => s + r.cashNeeded, 0);
  const totalBorrow = results.reduce((s, r) => s + r.borrowing, 0);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Telescope className="size-5 text-primary" aria-hidden="true" />
            {t("planning_widget_title")}
          </CardTitle>
          <Badge variant="outline">{t("planning_widget_not_in_net_worth")}</Badge>
          {verdict === "not_bankable" && <Badge variant="destructive">{t("planning_not_bankable")}</Badge>}
          {verdict === "bankable" && <Badge variant="secondary">{t("planning_bankable")}</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/planning">{t("planning_widget_open")}</Link>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setHidden("1")} aria-label={t("planning_widget_hide")}>
            <EyeOff className="size-4" />
            {t("planning_widget_hide")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("planning_widget_empty")}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">{t("planning_widget_total_cash")}</p>
                <p className="text-lg font-semibold text-primary">{money(totalCash)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("planning_widget_total_borrow")}</p>
                <p className="text-lg font-semibold text-foreground">{money(totalBorrow)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("planning_liquid_cash")}</p>
                <p className="text-lg font-semibold text-foreground">{money(liquidCash)}</p>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip
                    formatter={(value) => money(Number(value))}
                    contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
                  />
                  <Legend />
                  <Bar dataKey="own" stackId="cost" name={t("planning_widget_own_cash")} fill="var(--color-primary)" />
                  <Bar dataKey="borrowed" stackId="cost" name={t("planning_borrowing")} fill="var(--color-muted-foreground)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
