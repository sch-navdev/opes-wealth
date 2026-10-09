"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Scale, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGratuityText } from "@/components/gratuity-text";
import { createGratuityPlan, deleteGratuityPlan, updateGratuityPlan } from "@/app/dashboard/gratuity-actions";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { currencies } from "@/lib/currencies";
import type { GratuityKey } from "@/lib/gratuity-labels";
import { cn } from "@/lib/utils";
import {
  UAE_GRATUITY_RULES,
  calculateGratuity,
  validatePlan,
  type EndOfServicePlan,
} from "@/lib/uae-gratuity";

const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30";
const mono = "font-mono tabular-nums";

type WageRow = { from: string; basic: string };
type PayRow = { date: string; amount: string; note: string };
type Form = {
  employer: string;
  start: string;
  end: string;
  contract: string;
  unpaid: string;
  currency: string;
  stated: string;
  notes: string;
  wages: WageRow[];
  payments: PayRow[];
};

/** "12,000.50" -> 12000.5; empty or junk -> NaN. */
function num(s: string): number {
  const t = s.replace(/[,\s]/g, "");
  return t === "" ? Number.NaN : Number(t);
}

function blankForm(currency: string): Form {
  return { employer: "", start: "", end: "", contract: "unlimited", unpaid: "0", currency, stated: "", notes: "", wages: [{ from: "", basic: "" }], payments: [] };
}

function formFromPlan(p: EndOfServicePlan): Form {
  return {
    employer: p.employer,
    start: p.start_date,
    end: p.end_date ?? "",
    contract: p.contract_type,
    unpaid: String(p.unpaid_leave_days),
    currency: p.currency,
    stated: p.employer_stated_balance == null ? "" : String(p.employer_stated_balance),
    notes: p.notes,
    wages: p.wage_history.map((w) => ({ from: w.from, basic: String(w.basicMonthly) })),
    payments: p.payments.map((x) => ({ date: x.date, amount: String(x.amount), note: x.note })),
  };
}

function toPlanInput(f: Form) {
  return {
    employer: f.employer,
    start_date: f.start,
    end_date: f.end || null,
    contract_type: f.contract,
    unpaid_leave_days: f.unpaid.trim() === "" ? 0 : num(f.unpaid),
    wage_history: f.wages.filter((w) => w.from || w.basic).map((w) => ({ from: w.from, basicMonthly: num(w.basic) })),
    payments: f.payments.filter((p) => p.date || p.amount).map((p) => ({ date: p.date, amount: num(p.amount), note: p.note })),
    employer_stated_balance: f.stated.trim() === "" ? null : num(f.stated),
    currency: f.currency,
    notes: f.notes,
  };
}

/**
 * Gratuity section of /dashboard/cash-flow: a dense editor on the left, the live result on the right.
 * The calculation is `lib/uae-gratuity.ts` (informational, not legal advice). Without the table
 * (migration 0040 not applied) the calculator still works but nothing is stored.
 */
export function GratuityManager({
  plans,
  available,
  readOnly,
  defaultCurrency = "AED",
  asOf,
}: {
  plans: EndOfServicePlan[];
  available: boolean;
  readOnly?: boolean;
  defaultCurrency?: string;
  /** YYYY-MM-DD, "today" on the server. */
  asOf: string;
}) {
  const tt = useGratuityText();
  const [selected, setSelected] = useState<string>(plans[0]?.id ?? "new");
  const [editorKey, setEditorKey] = useState(0);
  const current = plans.find((p) => p.id === selected) ?? null;

  return (
    <section className="space-y-4" aria-labelledby="gratuity-title">
      <div className="space-y-1">
        <h2 id="gratuity-title" className="flex items-center gap-2 text-lg font-medium text-foreground">
          <Scale className="size-4 text-primary" aria-hidden="true" />
          {tt("grat_title")}
        </h2>
        <p className="text-sm text-muted-foreground">{tt("grat_subtitle")}</p>
      </div>

      <div className="space-y-1 border-s-2 border-primary ps-3 text-xs text-muted-foreground">
        <p>{tt("grat_disclaimer", { date: UAE_GRATUITY_RULES.asOf })}</p>
        <p>{tt("grat_rules")}</p>
        <p>{tt("grat_due")}</p>
      </div>
      <ul className="space-y-1 text-xs text-foreground" aria-label="warnings">
        {(["grat_warn_freezone", "grat_warn_national"] as const).map((k) => (
          <li key={k} className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>{tt(k)}</span>
          </li>
        ))}
      </ul>

      {!available && <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">{tt("grat_unavailable")}</p>}
      {readOnly && <p className="text-xs text-muted-foreground">{tt("grat_demo_note")}</p>}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={tt("grat_plans_label")}>
        {plans.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={selected === p.id ? "default" : "outline"}
            aria-pressed={selected === p.id}
            onClick={() => {
              setSelected(p.id);
              setEditorKey((k) => k + 1);
            }}
          >
            {p.employer}
          </Button>
        ))}
        <Button
          size="sm"
          variant={selected === "new" ? "default" : "outline"}
          aria-pressed={selected === "new"}
          disabled={readOnly && plans.length > 0}
          onClick={() => {
            setSelected("new");
            setEditorKey((k) => k + 1);
          }}
          className="gap-1"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {tt("grat_new_plan")}
        </Button>
      </div>

      <Editor
        key={editorKey}
        plan={current}
        available={available}
        readOnly={!!readOnly}
        defaultCurrency={defaultCurrency}
        asOf={asOf}
        onCreated={(id) => setSelected(id)}
        onDeleted={() => {
          setSelected("new");
          setEditorKey((k) => k + 1);
        }}
      />
    </section>
  );
}

function Editor({
  plan,
  available,
  readOnly,
  defaultCurrency,
  asOf,
  onCreated,
  onDeleted,
}: {
  plan: EndOfServicePlan | null;
  available: boolean;
  readOnly: boolean;
  defaultCurrency: string;
  asOf: string;
  onCreated: (id: string) => void;
  onDeleted: () => void;
}) {
  const tt = useGratuityText();
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const [form, setForm] = useState<Form>(() => (plan ? formFromPlan(plan) : blankForm(defaultCurrency)));
  const [planId, setPlanId] = useState<string | null>(plan?.id ?? null);
  const [error, setError] = useState<GratuityKey | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (name: keyof Omit<Form, "wages" | "payments">) => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm((f) => ({ ...f, [name]: e.target.value }));
  };
  const setWage = (i: number, patch: Partial<WageRow>) => {
    setSaved(false);
    setForm((f) => ({ ...f, wages: f.wages.map((w, j) => (j === i ? { ...w, ...patch } : w)) }));
  };
  const setPay = (i: number, patch: Partial<PayRow>) => {
    setSaved(false);
    setForm((f) => ({ ...f, payments: f.payments.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  };

  const fmt = useMemo(() => {
    const cur = /^[A-Z]{3}$/.test(form.currency) ? form.currency : "AED";
    try {
      return new Intl.NumberFormat(intlLocale, { style: "currency", currency: cur, maximumFractionDigits: 2 });
    } catch {
      return new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 2 });
    }
  }, [intlLocale, form.currency]);
  const money = (n: number) => maskValue(fmt.format(n));
  const years = useMemo(() => new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 2 }), [intlLocale]);

  const result = useMemo(() => {
    const p = toPlanInput(form);
    return calculateGratuity({
      startDate: form.start,
      endDate: form.end || null,
      today: asOf,
      wageHistory: p.wage_history,
      unpaidLeaveDays: Number.isFinite(p.unpaid_leave_days) ? p.unpaid_leave_days : -1,
      payments: p.payments,
      employerStatedBalance: p.employer_stated_balance,
    });
  }, [form, asOf]);

  const codes = useMemo(() => {
    const list = currencies.map((c) => c.code);
    return list.includes(form.currency) || !form.currency ? list : [form.currency, ...list];
  }, [form.currency]);

  function save() {
    setError(null);
    setSaved(false);
    const v = validatePlan(toPlanInput(form));
    if (!v.ok) {
      setError(v.error);
      return;
    }
    startTransition(async () => {
      const r = planId ? await updateGratuityPlan(planId, v.value) : await createGratuityPlan(v.value);
      if (r.ok) {
        setSaved(true);
        if (!planId && r.id) {
          setPlanId(r.id);
          onCreated(r.id);
        }
      } else setError(r.error);
    });
  }

  function remove() {
    if (!planId) return;
    startTransition(async () => {
      const r = await deleteGratuityPlan(planId);
      if (r.ok) onDeleted();
      else setError(r.error);
    });
  }

  const bad = (...codesFor: string[]) => (error && codesFor.includes(error) ? true : undefined);
  const canSave = available && !readOnly;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) save();
        }}
        noValidate
        className="space-y-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="grat-employer">{tt("grat_field_employer")}</Label>
            <Input id="grat-employer" value={form.employer} maxLength={120} onChange={set("employer")} aria-invalid={bad("grat_err_employer")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grat-start">{tt("grat_field_start")}</Label>
            <Input id="grat-start" type="date" value={form.start} onChange={set("start")} aria-invalid={bad("grat_err_start")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grat-end">{tt("grat_field_end")}</Label>
            <Input id="grat-end" type="date" value={form.end} onChange={set("end")} aria-invalid={bad("grat_err_end")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grat-contract">{tt("grat_field_contract")}</Label>
            <select id="grat-contract" className={SELECT_CLASS} value={form.contract} onChange={set("contract")} aria-invalid={bad("grat_err_contract")}>
              <option value="unlimited">{tt("grat_contract_unlimited")}</option>
              <option value="limited">{tt("grat_contract_limited")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grat-unpaid">{tt("grat_field_unpaid")}</Label>
            <Input id="grat-unpaid" inputMode="numeric" className={mono} value={form.unpaid} onChange={set("unpaid")} aria-invalid={bad("grat_err_unpaid_leave")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grat-currency">{tt("grat_field_currency")}</Label>
            <select id="grat-currency" className={SELECT_CLASS} value={form.currency} onChange={set("currency")} aria-invalid={bad("grat_err_currency")}>
              {codes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grat-stated">{tt("grat_field_stated")}</Label>
            <Input id="grat-stated" inputMode="decimal" className={mono} value={form.stated} onChange={set("stated")} aria-invalid={bad("grat_err_stated")} />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">{tt("grat_wages")}</legend>
          <p className="text-xs text-muted-foreground">{tt("grat_wages_hint")}</p>
          {form.wages.map((w, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor={`grat-wfrom-${i}`} className="text-xs">{tt("grat_wage_from")}</Label>
                <Input id={`grat-wfrom-${i}`} type="date" value={w.from} onChange={(e) => setWage(i, { from: e.target.value })} aria-invalid={bad("grat_err_wage")} />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor={`grat-wbasic-${i}`} className="text-xs">{tt("grat_wage_basic")}</Label>
                <Input id={`grat-wbasic-${i}`} inputMode="decimal" className={mono} value={w.basic} onChange={(e) => setWage(i, { basic: e.target.value })} aria-invalid={bad("grat_err_wage")} />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`${tt("grat_remove")} (${tt("grat_wages")} ${i + 1})`}
                disabled={form.wages.length <= 1}
                onClick={() => setForm((f) => ({ ...f, wages: f.wages.filter((_, j) => j !== i) }))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setForm((f) => ({ ...f, wages: [...f.wages, { from: "", basic: "" }] }))}>
            <Plus className="size-3.5" aria-hidden="true" />
            {tt("grat_wage_add")}
          </Button>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">{tt("grat_payments")}</legend>
          <p className="text-xs text-muted-foreground">{tt("grat_payments_hint")}</p>
          {form.payments.map((p, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor={`grat-pdate-${i}`} className="text-xs">{tt("grat_pay_date")}</Label>
                <Input id={`grat-pdate-${i}`} type="date" value={p.date} onChange={(e) => setPay(i, { date: e.target.value })} aria-invalid={bad("grat_err_payment")} />
              </div>
              <div className="w-32 space-y-1">
                <Label htmlFor={`grat-pamount-${i}`} className="text-xs">{tt("grat_pay_amount")}</Label>
                <Input id={`grat-pamount-${i}`} inputMode="decimal" className={mono} value={p.amount} onChange={(e) => setPay(i, { amount: e.target.value })} aria-invalid={bad("grat_err_payment")} />
              </div>
              <div className="min-w-24 flex-1 space-y-1">
                <Label htmlFor={`grat-pnote-${i}`} className="text-xs">{tt("grat_pay_note")}</Label>
                <Input id={`grat-pnote-${i}`} value={p.note} maxLength={200} onChange={(e) => setPay(i, { note: e.target.value })} />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`${tt("grat_remove")} (${tt("grat_payments")} ${i + 1})`}
                onClick={() => setForm((f) => ({ ...f, payments: f.payments.filter((_, j) => j !== i) }))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setForm((f) => ({ ...f, payments: [...f.payments, { date: "", amount: "", note: "" }] }))}>
            <Plus className="size-3.5" aria-hidden="true" />
            {tt("grat_pay_add")}
          </Button>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="grat-notes">{tt("grat_field_notes")}</Label>
          <Input id="grat-notes" value={form.notes} maxLength={2000} onChange={set("notes")} aria-invalid={bad("grat_err_notes")} />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {tt(error)}
          </p>
        )}
        {saved && <p role="status" className="text-sm text-muted-foreground">{tt("grat_saved")}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={!canSave || pending}>
            {pending ? tt("grat_saving") : tt("grat_save")}
          </Button>
          {planId && !confirmDelete && (
            <Button type="button" variant="outline" disabled={readOnly || pending} onClick={() => setConfirmDelete(true)}>
              {tt("grat_delete")}
            </Button>
          )}
          {planId && confirmDelete && (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span>{tt("grat_delete_confirm")}</span>
              <Button type="button" variant="destructive" size="sm" onClick={remove} disabled={pending}>
                {tt("grat_delete_yes")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)} disabled={pending}>
                {tt("grat_cancel")}
              </Button>
            </span>
          )}
        </div>
      </form>

      <div className="space-y-4" aria-live="polite">
        <h3 className="text-sm font-medium text-foreground">{tt("grat_results")}</h3>
        {!result.valid ? (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{tt("grat_enter_more")}</p>
        ) : (
          <Results r={result} money={money} years={(n) => years.format(n)} tt={tt} />
        )}
      </div>
    </div>
  );
}

function Row({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn(mono, "text-end", strong ? "text-sm font-medium text-foreground" : "text-foreground")}>{children}</dd>
    </div>
  );
}

function Results({
  r,
  money,
  years,
  tt,
}: {
  r: Extract<ReturnType<typeof calculateGratuity>, { valid: true }>;
  money: (n: number) => string;
  years: (n: number) => string;
  tt: ReturnType<typeof useGratuityText>;
}) {
  const capPct = r.law.cap > 0 ? Math.min(100, Math.round((r.law.uncapped / r.law.cap) * 100)) : 0;
  const rec = r.reconciliation;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-3">
        <div className="border-s-2 border-primary ps-3">
          <dt className="text-xs text-muted-foreground">{tt("grat_entitlement")}</dt>
          <dd className={cn(mono, "text-base text-foreground")}>{money(r.law.amount)}</dd>
        </div>
        <div className="border-s-2 border-primary ps-3">
          <dt className="text-xs text-muted-foreground">{tt("grat_paid")}</dt>
          <dd className={cn(mono, "text-base text-foreground")}>{money(r.paid.total)}</dd>
        </div>
        <div className="border-s-2 border-primary ps-3">
          <dt className="text-xs text-muted-foreground">{tt("grat_outstanding")}</dt>
          <dd className={cn(mono, "text-lg font-medium text-foreground")}>{money(r.outstanding)}</dd>
        </div>
      </dl>

      <dl>
        <Row label={tt("grat_service")}>{tt("grat_service_value", { whole: r.service.wholeYears, extra: r.service.extraDays })}</Row>
        <Row label={tt("grat_last_basic")}>{money(r.lastBasic)}</Row>
        <Row label={tt("grat_daily")}>{money(r.lastBasic / UAE_GRATUITY_RULES.daysPerMonthDivisor)}</Row>
        <Row label={tt("grat_tier_first")}>{tt("grat_days", { days: years(r.law.daysFirstTier) })}</Row>
        <Row label={tt("grat_tier_second")}>{tt("grat_days", { days: years(r.law.daysSecondTier) })}</Row>
        <Row label={tt("grat_total_days")}>{tt("grat_days", { days: years(r.law.totalDays) })}</Row>
      </dl>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">{tt("grat_cap")}</span>
          <span className={mono}>{money(r.law.cap)} / {tt("grat_cap_usage", { pct: capPct })}</span>
        </div>
        <div
          role="progressbar"
          aria-label={tt("grat_cap")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={capPct}
          className="h-1.5 w-full bg-muted"
        >
          <div className="h-full bg-primary" style={{ width: `${capPct}%` }} />
        </div>
        {r.law.capped && <p className="text-xs text-foreground">{tt("grat_cap_reached")}</p>}
        {r.monthlyAccrual > 0 && <p className="text-xs text-muted-foreground">{tt("grat_accrual", { amount: money(r.monthlyAccrual) })}</p>}
      </div>

      <div className="space-y-1">
        <h4 className="text-xs font-medium text-foreground">{tt("grat_since_title")}</h4>
        {r.paid.lastDate == null ? (
          <p className="text-xs text-muted-foreground">{tt("grat_since_none")}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{tt("grat_since_from", { date: r.sinceLastPayment.from })}</p>
            <p className="text-xs text-foreground">
              {tt("grat_since_value", { years: years(r.sinceLastPayment.years), amount: money(r.sinceLastPayment.entitlement) })}
            </p>
          </>
        )}
      </div>

      <div className="space-y-1">
        <h4 className="text-xs font-medium text-foreground">{tt("grat_period_title")}</h4>
        <p className="text-xs text-muted-foreground">{tt("grat_period_note")}</p>
        <dl>
          <Row label={tt("grat_period_total")}>{money(r.period.amount)}</Row>
          <Row label={tt("grat_period_diff")}>{money(r.period.difference)}</Row>
        </dl>
      </div>

      {rec && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-foreground">{tt("grat_recon_title")}</h4>
          <p className="text-xs text-foreground">
            {rec.status === "match"
              ? tt("grat_recon_match")
              : rec.status === "employer_lower"
                ? tt("grat_recon_lower", { amount: money(Math.abs(rec.difference)) })
                : tt("grat_recon_higher", { amount: money(Math.abs(rec.difference)) })}
          </p>
        </div>
      )}

      {r.overpaidBy > 0 && <p className="text-xs text-foreground">{tt("grat_overpaid_by", { amount: money(r.overpaidBy) })}</p>}
      <ul className="space-y-1">
        {r.warnings
          .filter((w) => w !== "grat_w_cap_reached" && w !== "grat_w_overpaid")
          .map((w) => (
            <li key={w} className="flex items-start gap-2 text-xs text-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>{tt(w)}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
