"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/context/language-context";
import {
  PRIVATE_EQUITY_STAGES,
  calledCapital,
  fundReturns,
  generateCapitalCalls,
  generateProjectedDistributions,
  unfundedCommitment,
  type CapitalCall,
  type DistributionShape,
  type PrivateEquityLifecycleStage,
  type PrivateEquityMetadata,
  type PrivateEquityProjectionMode,
  type ProjectedDistribution,
} from "@/lib/private-equity";
import type { TranslationKey } from "@/lib/i18n";

const todayIso = new Date().toISOString().slice(0, 10);

export const STAGE_LABEL_KEYS: Record<PrivateEquityLifecycleStage, TranslationKey> = {
  commitment: "pe_stage_commitment",
  investment_period: "pe_stage_investment_period",
  harvest: "pe_stage_harvest",
  liquidated: "pe_stage_liquidated",
};

function numberOrNull(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function PrivateEquityFields({
  value,
  onChange,
  currency,
}: {
  value: PrivateEquityMetadata;
  onChange: (next: PrivateEquityMetadata) => void;
  currency: string;
}) {
  const { t } = useLanguage();
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });

  // Schedule generator inputs (not persisted — only the resulting calls are).
  const [percentPerCall, setPercentPerCall] = useState("10");
  const [firstDate, setFirstDate] = useState("");
  const [intervalMonths, setIntervalMonths] = useState("6");
  // Distribution model (Altaroc-style defaults: ~1.8x over years 4–10).
  const [multipleInput, setMultipleInput] = useState("1.8");
  const [distStartYear, setDistStartYear] = useState("4");
  const [distEndYear, setDistEndYear] = useState("10");
  const [shape, setShape] = useState<DistributionShape>("back_loaded");
  const manual = value.projection_mode === "manual";

  function set<K extends keyof PrivateEquityMetadata>(
    key: K,
    next: PrivateEquityMetadata[K],
  ) {
    onChange({ ...value, [key]: next });
  }

  function setCall(index: number, patch: Partial<CapitalCall>) {
    const calls = value.capital_calls.map((c, i) => {
      if (i !== index) return c;
      const next = { ...c, ...patch };
      if (patch.amount != null && value.commitment_amount) {
        next.percentage = Math.round((next.amount / value.commitment_amount) * 10000) / 100;
      }
      return next;
    });
    set("capital_calls", calls);
  }

  function setDistribution(index: number, patch: Partial<ProjectedDistribution>) {
    set(
      "projected_distributions",
      value.projected_distributions.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
  }

  function addCall() {
    const call: CapitalCall = {
      id: `call-manual-${Date.now()}`,
      due_date: todayIso,
      amount: 0,
      percentage: 0,
      status: "pending",
    };
    set("capital_calls", [...value.capital_calls, call]);
  }

  function addDistribution() {
    set("projected_distributions", [
      ...value.projected_distributions,
      { id: `dist-manual-${Date.now()}`, due_date: todayIso, amount: 0 },
    ]);
  }

  function applyPreset(percent: string, interval: string) {
    setPercentPerCall(percent);
    setIntervalMonths(interval);
  }

  function buildCalls() {
    return generateCapitalCalls({
      commitment: value.commitment_amount ?? 0,
      percentPerCall: Number(percentPerCall),
      firstDate,
      intervalMonths: Number(intervalMonths),
      today: todayIso,
    });
  }

  function generateCallsOnly() {
    set("capital_calls", buildCalls());
  }

  /** Calls AND the projected distributions (and the multiple that drove them) in one go. */
  function generate() {
    const multiple = Number(multipleInput);
    onChange({
      ...value,
      capital_calls: buildCalls(),
      expected_multiple: multiple > 0 ? multiple : null,
      projected_distributions: generateProjectedDistributions({
        commitment: value.commitment_amount ?? 0,
        multiple,
        firstCallDate: firstDate,
        startYear: Number(distStartYear),
        endYear: Number(distEndYear),
        shape,
      }),
    });
  }

  const returns = fundReturns(value);
  const called = calledCapital(value);
  const unfunded = unfundedCommitment(value);
  const canGenerate =
    (value.commitment_amount ?? 0) > 0 && Number(percentPerCall) > 0 && firstDate !== "";

  return (
    <div className="w-full min-w-0 space-y-4 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-foreground">
        {t("private_equity_details")}
      </h3>

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2 sm:col-span-2">
          <Label htmlFor="pe_entity_name">{t("entity_name")}</Label>
          <Input
            id="pe_entity_name"
            placeholder={t("entity_name_placeholder")}
            value={value.entity_name}
            onChange={(e) => set("entity_name", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="pe_manager">{t("pe_manager")}</Label>
          <Input
            id="pe_manager"
            placeholder={t("pe_manager_placeholder")}
            value={value.manager}
            onChange={(e) => set("manager", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="pe_strategy">{t("pe_strategy")}</Label>
          <Input
            id="pe_strategy"
            value={value.strategy}
            onChange={(e) => set("strategy", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="pe_share_class">{t("share_class")}</Label>
          <Input
            id="pe_share_class"
            placeholder={t("share_class_placeholder")}
            value={value.share_class}
            onChange={(e) => set("share_class", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="pe_ownership_percentage">
            {t("ownership_percentage")}
          </Label>
          <div className="relative w-full min-w-0">
            <Input
              id="pe_ownership_percentage"
              type="number"
              step="any"
              min="0"
              max="100"
              className="pr-8"
              value={value.ownership_percentage ?? ""}
              onChange={(e) => set("ownership_percentage", numberOrNull(e.target.value))}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              %
            </span>
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="pe_vintage">{t("pe_vintage_year")}</Label>
          <Input
            id="pe_vintage"
            placeholder="2025"
            value={value.vintage_year}
            onChange={(e) => set("vintage_year", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="pe_stage">{t("pe_lifecycle_stage")}</Label>
          <Select
            value={value.lifecycle_stage}
            onValueChange={(next) => set("lifecycle_stage", next as PrivateEquityLifecycleStage)}
          >
            <SelectTrigger id="pe_stage" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIVATE_EQUITY_STAGES.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {t(STAGE_LABEL_KEYS[stage])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <h4 className="text-sm font-medium text-foreground">{t("pe_commitment_heading")}</h4>
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="pe_commitment">{t("pe_commitment_amount")}</Label>
            <Input
              id="pe_commitment"
              type="number"
              step="any"
              min="0"
              value={value.commitment_amount ?? ""}
              onChange={(e) => set("commitment_amount", numberOrNull(e.target.value))}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="pe_distributions">{t("pe_distributions")}</Label>
            <Input
              id="pe_distributions"
              type="number"
              step="any"
              min="0"
              value={value.distributions_to_date ?? ""}
              onChange={(e) => set("distributions_to_date", numberOrNull(e.target.value))}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="pe_nav_date">{t("pe_nav_date")}</Label>
            <Input
              id="pe_nav_date"
              type="date"
              max={todayIso}
              value={value.nav_date}
              onChange={(e) => set("nav_date", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("pe_nav_hint")}</p>
          </div>
          {value.capital_calls.length === 0 && (
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pe_called_manual">{t("pe_called_manual")}</Label>
              <Input
                id="pe_called_manual"
                type="number"
                step="any"
                min="0"
                value={value.called_capital_manual ?? ""}
                onChange={(e) => set("called_capital_manual", numberOrNull(e.target.value))}
              />
            </div>
          )}
        </div>

        {(value.commitment_amount ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("pe_summary", {
              called: formatter.format(called),
              unfunded: formatter.format(unfunded),
            })}
          </p>
        )}
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <h4 className="text-sm font-medium text-foreground">{t("pe_calls_heading")}</h4>

        <Tabs
          value={value.projection_mode}
          onValueChange={(next) => set("projection_mode", next as PrivateEquityProjectionMode)}
        >
          <TabsList>
            <TabsTrigger value="model">{t("pe_mode_model")}</TabsTrigger>
            <TabsTrigger value="manual">{t("pe_mode_manual")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground">
          {manual ? t("pe_mode_manual_desc") : t("pe_calls_desc")}
        </p>

        {!manual && (
          <div className="space-y-3 border border-border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("pe_presets")}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("20", "12")}>
                {t("pe_preset_annual")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("10", "6")}>
                {t("pe_preset_semiannual")}
              </Button>
            </div>
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="pe_gen_percent">{t("pe_gen_percent")}</Label>
                <Input
                  id="pe_gen_percent"
                  type="number"
                  step="any"
                  min="0"
                  value={percentPerCall}
                  onChange={(e) => setPercentPerCall(e.target.value)}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="pe_gen_first">{t("pe_gen_first_date")}</Label>
                <Input
                  id="pe_gen_first"
                  type="date"
                  value={firstDate}
                  onChange={(e) => setFirstDate(e.target.value)}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="pe_gen_interval">{t("pe_gen_interval")}</Label>
                <Select value={intervalMonths} onValueChange={setIntervalMonths}>
                  <SelectTrigger id="pe_gen_interval" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">{t("pe_interval_quarterly")}</SelectItem>
                    <SelectItem value="6">{t("pe_interval_semiannual")}</SelectItem>
                    <SelectItem value="12">{t("pe_interval_annual")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="pe_gen_multiple">{t("pe_expected_multiple")}</Label>
                <Input
                  id="pe_gen_multiple"
                  type="number"
                  step="0.01"
                  min="0"
                  value={multipleInput}
                  onChange={(e) => setMultipleInput(e.target.value)}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="pe_gen_dist_start">{t("pe_dist_start_year")}</Label>
                <Input
                  id="pe_gen_dist_start"
                  type="number"
                  min="1"
                  value={distStartYear}
                  onChange={(e) => setDistStartYear(e.target.value)}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="pe_gen_dist_end">{t("pe_dist_end_year")}</Label>
                <Input
                  id="pe_gen_dist_end"
                  type="number"
                  min="1"
                  value={distEndYear}
                  onChange={(e) => setDistEndYear(e.target.value)}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="pe_gen_shape">{t("pe_dist_shape")}</Label>
                <Select value={shape} onValueChange={(next) => setShape(next as DistributionShape)}>
                  <SelectTrigger id="pe_gen_shape" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="even">{t("pe_shape_even")}</SelectItem>
                    <SelectItem value="back_loaded">{t("pe_shape_back_loaded")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={!canGenerate} onClick={generate}>
                {t("pe_generate_lifecycle")}
              </Button>
              <Button type="button" variant="ghost" disabled={!canGenerate} onClick={generateCallsOnly}>
                {t("pe_generate_calls")}
              </Button>
            </div>
          </div>
        )}

        {manual && (
          <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pe_manual_multiple">{t("pe_manual_multiple")}</Label>
              <Input
                id="pe_manual_multiple"
                type="number"
                step="0.01"
                min="0"
                value={value.expected_multiple ?? ""}
                onChange={(e) => set("expected_multiple", numberOrNull(e.target.value))}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pe_manual_irr">{t("pe_manual_irr")}</Label>
              <Input
                id="pe_manual_irr"
                type="number"
                step="0.1"
                value={value.expected_irr_manual ?? ""}
                onChange={(e) => set("expected_irr_manual", numberOrNull(e.target.value))}
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">{t("pe_manual_targets_hint")}</p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{t("pe_calls_table_heading")}</p>
            <Button type="button" variant="ghost" size="sm" onClick={addCall}>
              {t("pe_add_call")}
            </Button>
          </div>
          {value.capital_calls.length > 0 && (
            <>
              <ul className="space-y-2">
                {value.capital_calls.map((call, index) => (
                  <li
                    key={call.id}
                    className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2"
                  >
                    <Input
                      type="date"
                      aria-label={t("pe_call_date")}
                      value={call.due_date}
                      onChange={(e) => setCall(index, { due_date: e.target.value })}
                    />
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      aria-label={t("pe_call_amount")}
                      value={call.amount}
                      onChange={(e) => setCall(index, { amount: Number(e.target.value) })}
                    />
                    <Select
                      value={call.status}
                      onValueChange={(next) => setCall(index, { status: next as CapitalCall["status"] })}
                    >
                      <SelectTrigger className="w-28" aria-label={t("pe_call_status")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paid">{t("pe_call_paid")}</SelectItem>
                        <SelectItem value="pending">{t("pe_call_pending")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("delete")}
                      onClick={() =>
                        set(
                          "capital_calls",
                          value.capital_calls.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{t("pe_calls_paid_note")}</p>
            </>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{t("pe_dist_table_heading")}</p>
            <Button type="button" variant="ghost" size="sm" onClick={addDistribution}>
              {t("pe_add_distribution")}
            </Button>
          </div>
          {value.projected_distributions.length > 0 && (
            <ul className="space-y-2">
              {value.projected_distributions.map((dist, index) => (
                <li key={dist.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                  <Input
                    type="date"
                    aria-label={t("pe_call_date")}
                    value={dist.due_date}
                    onChange={(e) => setDistribution(index, { due_date: e.target.value })}
                  />
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    aria-label={t("pe_call_amount")}
                    value={dist.amount}
                    onChange={(e) => setDistribution(index, { amount: Number(e.target.value) })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("delete")}
                    onClick={() =>
                      set(
                        "projected_distributions",
                        value.projected_distributions.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(returns.multiple != null || returns.irr != null) && (
          <p className="text-xs text-muted-foreground">
            {t("pe_returns_summary", {
              multiple: returns.multiple != null ? `${returns.multiple.toFixed(2)}x` : "—",
              irr: returns.irr != null ? `${(returns.irr * 100).toFixed(1)}%` : "—",
              source: manual ? t("pe_returns_manual") : t("pe_returns_computed"),
            })}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Switch
            id="pe_count_liability"
            checked={value.count_unfunded_as_liability}
            onCheckedChange={(checked) => set("count_unfunded_as_liability", checked)}
          />
          <Label htmlFor="pe_count_liability" className="text-sm text-foreground">
            {t("pe_count_liability")}
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">{t("pe_count_liability_hint")}</p>
      </div>
    </div>
  );
}
