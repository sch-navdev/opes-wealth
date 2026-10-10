"use client";

import { moneyFormatter } from "@/lib/money-parts";
import { useMemo, useState, useTransition } from "react";
import { Pencil, Plus, Trash2, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IncomeStreamDialog } from "@/components/income-stream-dialog";
import { useCashFlowText } from "@/components/cash-flow-text";
import { deleteIncomeStream } from "@/app/dashboard/income-stream-actions";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import type { CashFlowKey } from "@/lib/cash-flow-labels";
import {
  expandIncomeStreams,
  monthlyEquivalentBase,
  summarizeIncomeStreams,
  type IncomeStream,
} from "@/lib/income-streams";
import { cn } from "@/lib/utils";

/** Same terminal-dense table style as the Expert panels: 12 px type, tight rows, gold rule under the header. */
const TERMINAL_TABLE = cn(
  "w-full caption-bottom text-xs tabular-nums",
  "[&_td]:px-2 [&_td]:py-1 [&_th]:h-8 [&_th]:px-2 [&_th]:text-start [&_th]:font-medium",
  "[&_thead_th]:border-b [&_thead_th]:border-primary/40",
  "[&_tbody_tr]:border-b [&_tbody_tr]:border-border/60 [&_tbody_tr:nth-child(even)]:bg-muted/25 [&_tbody_tr:hover]:bg-primary/10",
);
const num = "text-end tabular-nums whitespace-nowrap font-mono";

/**
 * /dashboard/cash-flow: the user's earned-income streams (NET amounts) with a totals row in the Base
 * Currency, plus the add / edit / delete dialogs. Totals come from `lib/income-streams.ts`.
 */
export function IncomeStreamsManager({
  streams,
  baseCurrency,
  rates,
  asOf,
  available,
  readOnly,
  employers = [],
}: {
  streams: IncomeStream[];
  baseCurrency: string;
  rates: Record<string, number>;
  /** YYYY-MM-DD, "today" on the server. */
  asOf: string;
  /** False while migration 0037 is not applied. */
  available: boolean;
  readOnly?: boolean;
  /** The user's own companies / entities that can be the employer of a stream. */
  employers?: { id: string; name: string }[];
}) {
  const tt = useCashFlowText();
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const [editing, setEditing] = useState<IncomeStream | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<IncomeStream | null>(null);
  const [deleteError, setDeleteError] = useState<CashFlowKey | null>(null);
  const [pending, startTransition] = useTransition();

  const base = useMemo(
    () => moneyFormatter(intlLocale, baseCurrency, { maximumFractionDigits: 0 }),
    [intlLocale, baseCurrency],
  );
  const native = (amount: number, currency: string) => {
    try {
      return moneyFormatter(intlLocale, currency, { maximumFractionDigits: 2 }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  };
  const monthShort = useMemo(() => new Intl.DateTimeFormat(intlLocale, { month: "short", timeZone: "UTC" }), [intlLocale]);

  const summary = useMemo(() => summarizeIncomeStreams(streams, asOf, rates, baseCurrency), [streams, asOf, rates, baseCurrency]);
  const next12 = useMemo(() => {
    const by = new Map<string, number>();
    for (const o of expandIncomeStreams(streams, asOf, rates, baseCurrency)) by.set(o.streamId, (by.get(o.streamId) ?? 0) + o.baseAmount);
    return by;
  }, [streams, asOf, rates, baseCurrency]);

  const payOn = (s: IncomeStream) => {
    const day = s.pay_day ?? 1;
    if (s.frequency === "monthly" || s.pay_month == null) return String(day);
    return `${day} ${monthShort.format(new Date(Date.UTC(2026, s.pay_month - 1, 1)))}`;
  };

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(s: IncomeStream) {
    setEditing(s);
    setDialogOpen(true);
  }
  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startTransition(async () => {
      const r = await deleteIncomeStream(target.id);
      if (r.ok) {
        setDeleting(null);
        setDeleteError(null);
      } else setDeleteError(r.error);
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-medium text-foreground">{tt("cf_title")}</h1>
          <p className="text-sm text-muted-foreground">{tt("cf_subtitle")}</p>
        </div>
        <Button onClick={openAdd} disabled={!available || readOnly} className="gap-1.5">
          <Plus className="size-4" aria-hidden="true" />
          {tt("cf_add")}
        </Button>
      </div>

      {!available && <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">{tt("cf_unavailable")}</p>}
      {readOnly && <p className="text-xs text-muted-foreground">{tt("cf_demo_note")}</p>}

      {streams.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-10 text-center">
          <WalletCards className="size-5 text-primary" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">{tt("cf_empty")}</p>
          <p className="max-w-md text-xs text-muted-foreground">{tt("cf_empty_hint")}</p>
        </div>
      ) : (
        <div role="region" aria-label={tt("cf_table_caption")} tabIndex={0} className="overflow-x-auto rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <table className={TERMINAL_TABLE}>
            <caption className="sr-only">{tt("cf_table_caption")}</caption>
            <thead>
              <tr>
                <th scope="col">{tt("cf_col_label")}</th>
                <th scope="col">{tt("cf_col_kind")}</th>
                <th scope="col" className="text-end">{tt("cf_col_amount")}</th>
                <th scope="col">{tt("cf_col_freq")}</th>
                <th scope="col">{tt("cf_col_when")}</th>
                <th scope="col">{tt("cf_col_period")}</th>
                <th scope="col" className="text-end">{tt("cf_col_monthly", { currency: baseCurrency })}</th>
                <th scope="col" className="text-end">{tt("cf_col_next", { currency: baseCurrency })}</th>
                <th scope="col"><span className="sr-only">{tt("cf_col_actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {streams.map((s) => (
                <tr key={s.id}>
                  <td className="max-w-56 truncate">
                    <span className="text-foreground">{s.label}</span>
                    {s.source_name && <span className="ms-2 text-muted-foreground">{s.source_name}</span>}
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground">{tt(`cf_kind_${s.kind}` as CashFlowKey)}</td>
                  <td className={num}>{maskValue(native(s.amount, s.currency))}</td>
                  <td className="whitespace-nowrap">{tt(`cf_freq_${s.frequency}` as CashFlowKey)}</td>
                  <td className="whitespace-nowrap font-mono">{payOn(s)}</td>
                  <td className="whitespace-nowrap font-mono text-muted-foreground">
                    {s.start_date} {"->"} {s.end_date ?? tt("cf_ongoing")}
                  </td>
                  <td className={num}>{maskValue(base.format(monthlyEquivalentBase(s, asOf, baseCurrency, rates)))}</td>
                  <td className={num}>{maskValue(base.format(next12.get(s.id) ?? 0))}</td>
                  <td className="whitespace-nowrap text-end">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => openEdit(s)}
                      disabled={readOnly}
                      aria-label={tt("cf_edit", { label: s.label })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleting(s);
                      }}
                      disabled={readOnly}
                      aria-label={tt("cf_delete", { label: s.label })}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-primary/40 font-medium">
                <th scope="row" colSpan={6} className="text-start">
                  {tt("cf_totals_label")} ({baseCurrency})
                </th>
                <td className={num} aria-label={tt("cf_totals_monthly")}>
                  {maskValue(base.format(summary.monthlyEquivalent))}
                </td>
                <td className={num} aria-label={tt("cf_totals_annual")}>
                  {maskValue(base.format(summary.next12Months))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {streams.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="border-s-2 border-primary ps-3">
            <dt className="text-xs text-muted-foreground">{tt("cf_totals_monthly")}</dt>
            <dd className="font-mono text-lg tabular-nums text-foreground">{maskValue(base.format(summary.monthlyEquivalent))}</dd>
          </div>
          <div className="border-s-2 border-primary ps-3">
            <dt className="text-xs text-muted-foreground">{tt("cf_totals_annual")}</dt>
            <dd className="font-mono text-lg tabular-nums text-foreground">{maskValue(base.format(summary.next12Months))}</dd>
          </div>
        </dl>
      )}
      <p className="text-xs text-muted-foreground">
        {tt("cf_net_note")} {streams.length > 0 && tt("cf_totals_note")}
      </p>

      <IncomeStreamDialog open={dialogOpen} onOpenChange={setDialogOpen} stream={editing} baseCurrency={baseCurrency} employers={employers} />

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tt("cf_delete", { label: deleting?.label ?? "" })}</DialogTitle>
            <DialogDescription>{tt("cf_delete_confirm", { label: deleting?.label ?? "" })}</DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {tt(deleteError)}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={pending}>
              {tt("cf_cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={pending}>
              {tt("cf_delete_yes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
