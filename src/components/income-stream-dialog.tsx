"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCashFlowText } from "@/components/cash-flow-text";
import { createIncomeStream, updateIncomeStream } from "@/app/dashboard/income-stream-actions";
import { useLanguage } from "@/context/language-context";
import { currencies } from "@/lib/currencies";
import type { CashFlowKey } from "@/lib/cash-flow-labels";
import {
  INCOME_FREQUENCIES,
  INCOME_KINDS,
  validateIncomeStream,
  type IncomeStream,
} from "@/lib/income-streams";

const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30";

type FormState = {
  kind: string;
  label: string;
  source_name: string;
  amount: string;
  currency: string;
  frequency: string;
  pay_day: string;
  pay_month: string;
  start_date: string;
  end_date: string;
  notes: string;
};

function initialState(stream: IncomeStream | null, baseCurrency: string): FormState {
  if (!stream) {
    return {
      kind: "salary",
      label: "",
      source_name: "",
      amount: "",
      currency: baseCurrency,
      frequency: "monthly",
      pay_day: "",
      pay_month: "",
      start_date: new Date().toISOString().slice(0, 10),
      end_date: "",
      notes: "",
    };
  }
  return {
    kind: stream.kind,
    label: stream.label,
    source_name: stream.source_name,
    amount: String(stream.amount),
    currency: stream.currency,
    frequency: stream.frequency,
    pay_day: stream.pay_day == null ? "" : String(stream.pay_day),
    pay_month: stream.pay_month == null ? "" : String(stream.pay_month),
    start_date: stream.start_date,
    end_date: stream.end_date ?? "",
    notes: stream.notes,
  };
}

/** Add / edit dialog for one income stream. Remounts its form each time it opens (via `key`). */
export function IncomeStreamDialog({
  open,
  onOpenChange,
  stream,
  baseCurrency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stream: IncomeStream | null;
  baseCurrency: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {open && (
          <StreamForm key={stream?.id ?? "new"} stream={stream} baseCurrency={baseCurrency} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StreamForm({
  stream,
  baseCurrency,
  onDone,
}: {
  stream: IncomeStream | null;
  baseCurrency: string;
  onDone: () => void;
}) {
  const tt = useCashFlowText();
  const { intlLocale } = useLanguage();
  const [form, setForm] = useState<FormState>(() => initialState(stream, baseCurrency));
  const [error, setError] = useState<CashFlowKey | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (name: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [name]: e.target.value }));

  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale, { month: "long", timeZone: "UTC" });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(Date.UTC(2026, i, 1))));
  }, [intlLocale]);

  const codes = useMemo(() => {
    const list = currencies.map((c) => c.code);
    return list.includes(form.currency) || !form.currency ? list : [form.currency, ...list];
  }, [form.currency]);

  const needsMonth = form.frequency !== "monthly";
  const monthRequired = form.frequency === "annual" || form.frequency === "one_off";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validateIncomeStream({
      ...form,
      amount: form.amount,
      pay_day: form.pay_day,
      pay_month: needsMonth ? form.pay_month : "",
      end_date: form.end_date || null,
    });
    if (!v.ok) {
      setError(v.error);
      return;
    }
    startTransition(async () => {
      const result = stream ? await updateIncomeStream(stream.id, v.value) : await createIncomeStream(v.value);
      if (result.ok) onDone();
      else setError(result.error);
    });
  }

  const invalid = (codesFor: string[]) => (error && codesFor.includes(error) ? true : undefined);

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{tt(stream ? "cf_dialog_edit" : "cf_dialog_add")}</DialogTitle>
        <DialogDescription>{tt("cf_dialog_desc")}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cf-kind">{tt("cf_field_kind")}</Label>
          <select id="cf-kind" className={SELECT_CLASS} value={form.kind} onChange={set("kind")} aria-invalid={invalid(["cf_err_kind"])}>
            {INCOME_KINDS.map((k) => (
              <option key={k} value={k}>
                {tt(`cf_kind_${k}` as CashFlowKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-label">{tt("cf_field_label")}</Label>
          <Input id="cf-label" value={form.label} onChange={set("label")} maxLength={120} aria-invalid={invalid(["cf_err_label"])} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="cf-source">{tt("cf_field_source")}</Label>
          <Input id="cf-source" value={form.source_name} onChange={set("source_name")} maxLength={120} aria-invalid={invalid(["cf_err_source"])} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-amount">{tt("cf_field_amount")}</Label>
          <Input
            id="cf-amount"
            inputMode="decimal"
            className="font-mono"
            value={form.amount}
            onChange={set("amount")}
            aria-invalid={invalid(["cf_err_amount"])}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-currency">{tt("cf_field_currency")}</Label>
          <select id="cf-currency" className={SELECT_CLASS} value={form.currency} onChange={set("currency")} aria-invalid={invalid(["cf_err_currency"])}>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-frequency">{tt("cf_field_frequency")}</Label>
          <select id="cf-frequency" className={SELECT_CLASS} value={form.frequency} onChange={set("frequency")} aria-invalid={invalid(["cf_err_frequency"])}>
            {INCOME_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {tt(`cf_freq_${f}` as CashFlowKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-pay-day">{tt("cf_field_pay_day")}</Label>
          <Input
            id="cf-pay-day"
            type="number"
            min={1}
            max={31}
            className="font-mono"
            value={form.pay_day}
            onChange={set("pay_day")}
            aria-invalid={invalid(["cf_err_pay_day"])}
          />
        </div>
        {needsMonth && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cf-pay-month">{tt(form.frequency === "quarterly" ? "cf_field_pay_month_first" : "cf_field_pay_month")}</Label>
            <select
              id="cf-pay-month"
              className={SELECT_CLASS}
              value={form.pay_month}
              onChange={set("pay_month")}
              required={monthRequired}
              aria-invalid={invalid(["cf_err_pay_month"])}
            >
              <option value="">{tt("cf_pay_month_none")}</option>
              {monthNames.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="text-xs text-muted-foreground sm:col-span-2">{tt("cf_pay_day_hint")}</p>
        <div className="space-y-1.5">
          <Label htmlFor="cf-start">{tt("cf_field_start")}</Label>
          <Input id="cf-start" type="date" className="font-mono" value={form.start_date} onChange={set("start_date")} aria-invalid={invalid(["cf_err_start"])} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-end">{tt("cf_field_end")}</Label>
          <Input id="cf-end" type="date" className="font-mono" value={form.end_date} onChange={set("end_date")} aria-invalid={invalid(["cf_err_end"])} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="cf-notes">{tt("cf_field_notes")}</Label>
          <Input id="cf-notes" value={form.notes} onChange={set("notes")} maxLength={2000} aria-invalid={invalid(["cf_err_notes"])} />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {tt(error)}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          {tt("cf_cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {tt(pending ? "cf_saving" : "cf_save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
