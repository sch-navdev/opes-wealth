"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AllocationBar } from "@/components/assurance-vie-cards";
import { useAssuranceVieText } from "@/components/assurance-vie-text";
import { useLanguage } from "@/context/language-context";
import {
  AV_CLAUSE_TYPES,
  AV_FREQUENCIES,
  AV_HOUSEHOLDS,
  AV_MAX_BENEFICIARIES,
  allocationTotal,
  beneficiarySharesState,
  beneficiarySharesTotal,
  emptyBeneficiary,
  getAssuranceVieMetadataErrors,
  getAssuranceVieWarnings,
  impliedAllocationAmounts,
  linkAllocation,
  type AssuranceVieMetadata,
  type AvBeneficiary,
  type AvClauseType,
  type AvDepositType,
  type AvFrequency,
  type AvHousehold,
} from "@/lib/assurance-vie";
import type { AvKey } from "@/lib/assurance-vie-labels";
import { getCurrencySymbol } from "@/lib/currencies";

const HOUSEHOLD_KEYS: Record<AvHousehold, AvKey> = { single: "av_household_single", couple: "av_household_couple" };
const FREQUENCY_KEYS: Record<AvFrequency, AvKey> = {
  monthly: "av_freq_monthly",
  quarterly: "av_freq_quarterly",
  yearly: "av_freq_yearly",
};
const CLAUSE_KEYS: Record<AvClauseType, AvKey> = { standard: "av_clause_standard", free_text: "av_clause_free" };

const numberOrNull = (raw: string): number | null => {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const fmtPct = (n: number) => String(Math.round(n * 100) / 100);

/** Accessible single-choice segmented control (radio group of buttons). */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  testId?: string;
}) {
  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = options[(index + step + options.length) % options.length];
    onChange(next.value);
    const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[(index + step + options.length) % options.length]?.focus();
  }
  return (
    <div role="radiogroup" aria-label={label} data-testid={testId} className="inline-flex max-w-full flex-wrap border border-border">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={
              selected
                ? "min-w-0 bg-primary px-3 py-2 text-start text-sm font-medium text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                : "min-w-0 bg-transparent px-3 py-2 text-start text-sm text-foreground outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

export function AssuranceVieFields({
  value,
  onChange,
  currency,
  assetValue,
  showErrors = false,
}: {
  value: AssuranceVieMetadata;
  onChange: (next: AssuranceVieMetadata) => void;
  currency: string;
  /** Current value typed in the asset's Value field; drives the implied allocation amounts. */
  assetValue: number | null;
  /** Force the validation messages visible (e.g. after a failed submit). */
  showErrors?: boolean;
}) {
  const t = useAssuranceVieText();
  const { intlLocale } = useLanguage();
  const uid = useId();
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<{ field: "euro" | "uc"; text: string } | null>(null);

  const id = (name: string) => `${uid}-${name}`;
  const symbol = getCurrencySymbol(currency);

  function update(patch: Partial<AssuranceVieMetadata>) {
    setDirty(true);
    onChange({ ...value, ...patch });
  }

  const errors = dirty || showErrors ? getAssuranceVieMetadataErrors(value) : [];
  const errorFor = (...codes: string[]): string | null => {
    const hit = codes.find((code) => errors.includes(code));
    return hit ? t(hit as AvKey) : null;
  };
  const warnings = getAssuranceVieWarnings(value);

  const money = (n: number) => {
    try {
      return new Intl.NumberFormat(intlLocale, { style: "currency", currency }).format(n);
    } catch {
      return String(n);
    }
  };
  const implied = assetValue !== null && Number.isFinite(assetValue) ? impliedAllocationAmounts(assetValue, value) : null;

  function onAllocation(field: "euro" | "uc", text: string) {
    setDraft({ field, text });
    update(linkAllocation(field, numberOrNull(text)));
  }

  function updateBeneficiary(index: number, patch: Partial<AvBeneficiary>) {
    update({ beneficiaries: value.beneficiaries.map((b, i) => (i === index ? { ...b, ...patch } : b)) });
  }

  function addBeneficiary() {
    const newId = `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    update({ beneficiaries: [...value.beneficiaries, emptyBeneficiary(newId)] });
  }

  const beneficiaryState = beneficiarySharesState(value.beneficiaries);
  const scheduled = value.deposit_type === "scheduled";

  const moneyInput = (name: string, label: string, current: number | null, set: (n: number | null) => void, errorId?: string, invalid?: boolean) => (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id(name)}>{label}</Label>
      <div className="relative w-full min-w-0">
        <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{symbol}</span>
        <Input
          id={id(name)}
          type="number"
          step="any"
          inputMode="decimal"
          placeholder="0.00"
          className="ps-12"
          value={current ?? ""}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => set(numberOrNull(e.target.value))}
        />
      </div>
    </div>
  );

  const openedError = errorFor("av_err_opened_invalid", "av_err_opened_future");
  const premiumError = errorFor("av_err_premium_negative");
  const scheduledAmountError = errorFor("av_err_scheduled_amount");
  const scheduledDayError = errorFor("av_err_scheduled_day");
  const scheduledDatesError = errorFor("av_err_scheduled_dates");
  const allocationError = errorFor("av_err_allocation_range", "av_err_allocation_total");

  return (
    <div data-testid="av-fields" className="w-full min-w-0 space-y-6 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-foreground">{t("av_details_heading")}</h3>

      {/* Contract */}
      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor={id("insurer")}>{t("av_insurer")}</Label>
          <Input id={id("insurer")} maxLength={120} value={value.insurer} onChange={(e) => update({ insurer: e.target.value })} />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={id("contract-name")}>{t("av_contract_name")}</Label>
          <Input id={id("contract-name")} maxLength={120} value={value.contract_name} onChange={(e) => update({ contract_name: e.target.value })} />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={id("contract-number")}>{t("av_contract_number")}</Label>
          <Input id={id("contract-number")} maxLength={60} value={value.contract_number} onChange={(e) => update({ contract_number: e.target.value })} />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={id("opened-on")}>{t("av_opened_on")}</Label>
          <Input
            id={id("opened-on")}
            type="date"
            value={value.opened_on}
            aria-invalid={openedError ? true : undefined}
            aria-describedby={`${id("opened-hint")}${openedError ? ` ${id("opened-error")}` : ""}`}
            onChange={(e) => update({ opened_on: e.target.value })}
          />
          <p id={id("opened-hint")} className="text-xs text-muted-foreground">{t("av_opened_on_hint")}</p>
          <FieldError id={id("opened-error")} message={openedError} />
        </div>
        <div className="min-w-0 space-y-2 sm:col-span-2">
          <p id={id("household-label")} className="text-sm font-medium text-foreground">{t("av_household")}</p>
          <Segmented
            testId="av-household"
            label={t("av_household")}
            value={value.household}
            options={AV_HOUSEHOLDS.map((h) => ({ value: h, label: t(HOUSEHOLD_KEYS[h]) }))}
            onChange={(household) => update({ household })}
          />
          <p className="text-xs text-muted-foreground">{t("av_household_hint")}</p>
        </div>
      </div>

      {/* Allocation */}
      <div className="space-y-3 border-t border-border pt-4">
        <h4 className="text-sm font-medium text-foreground">{t("av_alloc_heading")}</h4>
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          {(
            [
              { field: "euro", label: t("av_euro_fund"), hint: t("av_euro_fund_hint"), pct: value.euro_fund_pct, amount: implied?.euro },
              { field: "uc", label: t("av_uc"), hint: t("av_uc_hint"), pct: value.uc_pct, amount: implied?.uc },
            ] as const
          ).map(({ field, label, hint, pct, amount }) => (
            <div key={field} className="min-w-0 space-y-2">
              <Label htmlFor={id(`alloc-${field}`)}>{label}</Label>
              <div className="relative w-full min-w-0">
                <Input
                  id={id(`alloc-${field}`)}
                  type="number"
                  step="any"
                  inputMode="decimal"
                  className="pe-8"
                  value={draft?.field === field ? draft.text : fmtPct(pct)}
                  aria-invalid={allocationError ? true : undefined}
                  aria-describedby={`${id(`alloc-${field}-hint`)}${allocationError ? ` ${id("alloc-error")}` : ""}`}
                  onChange={(e) => onAllocation(field, e.target.value)}
                  onBlur={() => setDraft(null)}
                />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
              <p id={id(`alloc-${field}-hint`)} className="text-xs text-muted-foreground">{hint}</p>
              {amount !== undefined && (
                <p className="text-xs text-foreground" data-testid={`av-implied-${field}`}>
                  {t("av_implied", { amount: money(amount) })}
                </p>
              )}
            </div>
          ))}
        </div>
        <AllocationBar euroPct={value.euro_fund_pct} ucPct={value.uc_pct} />
        <p className="text-xs text-muted-foreground" data-testid="av-alloc-total">
          {t("av_alloc_note")} {t("av_alloc_total", { total: fmtPct(allocationTotal(value)) })}
        </p>
        <FieldError id={id("alloc-error")} message={allocationError} />
      </div>

      {/* Premiums */}
      <div className="space-y-3 border-t border-border pt-4">
        <h4 className="text-sm font-medium text-foreground">{t("av_deposits_heading")}</h4>
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">{t("av_deposit_type")}</p>
          <Segmented<AvDepositType>
            testId="av-deposit-type"
            label={t("av_deposit_type")}
            value={value.deposit_type}
            options={[
              { value: "free", label: t("av_deposit_free") },
              { value: "scheduled", label: t("av_deposit_scheduled") },
            ]}
            onChange={(deposit_type) => update({ deposit_type })}
          />
        </div>
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          {moneyInput("premiums-total", t("av_premiums_total"), value.premiums_paid_total, (n) => update({ premiums_paid_total: n }), id("premium-error"), !!premiumError)}
        </div>

        {scheduled && (
          <div data-testid="av-scheduled" className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              {moneyInput("sched-amount", t("av_scheduled_amount"), value.scheduled_amount, (n) => update({ scheduled_amount: n }), id("sched-amount-error"), !!scheduledAmountError)}
              <FieldError id={id("sched-amount-error")} message={scheduledAmountError} />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-sm font-medium text-foreground">{t("av_scheduled_frequency")}</p>
              <Segmented<AvFrequency>
                label={t("av_scheduled_frequency")}
                value={value.scheduled_frequency}
                options={AV_FREQUENCIES.map((f) => ({ value: f, label: t(FREQUENCY_KEYS[f]) }))}
                onChange={(scheduled_frequency) => update({ scheduled_frequency })}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor={id("sched-day")}>{t("av_scheduled_day")}</Label>
              <Input
                id={id("sched-day")}
                type="number"
                step="1"
                inputMode="numeric"
                value={value.scheduled_day ?? ""}
                aria-invalid={scheduledDayError ? true : undefined}
                aria-describedby={scheduledDayError ? id("sched-day-error") : undefined}
                onChange={(e) => update({ scheduled_day: numberOrNull(e.target.value) })}
              />
              <FieldError id={id("sched-day-error")} message={scheduledDayError} />
            </div>
            <div className="hidden sm:block" aria-hidden="true" />
            <div className="min-w-0 space-y-2">
              <Label htmlFor={id("sched-start")}>{t("av_scheduled_start")}</Label>
              <Input
                id={id("sched-start")}
                type="date"
                value={value.scheduled_start_on}
                aria-invalid={scheduledDatesError ? true : undefined}
                aria-describedby={scheduledDatesError ? id("sched-dates-error") : undefined}
                onChange={(e) => update({ scheduled_start_on: e.target.value })}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor={id("sched-end")}>{t("av_scheduled_end")}</Label>
              <Input
                id={id("sched-end")}
                type="date"
                value={value.scheduled_end_on}
                aria-invalid={scheduledDatesError ? true : undefined}
                aria-describedby={scheduledDatesError ? id("sched-dates-error") : undefined}
                onChange={(e) => update({ scheduled_end_on: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <FieldError id={id("sched-dates-error")} message={scheduledDatesError} />
              <p className="text-xs text-muted-foreground">{t("av_scheduled_hint")}</p>
            </div>
          </div>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          <h5 className="text-sm font-medium text-foreground">{t("av_age70_heading")}</h5>
          <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            {moneyInput("before-70", t("av_premiums_before_70"), value.premiums_before_70, (n) => update({ premiums_before_70: n }), id("premium-error"), !!premiumError)}
            {moneyInput("after-70", t("av_premiums_after_70"), value.premiums_after_70, (n) => update({ premiums_after_70: n }), id("premium-error"), !!premiumError)}
          </div>
          <FieldError id={id("premium-error")} message={premiumError} />
          {warnings.includes("av_warn_premium_split") && (
            <p className="text-xs text-muted-foreground" role="status">{t("av_warn_premium_split")}</p>
          )}
          <p className="text-xs text-muted-foreground">{t("av_age70_hint")}</p>
        </div>
      </div>

      {/* Beneficiaries */}
      <div className="space-y-3 border-t border-border pt-4">
        <h4 className="text-sm font-medium text-foreground">{t("av_bene_heading")}</h4>
        <p className="border border-border bg-muted/40 p-3 text-xs text-muted-foreground" data-testid="av-bene-privacy">
          {t("av_bene_privacy")}
        </p>
        <ul className="space-y-4" aria-label={t("av_bene_heading")}>
          {value.beneficiaries.map((b, index) => {
            const n = index + 1;
            const bid = (name: string) => id(`bene-${b.id}-${name}`);
            return (
              <li key={b.id} className="space-y-3 border border-border p-3" data-testid="av-bene-row">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{t("av_bene_item", { n })}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={t("av_bene_remove", { n })}
                    onClick={() => update({ beneficiaries: value.beneficiaries.filter((_, i) => i !== index) })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor={bid("name")}>{t("av_bene_name")}</Label>
                    <Input id={bid("name")} maxLength={120} autoComplete="off" value={b.name} onChange={(e) => updateBeneficiary(index, { name: e.target.value })} />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor={bid("relationship")}>{t("av_bene_relationship")}</Label>
                    <Input id={bid("relationship")} maxLength={60} autoComplete="off" value={b.relationship} onChange={(e) => updateBeneficiary(index, { relationship: e.target.value })} />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor={bid("share")}>{t("av_bene_share")}</Label>
                    <Input
                      id={bid("share")}
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={b.share_pct ?? ""}
                      onChange={(e) => updateBeneficiary(index, { share_pct: numberOrNull(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{t("av_bene_clause")}</p>
                  <Segmented<AvClauseType>
                    label={`${t("av_bene_clause")} ${n}`}
                    value={b.clause}
                    options={AV_CLAUSE_TYPES.map((c) => ({ value: c, label: t(CLAUSE_KEYS[c]) }))}
                    onChange={(clause) => updateBeneficiary(index, { clause })}
                  />
                </div>
                {b.clause === "free_text" && (
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor={bid("clause-text")}>{t("av_bene_clause_text")}</Label>
                    <textarea
                      id={bid("clause-text")}
                      rows={3}
                      maxLength={500}
                      value={b.clause_text}
                      onChange={(e) => updateBeneficiary(index, { clause_text: e.target.value })}
                      className="w-full min-w-0 border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {["av_err_bene_count", "av_err_bene_name", "av_err_bene_share"]
          .filter((code) => errors.includes(code))
          .map((code) => (
            <FieldError key={code} id={id(`bene-error-${code}`)} message={t(code as AvKey)} />
          ))}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" disabled={value.beneficiaries.length >= AV_MAX_BENEFICIARIES} onClick={addBeneficiary}>
            <Plus className="size-4" />
            {t("av_bene_add")}
          </Button>
          {beneficiaryState !== "none" && (
            <p
              className={beneficiaryState === "complete" ? "text-sm text-success" : "text-sm text-foreground"}
              data-testid="av-bene-total"
              aria-live="polite"
            >
              {t("av_bene_total", { total: fmtPct(beneficiarySharesTotal(value.beneficiaries)) })}
            </p>
          )}
        </div>
        {warnings.includes("av_warn_bene_total") && (
          <p className="text-xs text-muted-foreground" role="status" data-testid="av-bene-warning">
            {t("av_warn_bene_total", { total: fmtPct(beneficiarySharesTotal(value.beneficiaries)) })}
          </p>
        )}
      </div>
    </div>
  );
}
