"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCategoryName, useRetirementText } from "@/components/retirement-text";
import { useTierMotion } from "@/components/tier-gate";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { tileEntranceStyle } from "@/lib/dashboard-tiers";
import {
  computeRetirement,
  DEFAULT_INFLATION,
  DEFAULT_WITHDRAWAL_RATE,
  parseNumberInput,
  projectionBreakdown,
  sensitivity,
  type RetirementInput,
  type WithdrawalMethod,
} from "@/lib/retirement";
import { investableTotal, isIncludedByDefault, type CategoryAmount } from "@/lib/retirement-assets";
import type { RetirementPreset } from "@/lib/retirement-demo";
import type { RetKey } from "@/lib/retirement-labels";
import { useStored } from "@/lib/use-stored";
import { cn } from "@/lib/utils";

export const RETIREMENT_STORAGE_KEY = "ow_retirement_inputs";

/** Everything the visitor typed, kept as text so a half-typed number is never rewritten. */
type Stored = {
  age: string;
  retAge: string;
  income: string;
  ret: string;
  inflation: string;
  method: WithdrawalMethod;
  swr: string;
  /** Own starting-assets figure; "" = use the portfolio total. */
  assets: string;
  /** Optional current monthly saving. */
  saving: string;
  /** Categories counted as investable; null = the defaults. */
  cats: string[] | null;
};

export const RETIREMENT_DEFAULTS: Stored = {
  age: "40",
  retAge: "65",
  income: "3000",
  ret: "5",
  inflation: String(DEFAULT_INFLATION * 100),
  method: "swr",
  swr: String(DEFAULT_WITHDRAWAL_RATE * 100),
  assets: "",
  saving: "",
  cats: null,
};

const TEXT_KEYS = ["age", "retAge", "income", "ret", "inflation", "swr", "assets", "saving"] as const;

function readStored(raw: string, preset?: Partial<RetirementPreset>): Stored {
  const out: Stored = { ...RETIREMENT_DEFAULTS, ...preset };
  if (!raw) return out;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const key of TEXT_KEYS) if (typeof data[key] === "string") out[key] = data[key] as string;
    if (data.method === "swr" || data.method === "returns") out.method = data.method;
    if (Array.isArray(data.cats) && data.cats.every((c) => typeof c === "string")) out.cats = data.cats as string[];
  } catch {
    // corrupt value: fall back to the defaults
  }
  return out;
}

type FieldError = { field: string; key: RetKey };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const fmt = (n: number, digits = 2) => String(Math.round(n * 10 ** digits) / 10 ** digits);

type RangeFieldProps = {
  id: string;
  label: string;
  text: string;
  onText: (next: string) => void;
  min: number;
  max: number;
  step: number;
  valueText: (n: number) => string;
  invalid?: boolean;
  suffix?: string;
};

/** A slider with a numeric field: both edit the same value, either can be used. */
function RangeField({ id, label, text, onText, min, max, step, valueText, invalid, suffix }: RangeFieldProps) {
  const parsed = parseNumberInput(text);
  const sliderValue = Number.isFinite(parsed) ? clamp(parsed, min, max) : min;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="min-w-0">
          {label}
        </Label>
        <div className="flex shrink-0 items-center gap-1.5">
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            min={min}
            step={step}
            value={text}
            aria-invalid={invalid || undefined}
            onChange={(e) => onText(e.target.value)}
            className="h-8 w-24 text-end"
          />
          {suffix && (
            <span aria-hidden="true" className="text-xs text-muted-foreground">
              {suffix}
            </span>
          )}
        </div>
      </div>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={valueText(sliderValue)}
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        onChange={(e) => onText(e.target.value)}
        className="h-5 w-full cursor-pointer accent-primary"
      />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  testId,
  className,
  style,
}: {
  label: string;
  value: string;
  hint?: string;
  testId: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Card
      data-testid={`${testId}-card`}
      className={cn("animate-in fade-in slide-in-from-bottom-2 gap-1 border-border bg-card py-4 motion-reduce:animate-none", className)}
      style={style}
    >
      <CardContent className="space-y-1 px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p data-testid={testId} className="text-lg font-semibold text-foreground">
          {value}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const SEGMENT_COLORS = {
  assets: "var(--color-chart-1)",
  assetGrowth: "var(--color-chart-2)",
  contributions: "var(--color-chart-3)",
  contributionGrowth: "var(--color-chart-4)",
} as const;

/**
 * Retirement passive-income simulator: how much to save each month to reach a target net passive income,
 * given the investable assets already held. Illustration only (see `lib/retirement.ts`).
 */
export function RetirementSimulator({
  baseCurrency,
  breakdown,
  preset,
}: {
  baseCurrency: string;
  /** Starting inputs that replace the built-in defaults (used by the demo account); the visitor's saved edits still win. */
  preset?: Partial<RetirementPreset>;
  /** Portfolio value per category, in `baseCurrency` (see `lib/retirement-assets.ts`). */
  breakdown: CategoryAmount[];
}) {
  const r = useRetirementText();
  const categoryName = useCategoryName();
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const motion = useTierMotion();
  const [raw, setRaw] = useStored(RETIREMENT_STORAGE_KEY);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  const state = useMemo(() => readStored(raw, preset), [raw, preset]);
  const set = (patch: Partial<Stored>) => setRaw(JSON.stringify({ ...state, ...patch }));

  const money = (n: number) => {
    try {
      return maskValue(
        new Intl.NumberFormat(intlLocale, { style: "currency", currency: baseCurrency, maximumFractionDigits: 0 }).format(n),
      );
    } catch {
      return maskValue(n.toLocaleString(intlLocale, { maximumFractionDigits: 0 }));
    }
  };

  const included = state.cats ?? breakdown.filter((row) => isIncludedByDefault(row.category)).map((row) => row.category);
  const portfolioTotal = investableTotal(breakdown, included);
  const overrideText = state.assets.trim();
  const startingAssets = overrideText === "" ? portfolioTotal : parseNumberInput(overrideText);

  const age = parseNumberInput(state.age);
  const retAge = parseNumberInput(state.retAge);
  const income = parseNumberInput(state.income);
  const ret = parseNumberInput(state.ret);
  const inflation = parseNumberInput(state.inflation);
  const swr = parseNumberInput(state.swr);
  const saving = parseNumberInput(state.saving);
  const hasSaving = state.saving.trim() !== "";

  const errors: FieldError[] = [];
  if (!(Number.isFinite(age) && age >= 0 && age <= 100)) errors.push({ field: "age", key: "ret_err_current_age" });
  if (!(Number.isFinite(retAge) && retAge <= 100)) errors.push({ field: "retAge", key: "ret_err_retirement_age" });
  else if (Number.isFinite(age) && retAge <= age) errors.push({ field: "retAge", key: "ret_err_ages" });
  if (!(Number.isFinite(income) && income > 0)) errors.push({ field: "income", key: "ret_err_income" });
  if (!(Number.isFinite(ret) && ret >= 0 && ret <= 20)) errors.push({ field: "ret", key: "ret_err_return" });
  else if (state.method === "returns" && ret === 0) errors.push({ field: "ret", key: "ret_err_returns_zero" });
  if (!(Number.isFinite(inflation) && inflation >= 0 && inflation <= 20)) errors.push({ field: "inflation", key: "ret_err_inflation" });
  if (state.method === "swr" && !(Number.isFinite(swr) && swr > 0 && swr <= 20)) errors.push({ field: "swr", key: "ret_err_swr" });
  if (overrideText !== "" && !(Number.isFinite(startingAssets) && startingAssets >= 0)) errors.push({ field: "assets", key: "ret_err_assets" });
  if (hasSaving && !(Number.isFinite(saving) && saving >= 0)) errors.push({ field: "saving", key: "ret_err_saving" });
  const invalid = (field: string) => errors.some((e) => e.field === field);

  const input: RetirementInput | null = errors.length
    ? null
    : {
        currentAge: age,
        retirementAge: retAge,
        desiredMonthlyIncome: income,
        annualReturn: ret / 100,
        inflation: inflation / 100,
        method: state.method,
        withdrawalRate: swr / 100,
        startingAssets,
      };
  const result = input ? computeRetirement(input) : null;
  const sens = input && result?.ok ? sensitivity(input) : [];

  const toggleCategory = (category: string, on: boolean) => {
    const next = on ? [...included, category] : included.filter((c) => c !== category);
    set({ cats: next });
  };

  const tile = (index: number) => tileEntranceStyle(motion, index);
  const cardMotion = "animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none";

  return (
    <section aria-labelledby="ret-title" data-testid="retirement-simulator" className="space-y-4">
      <div>
        <h2 id="ret-title" className="text-xl font-semibold tracking-tight text-foreground">
          {r("ret_title")}
        </h2>
        <p className="text-sm text-muted-foreground">{r("ret_subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Inputs */}
        <Card className={cn("border-border bg-card lg:col-span-5", cardMotion)} style={tile(0)}>
          <CardHeader>
            <CardTitle className="text-foreground">{r("ret_inputs_title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <RangeField
              id="ret-age"
              label={r("ret_current_age")}
              text={state.age}
              onText={(v) => set({ age: v })}
              min={18}
              max={80}
              step={1}
              valueText={(n) => r("ret_value_age", { value: n })}
              invalid={invalid("age")}
            />
            <RangeField
              id="ret-retage"
              label={r("ret_retirement_age")}
              text={state.retAge}
              onText={(v) => set({ retAge: v })}
              min={30}
              max={85}
              step={1}
              valueText={(n) => r("ret_value_age", { value: n })}
              invalid={invalid("retAge")}
            />
            <RangeField
              id="ret-income"
              label={`${r("ret_income")} ⁦(${baseCurrency})⁩`}
              text={state.income}
              onText={(v) => set({ income: v })}
              min={0}
              max={20000}
              step={100}
              valueText={(n) => r("ret_value_money", { value: money(n) })}
              invalid={invalid("income")}
            />
            <RangeField
              id="ret-return"
              label={r("ret_return")}
              text={state.ret}
              onText={(v) => set({ ret: v })}
              min={0}
              max={12}
              step={0.1}
              valueText={(n) => r("ret_value_pct", { value: n })}
              invalid={invalid("ret")}
              suffix="%"
            />

            <div className="space-y-1.5">
              <Label htmlFor="ret-saving">
                {r("ret_current_saving")} ({baseCurrency})
              </Label>
              <Input
                id="ret-saving"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={state.saving}
                aria-invalid={invalid("saving") || undefined}
                onChange={(e) => set({ saving: e.target.value })}
              />
            </div>

            <Collapsible open={assumptionsOpen} onOpenChange={setAssumptionsOpen} className="border-t border-border pt-4">
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" className="h-auto w-full justify-between px-0 py-1 text-start hover:bg-transparent">
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{r("ret_assumptions")}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{r("ret_assumptions_hint")}</span>
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 transition-transform", assumptionsOpen && "rotate-180")} aria-hidden="true" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent data-testid="ret-assumptions" className="space-y-5 pt-4">
                <RangeField
                  id="ret-inflation"
                  label={r("ret_inflation")}
                  text={state.inflation}
                  onText={(v) => set({ inflation: v })}
                  min={0}
                  max={10}
                  step={0.1}
                  valueText={(n) => r("ret_value_pct", { value: n })}
                  invalid={invalid("inflation")}
                  suffix="%"
                />

                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-medium text-foreground">{r("ret_method")}</legend>
                  {(["swr", "returns"] as const).map((method) => (
                    <label key={method} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                      <input
                        type="radio"
                        name="ret-method"
                        value={method}
                        checked={state.method === method}
                        onChange={() => set({ method })}
                        className="size-4 accent-primary"
                      />
                      {r(method === "swr" ? "ret_method_swr" : "ret_method_returns")}
                    </label>
                  ))}
                </fieldset>

                {state.method === "swr" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="ret-swr">{r("ret_swr")} (%)</Label>
                    <Input
                      id="ret-swr"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={state.swr}
                      aria-invalid={invalid("swr") || undefined}
                      onChange={(e) => set({ swr: e.target.value })}
                    />
                  </div>
                )}

                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">{r("ret_categories")}</p>
                  <p className="text-xs text-muted-foreground">{r("ret_assets_hint")}</p>
                  <ul className="space-y-2">
                    {breakdown.map((row) => {
                      const id = `ret-cat-${row.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                      return (
                        <li key={row.category} className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <Checkbox
                              id={id}
                              checked={included.includes(row.category)}
                              onCheckedChange={(checked) => toggleCategory(row.category, checked === true)}
                            />
                            <Label htmlFor={id} className="min-w-0 truncate font-normal">
                              {categoryName(row.category)}
                            </Label>
                          </div>
                          <span className="shrink-0 text-sm text-muted-foreground">{money(row.amount)}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <p data-testid="ret-assets-auto" className="text-sm text-foreground">
                    {r("ret_assets_auto", { amount: money(portfolioTotal) })}
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="ret-assets">
                      {r("ret_assets_override")} ({baseCurrency})
                    </Label>
                    <Input
                      id="ret-assets"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={state.assets}
                      placeholder={overrideText === "" ? String(Math.round(portfolioTotal)) : undefined}
                      aria-invalid={invalid("assets") || undefined}
                      onChange={(e) => set({ assets: e.target.value })}
                    />
                  </div>
                  {Number.isFinite(startingAssets) && (
                    <p data-testid="ret-assets-used" className="text-sm font-medium text-foreground">
                      {r("ret_assets_used", { amount: money(startingAssets) })}
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {errors.length > 0 && (
              <div role="alert" data-testid="ret-errors" className="space-y-1 border border-destructive/60 bg-destructive/10 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-destructive">
                  <TriangleAlert className="size-4" aria-hidden="true" />
                  {r("ret_err_title")}
                </p>
                <ul className="list-disc ps-6 text-foreground">
                  {errors.map((e) => (
                    <li key={`${e.field}-${e.key}`}>{r(e.key)}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        <div className="space-y-4 lg:col-span-7" data-testid="ret-result">
          {result?.ok && input ? (
            <>
              <p role="status" aria-live="polite" data-testid="ret-live" className="sr-only">
                {result.onTrack
                  ? r("ret_live_on_track")
                  : r("ret_live", { amount: money(result.requiredMonthly), years: fmt(result.years, 1) })}
              </p>

              <Card className={cn("border-primary/40 bg-card", cardMotion)} style={tile(1)} data-testid="ret-hero">
                <CardContent className="space-y-1 px-6">
                  <p className="text-sm text-muted-foreground">{r("ret_hero_label")}</p>
                  <p data-testid="ret-required" className="text-4xl font-semibold tracking-tight text-primary">
                    {money(result.requiredMonthly)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r("ret_hero_detail", { years: fmt(result.years, 1), months: result.months })}
                  </p>
                  {result.onTrack && (
                    <div data-testid="ret-on-track" className="mt-3 flex items-start gap-2 border border-success/50 bg-success/10 p-3 text-sm text-foreground">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                      <div>
                        <p className="font-medium">{r("ret_on_track_title")}</p>
                        <p>
                          {r("ret_on_track_text", {
                            assets: money(result.assetsGrown),
                            surplus: money(result.surplus),
                            target: money(result.targetCapital),
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Stat
                  testId="ret-target"
                  label={r("ret_target")}
                  value={money(result.targetCapital)}
                  hint={
                    state.method === "swr"
                      ? r("ret_target_hint_swr", { rate: fmt(input.withdrawalRate * 100) })
                      : r("ret_target_hint_returns", { rate: fmt(input.annualReturn * 100) })
                  }
                  style={tile(2)}
                />
                <Stat
                  testId="ret-assets-grown"
                  label={r("ret_assets_grown")}
                  value={money(result.assetsGrown)}
                  hint={r("ret_assets_grown_hint", { assets: money(input.startingAssets), rate: fmt(input.annualReturn * 100) })}
                  style={tile(3)}
                />
                <Stat testId="ret-gap" label={r("ret_gap")} value={money(result.gap)} hint={r("ret_gap_hint")} style={tile(4)} />
                <Stat
                  testId="ret-time"
                  label={r("ret_time")}
                  value={r("ret_time_value", { years: fmt(result.years, 1), months: result.months })}
                  style={tile(5)}
                />
                <Stat
                  testId="ret-income-nominal"
                  label={r("ret_income_nominal")}
                  value={money(result.incomeAtRetirement)}
                  hint={r("ret_income_nominal_hint", { today: money(input.desiredMonthlyIncome), rate: fmt(input.inflation * 100) })}
                  className="sm:col-span-2"
                  style={tile(6)}
                />
                {hasSaving && (
                  <Stat
                    testId="ret-effort"
                    label={r("ret_effort_title")}
                    value={(() => {
                      const delta = result.requiredMonthly - saving;
                      if (Math.abs(delta) < 0.5) return r("ret_effort_equal", { current: money(saving) });
                      return delta > 0
                        ? r("ret_effort_more", { delta: money(delta), current: money(saving) })
                        : r("ret_effort_less", { delta: money(-delta), current: money(saving) });
                    })()}
                    className="sm:col-span-2"
                    style={tile(7)}
                  />
                )}
              </div>
            </>
          ) : (
            <Card className="border-border bg-card py-6">
              <CardContent className="px-6 text-sm text-muted-foreground" data-testid="ret-result-empty">
                {r("ret_err_title")}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {result?.ok && input && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className={cn("border-border bg-card", cardMotion)} style={tile(8)} data-testid="ret-sens-card">
            <CardHeader>
              <CardTitle className="text-foreground">{r("ret_sens_title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table data-testid="ret-sens">
                <caption className="sr-only">{r("ret_sens_caption")}</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>{r("ret_sens_col_assumption")}</TableHead>
                    <TableHead className="text-end">{r("ret_sens_col_saving")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sens.map((row) => {
                    const rate = fmt(row.value * 100);
                    const label = r(row.kind === "return" ? "ret_sens_return" : "ret_sens_inflation", { rate });
                    return (
                      <TableRow key={`${row.kind}-${row.value}`} data-testid={`ret-sens-${row.kind}-${rate}`}>
                        <TableCell className={cn(row.base && "font-medium text-foreground")}>
                          {label}
                          {row.base && <span className="text-muted-foreground"> ({r("ret_sens_current")})</span>}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {row.requiredMonthly == null ? r("ret_sens_na") : money(row.requiredMonthly)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-muted-foreground">{r("ret_sens_caption")}</p>
            </CardContent>
          </Card>

          <ChartCard
            result={result}
            startingAssets={input.startingAssets}
            money={money}
            r={r}
            className={cardMotion}
            style={tile(9)}
          />
        </div>
      )}

      {result?.ok && input && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className={cn("border-border bg-card", cardMotion)} style={tile(10)}>
            <CardHeader>
              <CardTitle className="text-foreground">{r("ret_summary_title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p data-testid="ret-summary" className="text-sm text-muted-foreground">
                {r(state.method === "swr" ? "ret_summary_swr" : "ret_summary_returns", {
                  today: money(input.desiredMonthlyIncome),
                  inflation: fmt(input.inflation * 100),
                  nominal: money(result.incomeAtRetirement),
                  rate: fmt((state.method === "swr" ? input.withdrawalRate : input.annualReturn) * 100),
                  ret: fmt(input.annualReturn * 100),
                })}
              </p>
            </CardContent>
          </Card>
          <Disclaimer r={r} className={cardMotion} style={tile(11)} />
        </div>
      )}
      {!(result?.ok && input) && <Disclaimer r={r} />}
    </section>
  );
}

function Disclaimer({
  r,
  className,
  style,
}: {
  r: (key: RetKey, vars?: Record<string, string | number>) => string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Card className={cn("border-border bg-card", className)} style={style} data-testid="ret-disclaimer">
      <CardHeader>
        <CardTitle className="text-foreground">{r("ret_disc_title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 ps-5 text-xs text-muted-foreground">
          {(["ret_disc_1", "ret_disc_2", "ret_disc_3", "ret_disc_4", "ret_disc_5", "ret_disc_6"] as const).map((key) => (
            <li key={key}>{r(key)}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ChartCard({
  result,
  startingAssets,
  money,
  r,
  className,
  style,
}: {
  result: Extract<ReturnType<typeof computeRetirement>, { ok: true }>;
  startingAssets: number;
  money: (n: number) => string;
  r: (key: RetKey, vars?: Record<string, string | number>) => string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const parts = projectionBreakdown(startingAssets, result);
  const total = parts.reduce((sum, p) => sum + p.amount, 0);
  const fromAssets = parts[0].amount + parts[1].amount;
  const summary = r("ret_chart_summary", {
    total: money(total),
    fromAssets: money(fromAssets),
    fromSavings: money(total - fromAssets),
  });
  const segmentKey = {
    assets: "ret_seg_assets",
    assetGrowth: "ret_seg_assetGrowth",
    contributions: "ret_seg_contributions",
    contributionGrowth: "ret_seg_contributionGrowth",
  } as const;
  return (
    <Card className={cn("border-border bg-card", className)} style={style} data-testid="ret-chart-card">
      <CardHeader>
        <CardTitle className="text-foreground">{r("ret_chart_title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div role="img" aria-label={summary} data-testid="ret-chart" className="flex h-8 w-full overflow-hidden border border-border">
          {parts.map((p) =>
            p.amount > 0 && total > 0 ? (
              <div
                key={p.id}
                data-testid={`ret-seg-${p.id}`}
                style={{ width: `${(p.amount / total) * 100}%`, backgroundColor: SEGMENT_COLORS[p.id] }}
              />
            ) : null,
          )}
        </div>
        <ul className="space-y-1 text-xs">
          {parts.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <span aria-hidden="true" className="size-2.5 shrink-0" style={{ backgroundColor: SEGMENT_COLORS[p.id] }} />
                <span className="truncate">{r(segmentKey[p.id])}</span>
              </span>
              <span className="shrink-0 tabular-nums text-foreground">{money(p.amount)}</span>
            </li>
          ))}
        </ul>
        <p data-testid="ret-chart-summary" className="text-xs text-muted-foreground">
          {summary}
        </p>
      </CardContent>
    </Card>
  );
}
