"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, HandCoins } from "lucide-react";
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
import type { TranslationKey } from "@/lib/i18n";
import type { PassiveIncomeSource, PassiveIncomeSummary } from "@/lib/passive-income";
import { cn } from "@/lib/utils";

const SOURCE_LABEL_KEYS: Record<PassiveIncomeSource, TranslationKey> = {
  reit: "passive_source_reit",
  stocks: "passive_source_stocks",
  rental: "passive_source_rental",
  private_equity: "passive_source_private_equity",
};

/**
 * Dashboard card for passive income: gross income of the last 12 months, the
 * projected next 12 months and the implied yield. Clicking it opens a modal
 * with the breakdown by source (click a source to filter) and by holding, with
 * how each projection was derived. See `lib/passive-income.ts`.
 */
export function PassiveIncomeCard({
  summary,
  baseCurrency,
}: {
  summary: PassiveIncomeSummary;
  baseCurrency: string;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<PassiveIncomeSource | null>(null);

  const money = useMemo(
    () => new Intl.NumberFormat(intlLocale, { style: "currency", currency: baseCurrency, maximumFractionDigits: 0 }),
    [intlLocale, baseCurrency],
  );
  const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);

  const rows = filter ? summary.rows.filter((r) => r.source === filter) : summary.rows;
  const rowsLastYear = rows.reduce((s, r) => s + r.lastYear, 0);
  const rowsProjected = rows.reduce((s, r) => s + r.projected, 0);
  const maxSource = Math.max(1, ...summary.bySource.map((s) => Math.max(s.lastYear, s.projected)));
  const empty = summary.rows.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("breakdown_click_hint")}
        className="block w-full rounded-xl text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card className="border-border bg-card transition-colors animate-in fade-in slide-in-from-bottom-2 duration-300 hover:bg-muted motion-reduce:animate-none">
          <CardContent className="grid grid-cols-1 items-center gap-4 py-4 sm:grid-cols-[auto_1fr_1fr_1fr]">
            <div className="flex items-center gap-3">
              <div className="flex shrink-0 items-center justify-center text-primary">
                <HandCoins className="size-4" />
              </div>
              <p className="text-sm font-medium text-foreground">{t("passive_income_title")}</p>
            </div>
            {empty ? (
              <p className="text-sm text-muted-foreground sm:col-span-3">{t("passive_income_empty")}</p>
            ) : (
              <>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t("passive_last_year")}</p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {maskValue(money.format(summary.lastYear))}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t("passive_projected")}</p>
                  <p className="text-lg font-semibold tabular-nums text-success">
                    {maskValue(money.format(summary.projected))}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t("passive_yield")}</p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">{pct(summary.yieldPct)}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setFilter(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-background sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("passive_income_title")}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("passive_income_desc", { currency: baseCurrency })}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: t("passive_last_year"), value: money.format(summary.lastYear), tone: "text-foreground", masked: true },
              { label: t("passive_projected"), value: money.format(summary.projected), tone: "text-success", masked: true },
              { label: t("passive_yield"), value: pct(summary.yieldPct), tone: "text-foreground", masked: false },
            ].map((m) => (
              <div key={m.label} className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className={cn("text-lg font-semibold tabular-nums", m.tone)}>
                  {m.masked ? maskValue(m.value) : m.value}
                </p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{t("passive_by_source")}</p>
            <ul className="space-y-2">
              {summary.bySource
                .filter((s) => s.count > 0)
                .map((s) => {
                  const active = filter === s.source;
                  return (
                    <li key={s.source}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setFilter(active ? null : s.source)}
                        className={cn(
                          "w-full space-y-1.5 rounded-md border p-3 text-start transition-colors hover:bg-muted",
                          active ? "border-primary bg-primary/5" : "border-border bg-card",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium text-foreground">
                            {t(SOURCE_LABEL_KEYS[s.source])}{" "}
                            <span className="font-normal text-muted-foreground">({s.count})</span>
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {maskValue(money.format(s.lastYear))} →{" "}
                            <span className="text-success">{maskValue(money.format(s.projected))}</span>
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${(s.projected / maxSource) * 100}%` }}
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
            </ul>
            {!empty && <p className="text-xs text-muted-foreground">{t("passive_filter_hint")}</p>}
          </div>

          {!empty && (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-muted-foreground">{t("breakdown_asset")}</TableHead>
                    <TableHead className="text-end text-muted-foreground">{t("passive_last_year")}</TableHead>
                    <TableHead className="text-end text-muted-foreground">{t("passive_projected")}</TableHead>
                    <TableHead className="text-end text-muted-foreground">{t("passive_yield")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium text-foreground">
                        <Link
                          href={`/dashboard/assets/${r.id}`}
                          className="hover:underline"
                          onClick={() => setOpen(false)}
                        >
                          {r.name}
                        </Link>
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t(SOURCE_LABEL_KEYS[r.source])}
                          {r.method && ` · ${t(`passive_method_${r.method}` as TranslationKey)}`}
                        </span>
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-foreground">
                        {maskValue(money.format(r.lastYear))}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-success">
                        {maskValue(money.format(r.projected))}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-muted-foreground">{pct(r.yieldPct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-medium text-foreground">{t("breakdown_total")}</TableCell>
                    <TableCell className="text-end font-semibold tabular-nums text-foreground">
                      {maskValue(money.format(rowsLastYear))}
                    </TableCell>
                    <TableCell className="text-end font-semibold tabular-nums text-success">
                      {maskValue(money.format(rowsProjected))}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
            {t("passive_disclaimer")}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
