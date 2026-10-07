"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAssuranceVieText } from "@/components/assurance-vie-text";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import {
  ASSURANCE_VIE_CONFIG,
  beneficiarySharesState,
  beneficiarySharesTotal,
  computeMilestone,
  hasPremiumAgeSplit,
  impliedAllocationAmounts,
  scheduledAnnualAmount,
  type AssuranceVieMetadata,
  type AvFrequency,
  type AvHousehold,
} from "@/lib/assurance-vie";
import type { AvKey } from "@/lib/assurance-vie-labels";

const FREQUENCY_KEYS: Record<AvFrequency, AvKey> = {
  monthly: "av_freq_monthly",
  quarterly: "av_freq_quarterly",
  yearly: "av_freq_yearly",
};
const HOUSEHOLD_KEYS: Record<AvHousehold, AvKey> = { single: "av_household_single", couple: "av_household_couple" };
const HOUSEHOLD_SHORT_KEYS: Record<AvHousehold, AvKey> = { single: "av_household_single_short", couple: "av_household_couple_short" };

const fmtPct = (n: number) => String(Math.round(n * 100) / 100);

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

/** Two-segment allocation bar (euro fund | unit-linked), shared by the form and the detail page. */
export function AllocationBar({ euroPct, ucPct }: { euroPct: number; ucPct: number }) {
  const t = useAssuranceVieText();
  const euro = Math.min(100, Math.max(0, Number.isFinite(euroPct) ? euroPct : 0));
  const uc = Math.min(100, Math.max(0, Number.isFinite(ucPct) ? ucPct : 0));
  return (
    <div
      role="img"
      aria-label={t("av_alloc_bar_aria", { euro: fmtPct(euro), uc: fmtPct(uc) })}
      data-testid="av-allocation-bar"
      className="flex h-3 w-full overflow-hidden border border-border bg-muted"
    >
      <div data-testid="av-bar-euro" className="h-full bg-primary" style={{ width: `${euro}%` }} />
      <div data-testid="av-bar-uc" className="h-full bg-chart-2" style={{ width: `${uc}%` }} />
    </div>
  );
}

function useDateFormatter() {
  const { intlLocale } = useLanguage();
  return (iso: string) => {
    try {
      return new Intl.DateTimeFormat(intlLocale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
    } catch {
      return iso;
    }
  };
}

/**
 * The 8-year milestone: a countdown before the anniversary, the informational allowance
 * note after it. No tax amount is computed. `today` is injectable for tests.
 */
export function AssuranceVieMilestoneCard({ metadata, today }: { metadata: AssuranceVieMetadata; today?: string | Date }) {
  const t = useAssuranceVieText();
  const { intlLocale } = useLanguage();
  const formatDate = useDateFormatter();
  const status = computeMilestone(metadata.opened_on, metadata.household, today);

  const allowanceAmount = (value: number, currency: string) => {
    try {
      return new Intl.NumberFormat(intlLocale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
    } catch {
      return `${value} ${currency}`;
    }
  };

  return (
    <Card className="border-border bg-card" data-testid="av-milestone">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-foreground">{t("av_milestone_title")}</CardTitle>
        {status.kind === "before" && (
          <Badge variant="outline" data-testid="av-milestone-badge" data-status="before">
            {t("av_ms_badge_before")}
          </Badge>
        )}
        {status.kind === "reached" && (
          <Badge className="bg-success text-success-foreground" data-testid="av-milestone-badge" data-status="reached">
            {t("av_ms_badge_reached")}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {status.kind === "unknown" && (
          <p className="text-sm text-muted-foreground" data-testid="av-milestone-unset">
            {t("av_ms_unset")}
          </p>
        )}

        {status.kind === "before" && (
          <>
            <p className="text-sm font-medium text-foreground">{t("av_ms_anniversary", { date: formatDate(status.date) })}</p>
            <div className="grid grid-cols-2 gap-4 sm:max-w-md">
              <div data-testid="av-days-remaining">
                <p className="text-xs text-muted-foreground">{t("av_ms_days_remaining")}</p>
                <p className="text-2xl font-semibold text-foreground">{status.daysRemaining.toLocaleString(intlLocale)}</p>
              </div>
              <div data-testid="av-months-remaining">
                <p className="text-xs text-muted-foreground">{t("av_ms_months_remaining")}</p>
                <p className="text-2xl font-semibold text-foreground">{status.monthsRemaining.toLocaleString(intlLocale)}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground" data-testid="av-milestone-before-text">
              {t("av_ms_before_text", {
                amount: allowanceAmount(status.allowance.amount, status.allowance.currency),
                household: t(HOUSEHOLD_SHORT_KEYS[status.allowance.household]),
              })}
            </p>
          </>
        )}

        {status.kind === "reached" && (
          <>
            <p className="text-sm font-medium text-foreground">{t("av_ms_anniversary", { date: formatDate(status.date) })}</p>
            <div data-testid="av-days-since">
              <p className="text-xs text-muted-foreground">{t("av_ms_days_since")}</p>
              <p className="text-2xl font-semibold text-foreground">{status.daysSince.toLocaleString(intlLocale)}</p>
            </div>
            <div className="space-y-1 border border-border bg-muted/40 p-3" data-testid="av-allowance">
              <p className="text-sm font-medium text-foreground">{t("av_ms_reached_title")}</p>
              <p className="text-sm text-foreground" data-testid="av-allowance-text">
                {t("av_ms_reached_text", {
                  amount: allowanceAmount(status.allowance.amount, status.allowance.currency),
                  household: t(HOUSEHOLD_SHORT_KEYS[status.allowance.household]),
                })}
              </p>
            </div>
          </>
        )}

        {hasPremiumAgeSplit(metadata) && (
          <p className="text-sm text-muted-foreground" data-testid="av-age70-note">
            {t("av_age70_note")}
          </p>
        )}

        <p className="text-xs text-muted-foreground" data-testid="av-milestone-disclaimer">
          {t("av_ms_disclaimer", { asOf: formatDate(ASSURANCE_VIE_CONFIG.asOf) })}
        </p>
      </CardContent>
    </Card>
  );
}

/** Detail-page cards for an Assurance-Vie contract. Money values follow privacy-mode masking. */
export function AssuranceVieDetailCards({
  metadata,
  assetValue,
  currency,
  today,
}: {
  metadata: AssuranceVieMetadata;
  /** The asset's value (the viewer's share for a co-owned asset). */
  assetValue: number;
  currency: string;
  today?: string | Date;
}) {
  const t = useAssuranceVieText();
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const formatDate = useDateFormatter();

  const money = (n: number) => {
    try {
      return maskValue(new Intl.NumberFormat(intlLocale, { style: "currency", currency }).format(n));
    } catch {
      return maskValue(String(n));
    }
  };
  const implied = impliedAllocationAmounts(assetValue, metadata);
  const annual = scheduledAnnualAmount(metadata);
  const beneficiaries = metadata.beneficiaries;
  const sharesState = beneficiarySharesState(beneficiaries);

  return (
    <div className="space-y-6" data-testid="av-detail">
      <Card className="border-border bg-card" data-testid="av-summary">
        <CardHeader>
          <CardTitle className="text-foreground">{t("av_summary_title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label={t("av_insurer")} value={metadata.insurer} />
          <Field label={t("av_contract_name")} value={metadata.contract_name} />
          <Field label={t("av_contract_number")} value={metadata.contract_number} />
          <Field label={t("av_opened_on")} value={metadata.opened_on ? formatDate(metadata.opened_on) : null} />
          <Field label={t("av_household")} value={t(HOUSEHOLD_KEYS[metadata.household])} />
          <Field label={t("av_contract_value")} value={money(assetValue)} />
        </CardContent>
      </Card>

      <Card className="border-border bg-card" data-testid="av-allocation">
        <CardHeader>
          <CardTitle className="text-foreground">{t("av_alloc_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AllocationBar euroPct={metadata.euro_fund_pct} ucPct={metadata.uc_pct} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1" data-testid="av-alloc-euro">
              <div className="flex items-center gap-2">
                <span className="size-3 shrink-0 bg-primary" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">{t("av_euro_fund")}</p>
              </div>
              <p className="text-lg font-semibold text-foreground">{fmtPct(metadata.euro_fund_pct)}%</p>
              <p className="text-xs text-muted-foreground">{t("av_implied", { amount: money(implied.euro) })}</p>
              <p className="text-xs text-muted-foreground">{t("av_euro_fund_hint")}</p>
            </div>
            <div className="min-w-0 space-y-1" data-testid="av-alloc-uc">
              <div className="flex items-center gap-2">
                <span className="size-3 shrink-0 bg-chart-2" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">{t("av_uc")}</p>
              </div>
              <p className="text-lg font-semibold text-foreground">{fmtPct(metadata.uc_pct)}%</p>
              <p className="text-xs text-muted-foreground">{t("av_implied", { amount: money(implied.uc) })}</p>
              <p className="text-xs text-muted-foreground">{t("av_uc_hint")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card" data-testid="av-deposits">
        <CardHeader>
          <CardTitle className="text-foreground">{t("av_deposits_title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label={t("av_deposit_type")} value={metadata.deposit_type === "scheduled" ? t("av_deposit_scheduled") : t("av_deposit_free")} />
          <Field label={t("av_premiums_total")} value={metadata.premiums_paid_total !== null ? money(metadata.premiums_paid_total) : null} />
          {metadata.deposit_type === "scheduled" && (
            <>
              <Field
                label={t("av_scheduled_amount")}
                value={
                  metadata.scheduled_amount !== null && metadata.scheduled_day !== null
                    ? t("av_scheduled_summary", {
                        frequency: t(FREQUENCY_KEYS[metadata.scheduled_frequency]),
                        amount: money(metadata.scheduled_amount),
                        day: metadata.scheduled_day,
                      })
                    : null
                }
              />
              {annual !== null && (
                <p className="self-end text-xs text-muted-foreground" data-testid="av-scheduled-annual">
                  {t("av_scheduled_annual", { amount: money(annual) })}
                </p>
              )}
              <Field label={t("av_scheduled_start")} value={metadata.scheduled_start_on ? formatDate(metadata.scheduled_start_on) : null} />
              <Field label={t("av_scheduled_end")} value={metadata.scheduled_end_on ? formatDate(metadata.scheduled_end_on) : null} />
            </>
          )}
          {hasPremiumAgeSplit(metadata) && (
            <>
              <Field label={t("av_premiums_before_70")} value={metadata.premiums_before_70 !== null ? money(metadata.premiums_before_70) : null} />
              <Field label={t("av_premiums_after_70")} value={metadata.premiums_after_70 !== null ? money(metadata.premiums_after_70) : null} />
            </>
          )}
        </CardContent>
      </Card>

      <AssuranceVieMilestoneCard metadata={metadata} today={today} />

      <Card className="border-border bg-card" data-testid="av-beneficiaries">
        <CardHeader>
          <CardTitle className="text-foreground">{t("av_bene_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {beneficiaries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("av_bene_none")}</p>
          ) : (
            <>
              <ul className="divide-y divide-border border border-border">
                {beneficiaries.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-start justify-between gap-2 p-3" data-testid="av-bene-item">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-foreground">{b.name || "—"}</p>
                      <p className="break-words text-xs text-muted-foreground">
                        {[b.relationship, b.clause === "free_text" ? t("av_clause_free") : t("av_clause_standard")].filter(Boolean).join(" · ")}
                      </p>
                      {b.clause === "free_text" && b.clause_text && (
                        <p className="mt-1 break-words text-xs text-muted-foreground">{b.clause_text}</p>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-foreground">{b.share_pct !== null ? `${fmtPct(b.share_pct)}%` : "—"}</p>
                  </li>
                ))}
              </ul>
              {sharesState !== "none" && (
                <p className="text-sm text-foreground" data-testid="av-bene-total">
                  {t("av_bene_total", { total: fmtPct(beneficiarySharesTotal(beneficiaries)) })}
                </p>
              )}
              {sharesState === "mismatch" && (
                <p className="text-xs text-muted-foreground" role="status">
                  {t("av_warn_bene_total", { total: fmtPct(beneficiarySharesTotal(beneficiaries)) })}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground" data-testid="av-scope-note">
        {t("av_scope_note")}
      </p>
    </div>
  );
}
