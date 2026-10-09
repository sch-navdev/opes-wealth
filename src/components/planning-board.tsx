"use client";

import { moneyFormatter } from "@/lib/money-parts";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, HelpCircle, Pencil, Plus, XCircle } from "lucide-react";
import { AddAssetDialog, type AssetForEdit } from "@/components/add-asset-dialog";
import { DeleteAssetButton } from "@/components/delete-asset-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { cn } from "@/lib/utils";
import { useStored } from "@/lib/use-stored";
import {
  DEFAULT_MAX_DEBT_RATIO,
  evaluateProjects,
  overallVerdict,
  type CheckStatus,
  type PlanInputs,
  type ProjectInput,
  type ProjectResult,
} from "@/lib/planning";
import { savePlan } from "@/app/dashboard/planning-actions";

export type PlanningProject = { edit: AssetForEdit; categoryName: string; input: ProjectInput };

type Draft = { day_d: string; ltv: string; rate: string; term: string; own: string };
const toDraft = (p: PlanInputs): Draft => ({
  day_d: p.day_d,
  ltv: String(p.ltv_pct),
  rate: String(p.rate_pct),
  term: String(p.term_years),
  own: p.own_cash == null ? "" : String(p.own_cash),
});
const toPlan = (d: Draft): PlanInputs => ({
  day_d: d.day_d,
  ltv_pct: Number(d.ltv) || 0,
  rate_pct: Number(d.rate) || 0,
  term_years: Number(d.term) || 1,
  own_cash: d.own.trim() === "" || !Number.isFinite(Number(d.own)) ? null : Number(d.own),
});

export function PlanningBoard({
  baseCurrency,
  categories,
  liquidCash,
  existingMonthlyDebt,
  projects,
  defaultMonthlyIncome,
}: {
  baseCurrency: string;
  categories: { id: string; name: string }[];
  liquidCash: number;
  existingMonthlyDebt: number;
  projects: PlanningProject[];
  /** Income assumed until the visitor types one (the demo account). */
  defaultMonthlyIncome?: number;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const router = useRouter();

  const [incomeText, setIncomeText] = useStored("ow_planning_income");
  const [ratioText, setRatioText] = useStored("ow_planning_ratio");
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(projects.map((p) => [p.input.id, toDraft(p.input.plan)])),
  );

  const money = (n: number) => {
    try {
      return maskValue(moneyFormatter(intlLocale, baseCurrency, { maximumFractionDigits: 0 }).format(n));
    } catch {
      return maskValue(n.toLocaleString(intlLocale, { maximumFractionDigits: 0 }));
    }
  };

  const income = Number(incomeText) > 0 ? Number(incomeText) : (defaultMonthlyIncome ?? null);
  const maxRatio = Number(ratioText) > 0 ? Number(ratioText) : DEFAULT_MAX_DEBT_RATIO;

  const results = useMemo(
    () =>
      evaluateProjects(
        projects.map((p) => ({ ...p.input, plan: toPlan(drafts[p.input.id] ?? toDraft(p.input.plan)) })),
        { liquidCash, existingMonthlyDebt, monthlyIncome: income, maxDebtRatioPct: maxRatio },
      ),
    [projects, drafts, liquidCash, existingMonthlyDebt, income, maxRatio],
  );
  const byId = new Map(results.map((r) => [r.id, r]));
  const verdict = overallVerdict(results);

  const reasons: string[] = [];
  for (const r of results) {
    if (r.checks.ltv === "fail") reasons.push(t("planning_reason_ltv", { name: r.name, extra: money(r.minCashNeeded - r.cashNeeded) }));
    if (r.checks.liquidity === "fail") reasons.push(t("planning_reason_liquidity", { name: r.name, needed: money(r.cashNeeded), available: money(Math.max(0, r.cashAvailable)) }));
    if (r.checks.debtRatio === "fail") reasons.push(t("planning_reason_debt", { name: r.name, ratio: Math.round(r.debtRatioPct ?? 0), max: maxRatio }));
  }

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("planning_title")}</h1>
          <p className="text-sm text-muted-foreground">{t("planning_subtitle")}</p>
        </div>
        <AddAssetDialog
          categories={categories}
          simulation
          trigger={
            <Button type="button">
              <Plus className="size-4" />
              {t("planning_add")}
            </Button>
          }
        />
      </div>

      {verdict === "not_bankable" && (
        <div role="alert" className="space-y-2 border border-destructive/60 bg-destructive/10 p-4">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="size-5" aria-hidden="true" />
            {t("planning_alert_title")}
          </p>
          <ul className="list-disc space-y-1 ps-6 text-sm text-foreground">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {verdict === "incomplete" && (
        <div role="status" className="flex items-center gap-2 border border-primary/50 bg-primary/10 p-4 text-sm text-foreground">
          <HelpCircle className="size-5 shrink-0 text-primary" aria-hidden="true" />
          {t("planning_incomplete")}
        </div>
      )}
      {verdict === "bankable" && (
        <div role="status" className="flex items-center gap-2 border border-success/50 bg-success/10 p-4 text-sm text-foreground">
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
          {t("planning_bankable_note")}
        </div>
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">{t("planning_context_title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{t("planning_liquid_cash")}</p>
            <p className="text-lg font-semibold text-foreground">{money(liquidCash)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("planning_existing_debt")}</p>
            <p className="text-lg font-semibold text-foreground">{money(existingMonthlyDebt)}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan_income">{t("planning_income")} ({baseCurrency})</Label>
            <Input id="plan_income" type="number" min="0" step="any" placeholder={defaultMonthlyIncome ? String(defaultMonthlyIncome) : undefined} value={incomeText} onChange={(e) => setIncomeText(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan_ratio">{t("planning_max_ratio")}</Label>
            <Input id="plan_ratio" type="number" min="1" max="100" step="any" placeholder={String(DEFAULT_MAX_DEBT_RATIO)} value={ratioText} onChange={(e) => setRatioText(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {projects.length === 0 && <p className="text-sm text-muted-foreground">{t("planning_empty")}</p>}

      {results.map((r) => {
        const project = projects.find((p) => p.input.id === r.id)!;
        return (
          <ProjectCard
            key={r.id}
            project={project}
            result={byId.get(r.id)!}
            draft={drafts[r.id] ?? toDraft(project.input.plan)}
            onDraft={(d) => setDrafts((prev) => ({ ...prev, [r.id]: d }))}
            categories={categories}
            money={money}
            maxRatio={maxRatio}
            onChanged={() => router.refresh()}
          />
        );
      })}

      <p className="text-xs text-muted-foreground">{t("planning_disclaimer")}</p>
    </div>
  );
}

function CheckLine({ label, status }: { label: string; status: CheckStatus }) {
  const { t } = useLanguage();
  const Icon = status === "pass" ? CheckCircle2 : status === "fail" ? XCircle : HelpCircle;
  return (
    <li className="flex items-center gap-2 text-sm">
      <Icon className={cn("size-4 shrink-0", status === "pass" && "text-success", status === "fail" && "text-destructive", status === "unknown" && "text-muted-foreground")} aria-hidden="true" />
      <span className="text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{t(status === "pass" ? "planning_pass" : status === "fail" ? "planning_fail" : "planning_unknown")}</span>
    </li>
  );
}

function ProjectCard({
  project,
  result,
  draft,
  onDraft,
  categories,
  money,
  maxRatio,
  onChanged,
}: {
  project: PlanningProject;
  result: ProjectResult;
  draft: Draft;
  onDraft: (d: Draft) => void;
  categories: { id: string; name: string }[];
  money: (n: number) => string;
  maxRatio: number;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<Draft>) => onDraft({ ...draft, ...patch });
  const id = project.input.id;

  function save() {
    setMessage(null);
    startTransition(async () => {
      const res = await savePlan(id, toPlan(draft));
      setMessage(res.ok ? { ok: true, text: t("planning_saved") } : { ok: false, text: res.error });
      if (res.ok) onChanged();
    });
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <CardTitle className="truncate text-foreground">{project.edit.name}</CardTitle>
          <Badge variant="secondary">{project.categoryName}</Badge>
          <Badge variant="outline">{t("planning_simulation_badge")}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <AddAssetDialog
            categories={categories}
            asset={project.edit}
            simulation
            trigger={
              <Button type="button" variant="outline" size="icon-sm" aria-label={t("planning_edit_project")}>
                <Pencil className="size-4" />
              </Button>
            }
          />
          <DeleteAssetButton id={id} onSuccess={onChanged} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-d`}>{t("planning_day_d")}</Label>
            <Input id={`${id}-d`} type="date" value={draft.day_d} onChange={(e) => set({ day_d: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-ltv`}>{t("planning_ltv")}</Label>
            <Input id={`${id}-ltv`} type="number" min="0" max="100" step="any" value={draft.ltv} onChange={(e) => set({ ltv: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-rate`}>{t("planning_rate")}</Label>
            <Input id={`${id}-rate`} type="number" min="0" step="any" value={draft.rate} onChange={(e) => set({ rate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-term`}>{t("planning_term")}</Label>
            <Input id={`${id}-term`} type="number" min="1" max="50" step="1" value={draft.term} onChange={(e) => set({ term: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-own`}>{t("planning_own_cash")}</Label>
            <Input id={`${id}-own`} type="number" min="0" step="any" placeholder={String(Math.round(result.minCashNeeded))} value={draft.own} onChange={(e) => set({ own: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Figure label={t("planning_total_cost")} value={money(result.totalCost)} hint={result.fees > 0 ? t("planning_incl_fees", { fees: money(result.fees) }) : undefined} />
          <Figure label={t("planning_cash_needed")} value={money(result.cashNeeded)} strong />
          <Figure label={t("planning_borrowing")} value={money(result.borrowing)} hint={t("planning_ltv_actual", { pct: Math.round(result.ltvActualPct) })} strong />
          <Figure label={t("planning_monthly_payment")} value={money(result.monthlyPayment)} hint={result.debtRatioPct != null ? t("planning_debt_ratio_hint", { ratio: Math.round(result.debtRatioPct) }) : undefined} />
        </div>

        <ul className="space-y-1.5 border-t border-border pt-4">
          <CheckLine label={t("planning_check_ltv", { pct: draft.ltv || 0 })} status={result.checks.ltv} />
          <CheckLine label={t("planning_check_liquidity", { available: money(Math.max(0, result.cashAvailable)) })} status={result.checks.liquidity} />
          <CheckLine label={t("planning_check_debt", { max: maxRatio })} status={result.checks.debtRatio} />
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={pending} onClick={save}>
            {t("planning_save")}
          </Button>
          {message && (
            <p className={cn("text-xs", message.ok ? "text-success" : "text-destructive")} role="status">
              {message.text}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold text-foreground", strong && "text-primary")}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
