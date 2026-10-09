"use client";

import { formatDecimal } from "@/lib/money-parts";
import { moneyFormatter } from "@/lib/money-parts";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/context/language-context";
import { useScpiText } from "@/components/scpi-text";
import {
  SCPI_HOLDING_MODES,
  SCPI_MAX_INDICATORS,
  SCPI_MAX_NOTE_CHARS,
  SCPI_MAX_REGISTER_CHARS,
  SCPI_MAX_REVALORISATIONS,
  generateQuarterlyDividends,
  scpiAverageYield,
  scpiCurrentSubscriptionPrice,
  scpiEnjoymentDelayMonths,
  scpiEntryFees,
  scpiInvested,
  scpiRevalorisationSteps,
  scpiTotalRevalorisationPct,
  scpiTrailingYield,
  scpiWithdrawalValue,
  type ScpiDividend,
  type ScpiHoldingMode,
  type ScpiIndicator,
  type ScpiMetadata,
  type ScpiRevalorisation,
} from "@/lib/scpi";
import type { TranslationKey } from "@/lib/i18n";

const todayIso = new Date().toISOString().slice(0, 10);

export const SCPI_MODE_LABEL_KEYS: Record<ScpiHoldingMode, TranslationKey> = {
  pleine_propriete: "scpi_mode_full",
  nue_propriete: "scpi_mode_bare",
  usufruit: "scpi_mode_usufruct",
};

function numberOrNull(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function ScpiFields({
  value,
  onChange,
  shares,
  currency,
}: {
  value: ScpiMetadata;
  onChange: (next: ScpiMetadata) => void;
  /** Shares held (the dialog's Quantity). */
  shares: number;
  currency: string;
}) {
  const { t, intlLocale } = useLanguage();
  const st = useScpiText();
  const formatter = moneyFormatter(intlLocale, currency);

  function set<K extends keyof ScpiMetadata>(key: K, next: ScpiMetadata[K]) {
    onChange({ ...value, [key]: next });
  }

  function setReval(index: number, patch: Partial<ScpiRevalorisation>) {
    set(
      "revalorisations",
      value.revalorisations.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  function setIndicator(index: number, patch: Partial<ScpiIndicator>) {
    set(
      "indicators",
      value.indicators.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  const delayMonths = scpiEnjoymentDelayMonths(value.subscription_date, value.jouissance_date);
  const revalSteps = scpiRevalorisationSteps(value);
  const totalReval = scpiTotalRevalorisationPct(value);
  const mds = scpiCurrentSubscriptionPrice(value);

  function setDividend(index: number, patch: Partial<ScpiDividend>) {
    set(
      "dividends",
      value.dividends.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
  }

  function generate() {
    const invested = scpiInvested(value, shares);
    const yieldPct = value.target_yield_pct ?? scpiAverageYield(value) ?? 0;
    set(
      "dividends",
      generateQuarterlyDividends({
        invested,
        yieldPct,
        jouissanceDate: value.jouissance_date,
        today: todayIso,
      }),
    );
  }

  const invested = scpiInvested(value, shares);
  const trailing = scpiTrailingYield(value, shares, todayIso);
  const canGenerate =
    invested > 0 && (value.target_yield_pct ?? scpiAverageYield(value) ?? 0) > 0 && value.jouissance_date !== "";
  const unit = scpiWithdrawalValue(value);

  return (
    <div className="w-full min-w-0 space-y-4 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-foreground">{t("scpi_details")}</h3>

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="scpi_manager">{t("scpi_management_company")}</Label>
          <Input
            id="scpi_manager"
            placeholder={t("scpi_management_company_placeholder")}
            value={value.management_company}
            onChange={(e) => set("management_company", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="scpi_sector">{t("scpi_sector")}</Label>
          <Input
            id="scpi_sector"
            placeholder={t("scpi_sector_placeholder")}
            value={value.sector}
            onChange={(e) => set("sector", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="scpi_geography">{t("scpi_geography")}</Label>
          <Input
            id="scpi_geography"
            placeholder={t("scpi_geography_placeholder")}
            value={value.geography}
            onChange={(e) => set("geography", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="scpi_mode">{t("scpi_holding_mode")}</Label>
          <Select
            value={value.holding_mode}
            onValueChange={(next) => set("holding_mode", next as ScpiHoldingMode)}
          >
            <SelectTrigger id="scpi_mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCPI_HOLDING_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(SCPI_MODE_LABEL_KEYS[mode])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <h4 className="text-sm font-medium text-foreground">{t("scpi_subscription_heading")}</h4>
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="scpi_price">{t("scpi_subscription_price")}</Label>
            <Input
              id="scpi_price"
              type="number"
              step="any"
              min="0"
              value={value.subscription_price ?? ""}
              onChange={(e) => set("subscription_price", numberOrNull(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">{t("scpi_price_hint")}</p>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="scpi_fee">{t("scpi_entry_fee")}</Label>
            <Input
              id="scpi_fee"
              type="number"
              step="0.1"
              min="0"
              max="99"
              value={value.entry_fee_pct ?? ""}
              onChange={(e) => set("entry_fee_pct", numberOrNull(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">{t("scpi_entry_fee_hint")}</p>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="scpi_withdrawal">{t("scpi_withdrawal_value")}</Label>
            <Input
              id="scpi_withdrawal"
              type="number"
              step="any"
              min="0"
              placeholder={unit != null ? unit.toFixed(2) : ""}
              value={value.withdrawal_value ?? ""}
              onChange={(e) => set("withdrawal_value", numberOrNull(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">{t("scpi_withdrawal_hint")}</p>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="scpi_subscription_date">{st("scpi2_subscription_date")}</Label>
            <Input
              id="scpi_subscription_date"
              type="date"
              value={value.subscription_date}
              onChange={(e) => set("subscription_date", e.target.value)}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="scpi_jouissance">{t("scpi_jouissance_date")}</Label>
            <Input
              id="scpi_jouissance"
              type="date"
              value={value.jouissance_date}
              onChange={(e) => set("jouissance_date", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {st("scpi2_enjoyment_delay")}:{" "}
              {delayMonths != null ? st("scpi2_months", { months: formatDecimal(delayMonths, intlLocale, 1) }) : "—"}
            </p>
          </div>
          <div className="min-w-0 space-y-2 sm:col-span-2">
            <Label htmlFor="scpi_register">{st("scpi2_register")}</Label>
            <Input
              id="scpi_register"
              maxLength={SCPI_MAX_REGISTER_CHARS}
              value={value.register_numbers}
              onChange={(e) => set("register_numbers", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{st("scpi2_register_hint")}</p>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="scpi_target_yield">{t("scpi_target_yield")}</Label>
            <Input
              id="scpi_target_yield"
              type="number"
              step="0.01"
              min="0"
              value={value.target_yield_pct ?? ""}
              onChange={(e) => set("target_yield_pct", numberOrNull(e.target.value))}
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch
              id="scpi_credit"
              checked={value.financed_by_credit}
              onCheckedChange={(checked) => set("financed_by_credit", checked)}
            />
            <Label htmlFor="scpi_credit" className="text-sm text-foreground">
              {t("scpi_financed_by_credit")}
            </Label>
          </div>
        </div>
        {invested > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("scpi_summary", {
              invested: formatter.format(invested),
              fees: formatter.format(scpiEntryFees(value, shares)),
            })}
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-foreground">{st("scpi2_reval_heading")}</h4>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={value.revalorisations.length >= SCPI_MAX_REVALORISATIONS}
            onClick={() =>
              set("revalorisations", [
                ...value.revalorisations,
                { id: `rev-${Date.now()}`, price: mds ?? 0, date: todayIso },
              ])
            }
          >
            {st("scpi2_reval_add")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{st("scpi2_reval_hint")}</p>
        {value.revalorisations.length > 0 && (
          <ul className="space-y-2">
            {value.revalorisations.map((r, index) => {
              const step = revalSteps.find((s) => s.id === r.id);
              return (
                <li key={r.id} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    aria-label={st("scpi2_reval_price")}
                    value={r.price}
                    onChange={(e) => setReval(index, { price: Number(e.target.value) })}
                  />
                  <Input
                    type="date"
                    aria-label={st("scpi2_reval_date")}
                    value={r.date}
                    onChange={(e) => setReval(index, { date: e.target.value })}
                  />
                  <span className="w-16 text-end text-xs tabular-nums text-muted-foreground">
                    {step?.changePct != null ? `${step.changePct >= 0 ? "+" : ""}${formatDecimal(step.changePct, intlLocale, 2)}%` : "—"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={st("scpi2_remove")}
                    onClick={() =>
                      set(
                        "revalorisations",
                        value.revalorisations.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {totalReval != null && (
          <p className="text-xs text-muted-foreground">
            {st("scpi2_reval_total")}: {totalReval >= 0 ? "+" : ""}
            {formatDecimal(totalReval, intlLocale, 2)}%
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-foreground">{st("scpi2_ind_heading")}</h4>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={value.indicators.length >= SCPI_MAX_INDICATORS}
            onClick={() =>
              set("indicators", [
                ...value.indicators,
                { id: `ind-${Date.now()}`, as_of: todayIso, vdrec: null, vdrea: null, source_note: "" },
              ])
            }
          >
            {st("scpi2_ind_add")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{st("scpi2_ind_hint")}</p>
        {value.indicators.length > 0 && (
          <ul className="space-y-3">
            {value.indicators.map((row, index) => (
              <li key={row.id} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                <div className="min-w-0 space-y-1">
                  <Label className="text-xs text-muted-foreground">{st("scpi2_ind_asof")}</Label>
                  <Input
                    type="date"
                    value={row.as_of}
                    onChange={(e) => setIndicator(index, { as_of: e.target.value })}
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label className="text-xs text-muted-foreground">{st("scpi2_ind_vdrec")}</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={row.vdrec ?? ""}
                    onChange={(e) => setIndicator(index, { vdrec: numberOrNull(e.target.value) })}
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label className="text-xs text-muted-foreground">{st("scpi2_ind_vdrea")}</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={row.vdrea ?? ""}
                    onChange={(e) => setIndicator(index, { vdrea: numberOrNull(e.target.value) })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={st("scpi2_remove")}
                  onClick={() =>
                    set(
                      "indicators",
                      value.indicators.filter((_, i) => i !== index),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
                <div className="col-span-4 min-w-0">
                  <Input
                    aria-label={st("scpi2_ind_source")}
                    placeholder={st("scpi2_ind_source_placeholder")}
                    maxLength={SCPI_MAX_NOTE_CHARS}
                    value={row.source_note}
                    onChange={(e) => setIndicator(index, { source_note: e.target.value })}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-foreground">{t("scpi_yield_history")}</h4>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              set("yield_history", [
                ...value.yield_history,
                { id: `y-${Date.now()}`, year: new Date().getFullYear() - 1, rate: 0 },
              ])
            }
          >
            {t("scpi_add_year")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("scpi_yield_hint")}</p>
        {value.yield_history.length > 0 && (
          <ul className="space-y-2">
            {value.yield_history.map((y, index) => (
              <li key={y.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <Input
                  type="number"
                  aria-label={t("scpi_year")}
                  value={y.year}
                  onChange={(e) =>
                    set(
                      "yield_history",
                      value.yield_history.map((row, i) =>
                        i === index ? { ...row, year: Number(e.target.value) } : row,
                      ),
                    )
                  }
                />
                <Input
                  type="number"
                  step="0.01"
                  aria-label={t("scpi_rate")}
                  value={y.rate}
                  onChange={(e) =>
                    set(
                      "yield_history",
                      value.yield_history.map((row, i) =>
                        i === index ? { ...row, rate: Number(e.target.value) } : row,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("delete")}
                  onClick={() =>
                    set(
                      "yield_history",
                      value.yield_history.filter((_, i) => i !== index),
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

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-foreground">{t("scpi_dividends_heading")}</h4>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!canGenerate} onClick={generate}>
              {t("scpi_generate_dividends")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                set("dividends", [
                  ...value.dividends,
                  {
                    id: `div-manual-${Date.now()}`,
                    date: todayIso,
                    amount: 0,
                    status: "received",
                    quarter: "",
                  },
                ])
              }
            >
              {t("scpi_add_dividend")}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("scpi_dividends_hint")}</p>
        {value.dividends.length > 0 && (
          <ul className="space-y-2">
            {value.dividends.map((d, index) => (
              <li key={d.id} className="grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-2">
                <Input
                  type="date"
                  aria-label={t("scpi_dividend_date")}
                  value={d.date}
                  onChange={(e) => setDividend(index, { date: e.target.value })}
                />
                <Input
                  type="number"
                  step="any"
                  min="0"
                  aria-label={t("scpi_dividend_amount")}
                  value={d.amount}
                  onChange={(e) => setDividend(index, { amount: Number(e.target.value) })}
                />
                <Select
                  value={d.status}
                  onValueChange={(next) => setDividend(index, { status: next as ScpiDividend["status"] })}
                >
                  <SelectTrigger className="w-28" aria-label={t("pe_call_status")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="received">{t("scpi_status_received")}</SelectItem>
                    <SelectItem value="expected">{t("scpi_status_expected")}</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={d.exceptional === true}
                    aria-label={st("scpi2_div_exceptional_aria")}
                    onCheckedChange={(checked) => setDividend(index, { exceptional: checked === true })}
                  />
                  {st("scpi2_div_exceptional")}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("delete")}
                  onClick={() =>
                    set(
                      "dividends",
                      value.dividends.filter((_, i) => i !== index),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {trailing != null && (
          <p className="text-xs text-muted-foreground">
            {t("scpi_trailing_yield", { pct: formatDecimal(trailing, intlLocale, 2) })}
          </p>
        )}
      </div>
    </div>
  );
}
