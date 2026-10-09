"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronDown, Globe2, Info } from "lucide-react";
import { CurrencySwitcher, useSetDisplayCurrency } from "@/components/currency-switcher";
import { useFxBarText } from "@/components/fx-exposure-text";
import { useTierMotion } from "@/components/tier-gate";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { InfoTooltip } from "@/components/ui/tooltip";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { tileEntranceStyle } from "@/lib/dashboard-tiers";
import { buildFxExposure, type FxExposureInput, type FxExposureRow } from "@/lib/fx-exposure";
import {
  EMPTY_FX_TARGETS,
  FX_TARGET_STORAGE_KEY,
  clampTolerance,
  computeFxDrift,
  hasTargets,
  parseFxTargets,
  serializeFxTargets,
  targetBoundaries,
  targetsTotal,
  withTarget,
  type FxTargets,
} from "@/lib/fx-target";
import { useStored } from "@/lib/use-stored";
import { cn } from "@/lib/utils";

/** The quick base-currency chips; every other currency stays in the full switcher beside them. */
export const QUICK_CURRENCIES = ["EUR", "USD", "AED"] as const;

export const FX_PEG_STORAGE_KEY = "opes_fx_group_peg";

/* ---- "Group AED and USD" preference: localStorage behind useSyncExternalStore (no hydration mismatch) ---- */

const pegListeners = new Set<() => void>();
const subscribePeg = (listener: () => void) => {
  pegListeners.add(listener);
  return () => {
    pegListeners.delete(listener);
  };
};
function readPeg(): boolean {
  try {
    return localStorage.getItem(FX_PEG_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}
function writePeg(next: boolean) {
  try {
    localStorage.setItem(FX_PEG_STORAGE_KEY, String(next));
  } catch {
    // storage unavailable (private mode, blocked): the choice simply is not remembered
  }
  pegListeners.forEach((l) => l());
}

/** Chart tokens cycled over the currency blocks (theme-aware; no hardcoded colours). */
const SEGMENT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/**
 * Global exposure: net worth by holding (native) currency, assets against liabilities, and the share
 * held outside the base currency. A normal bento card (not sticky). The collapsed card shows the
 * headline facts; the disclosure reveals the currency breakdown and the assets-vs-liabilities table.
 * Neutral wording only: facts and an informational concentration note, never a recommendation.
 *
 * `rows` are amounts already in `baseCurrency` and already share-scaled for co-ownership (see
 * `lib/fx-exposure.ts`). Money goes through Privacy Mode (`maskValue`); shares and labels stay visible.
 */
export function FxExposureBar({ rows, baseCurrency }: { rows: FxExposureInput[]; baseCurrency: string }) {
  const text = useFxBarText();
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const motion = useTierMotion();
  const setCurrency = useSetDisplayCurrency();
  const [open, setOpen] = useState(false);
  const groupPeg = useSyncExternalStore(subscribePeg, readPeg, () => false);
  const panelId = useId();
  const pegId = useId();

  const fx = useMemo(() => buildFxExposure(rows, { baseCurrency, groupPeg }), [rows, baseCurrency, groupPeg]);

  const money = useMemo(
    () => new Intl.NumberFormat(intlLocale, { style: "currency", currency: fx.baseCurrency, maximumFractionDigits: 0 }),
    [intlLocale, fx.baseCurrency],
  );
  const percent = useMemo(() => new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }), [intlLocale]);
  const fmtMoney = (n: number) => maskValue(money.format(n));
  const fmtShare = (n: number) => `${percent.format(n)} %`;
  /** Signed percentage points: "+3.2", "−3.2", "0". */
  const fmtPoints = (n: number) => {
    const rounded = Math.round(n * 10) / 10;
    const body = percent.format(Math.abs(rounded));
    return rounded > 0 ? `+${body}` : rounded < 0 ? `−${body}` : body;
  };

  // Optional target mix: a UI preference in localStorage (no DB column / migration), invisible until set.
  const [rawTargets, setRawTargets] = useStored(FX_TARGET_STORAGE_KEY);
  const targets = useMemo(() => parseFxTargets(rawTargets), [rawTargets]);
  const saveTargets = (next: FxTargets) => setRawTargets(serializeFxTargets(next));
  const [targetFormKey, setTargetFormKey] = useState(0);
  const drift = useMemo(() => computeFxDrift(fx, targets), [fx, targets]);
  const boundaries = useMemo(() => (drift.complete ? targetBoundaries(fx.rows, targets) : []), [drift.complete, fx.rows, targets]);

  const positive = fx.rows.filter((r) => r.share > 0);
  const positiveTotal = positive.reduce((s, r) => s + r.share, 0);
  const colorOf = (r: FxExposureRow) => SEGMENT_COLORS[fx.rows.indexOf(r) % SEGMENT_COLORS.length];

  const chipClass = (active: boolean) =>
    cn(
      "inline-flex h-8 min-w-12 items-center justify-center border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-muted-foreground hover:text-foreground",
    );

  return (
    <section aria-label={text("fxbar_title")} data-testid="fx-exposure-bar">
      <Card
        className="animate-in fade-in slide-in-from-bottom-2 gap-4 overflow-hidden border-border bg-card py-5 motion-reduce:animate-none"
        style={tileEntranceStyle(motion, 0)}
      >
        {/* header: title + base currency controls */}
        <div className="flex flex-col gap-3 px-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Globe2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {text("fxbar_title")}
            </h2>
            <p className="text-sm text-muted-foreground">{text("fxbar_subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label={text("fxbar_base_group")} className="flex items-center gap-1">
              {QUICK_CURRENCIES.map((code) => (
                <button
                  key={code}
                  type="button"
                  className={chipClass(fx.baseCurrency === code)}
                  aria-pressed={fx.baseCurrency === code}
                  aria-label={text("fxbar_base_chip_aria", { currency: code })}
                  onClick={() => {
                    if (fx.baseCurrency !== code) setCurrency(code);
                  }}
                >
                  {code}
                </button>
              ))}
            </div>
            <CurrencySwitcher value={baseCurrency} className="w-28" ariaLabel={text("fxbar_more")} />
          </div>
        </div>

        {/* headline facts */}
        {fx.rows.length === 0 ? (
          <p className="px-5 text-sm text-muted-foreground">{text("fxbar_empty")}</p>
        ) : (
          <>
            <dl className="grid grid-cols-1 gap-4 px-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  {text("fxbar_net_worth")} · {fx.baseCurrency}
                </dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-foreground" data-testid="fx-net-worth">
                  {fmtMoney(fx.netWorth)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{text("fxbar_international")}</dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-foreground" data-testid="fx-international">
                  {fx.nonBaseShare == null ? "–" : fmtShare(fx.nonBaseShare)}
                </dd>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {text("fxbar_international_desc", { currency: fx.baseCurrency })}
                </p>
              </div>
            </dl>

            {/* share bar */}
            {positiveTotal > 0 && (
              <div className="px-5">
                <div
                  role="img"
                  aria-label={`${text("fxbar_distribution_aria")}: ${positive.map((r) => `${r.label} ${fmtShare(r.share)}`).join(", ")}`}
                  className="flex h-2.5 w-full overflow-hidden bg-muted"
                >
                  {positive.map((r) => (
                    <span
                      key={r.key}
                      data-testid={`fx-segment-${r.key}`}
                      className="h-full transition-[width] duration-300 motion-reduce:transition-none"
                      style={{ width: `${(r.share / positiveTotal) * 100}%`, backgroundColor: colorOf(r) }}
                    />
                  ))}
                </div>
                <div className="relative mt-1" data-testid="fx-ruler">
                  <div aria-hidden="true" className="tick-rule" />
                  {boundaries.map((b) => (
                    <span
                      key={b.key}
                      aria-hidden="true"
                      data-testid={`fx-target-tick-${b.key}`}
                      className="absolute -top-1 h-3.5 w-0.5 bg-foreground"
                      style={{ insetInlineStart: `${b.at}%` }}
                    />
                  ))}
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
                  {positive.map((r) => (
                    <li key={r.key} className="inline-flex items-center gap-1.5">
                      <span className="size-2 shrink-0" style={{ backgroundColor: colorOf(r) }} />
                      <span className="tabular-nums">
                        {r.label} {fmtShare(r.share)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* drift from the optional target mix (only when a target is set) */}
            {drift.active && (
              <div className="px-5" data-testid="fx-drift">
                <h3 className="text-xs font-medium text-muted-foreground">{text("fxbar_drift_title")}</h3>
                <ul className="mt-1 space-y-1">
                  {drift.rows.map((d) => (
                    <li
                      key={d.key}
                      className="flex flex-wrap items-center gap-x-2 text-xs text-foreground"
                      data-testid={`fx-drift-${d.key}`}
                      data-status={d.status}
                    >
                      <span className="tabular-nums">
                        {text("fxbar_drift_row", {
                          segment: d.label,
                          share: fmtShare(d.share),
                          target: fmtShare(d.target),
                          drift: fmtPoints(d.drift),
                        })}
                      </span>
                      <span className="border border-border bg-muted px-1.5 py-0.5 font-medium">
                        {text(d.status === "over" ? "fxbar_drift_over" : d.status === "under" ? "fxbar_drift_under" : "fxbar_drift_within")}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-muted-foreground">{text("fxbar_drift_band", { tolerance: percent.format(drift.tolerance) })}</p>
              </div>
            )}

            {/* neutral notes */}
            {fx.concentration && (
              <div className="flex items-center gap-2 px-5" data-testid="fx-concentration">
                <span className="inline-flex items-center gap-1.5 border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  <Info className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {text("fxbar_concentrated", { currency: fx.concentration.label, share: fmtShare(fx.concentration.share) })}
                </span>
                <HedgeTip />
              </div>
            )}
            {fx.shareBasis === "gross" && (
              <p className="px-5 text-xs text-muted-foreground" data-testid="fx-gross-note">
                {text("fxbar_gross_note")}
              </p>
            )}
          </>
        )}

        {/* toolbar: peg toggle + disclosure */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5">
          <div className="flex items-center gap-2">
            <Switch id={pegId} size="sm" checked={groupPeg} onCheckedChange={writePeg} aria-describedby={`${pegId}-hint`} />
            <label htmlFor={pegId} className="text-xs text-foreground">
              {text("fxbar_peg_label")}
            </label>
            <span id={`${pegId}-hint`} className="sr-only">
              {text("fxbar_peg_hint")}
            </span>
            <InfoTooltip label={text("fxbar_peg_hint")} icon={<Info className="size-4" aria-hidden="true" />}>
              {text("fxbar_peg_hint")}
            </InfoTooltip>
          </div>
          {fx.rows.length > 0 && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {open ? text("fxbar_collapse") : text("fxbar_expand")}
              <ChevronDown
                className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")}
                aria-hidden="true"
              />
            </button>
          )}
        </div>

        {open && fx.rows.length > 0 && (
          <div
            id={panelId}
            data-testid="fx-details"
            className="animate-in fade-in slide-in-from-top-1 space-y-6 border-t border-border px-5 pt-5 motion-reduce:animate-none"
            style={tileEntranceStyle(motion, 0)}
          >
            {/* currency breakdown (net) */}
            <div>
              <h3 className="text-sm font-semibold text-foreground">{text("fxbar_breakdown_title")}</h3>
              <p className="text-xs text-muted-foreground">{text("fxbar_breakdown_desc", { currency: fx.baseCurrency })}</p>
              <ul className="mt-3 space-y-3" aria-label={text("fxbar_breakdown_title")}>
                {fx.rows.map((r) => (
                  <li key={r.key} data-testid={`fx-breakdown-${r.key}`}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-foreground">
                        {r.label}
                        {r.isBase && (
                          <span className="ms-2 border border-border px-1.5 py-0.5 text-xs font-medium uppercase text-muted-foreground">
                            {text("fxbar_base_tag")}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums text-foreground">
                        {fmtMoney(r.net)} <span className="text-muted-foreground">· {fmtShare(r.share)}</span>
                      </span>
                    </div>
                    <div className="relative mt-1 h-1.5 w-full bg-muted" aria-hidden="true">
                      <div
                        className="h-full transition-[width] duration-300 motion-reduce:transition-none"
                        style={{ width: `${Math.min(100, Math.max(0, r.share))}%`, backgroundColor: colorOf(r) }}
                      />
                      {targets.targets[r.key] !== undefined && (
                        <span
                          data-testid={`fx-target-mark-${r.key}`}
                          className="absolute -top-1 h-3.5 w-0.5 bg-foreground"
                          style={{ insetInlineStart: `${targets.targets[r.key]}%` }}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* optional target mix editor */}
            <div data-testid="fx-target-editor">
              <h3 className="text-sm font-semibold text-foreground">{text("fxbar_target_title")}</h3>
              <p className="text-xs text-muted-foreground">{text("fxbar_target_desc")}</p>
              <div key={targetFormKey} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {fx.rows.map((r) => (
                  <label key={r.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <span>{r.label}</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step={0.5}
                      className="h-8 text-sm"
                      aria-label={text("fxbar_target_input_aria", { segment: r.label })}
                      data-testid={`fx-target-input-${r.key}`}
                      defaultValue={targets.targets[r.key] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        saveTargets(withTarget(targets, r.key, v === "" ? null : Number(v)));
                      }}
                    />
                  </label>
                ))}
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <span>{text("fxbar_target_tolerance")}</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={50}
                    step={0.5}
                    className="h-8 text-sm"
                    aria-label={text("fxbar_target_tolerance")}
                    data-testid="fx-target-tolerance"
                    defaultValue={targets.tolerance}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      saveTargets({ ...targets, tolerance: v === "" ? EMPTY_FX_TARGETS.tolerance : clampTolerance(Number(v)) });
                    }}
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {hasTargets(targets) && (
                  <span data-testid="fx-target-total">{text("fxbar_target_total", { total: percent.format(targetsTotal(targets)) })}</span>
                )}
                <span>{text("fxbar_target_storage")}</span>
                {hasTargets(targets) && (
                  <button
                    type="button"
                    className="font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      saveTargets({ ...EMPTY_FX_TARGETS });
                      setTargetFormKey((k) => k + 1);
                    }}
                  >
                    {text("fxbar_target_clear")}
                  </button>
                )}
              </div>
            </div>

            {/* assets vs liabilities per currency */}
            <div>
              <div className="flex items-center gap-1">
                <h3 className="text-sm font-semibold text-foreground">{text("fxbar_exposure_title")}</h3>
                <HedgeTip />
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[30rem] text-sm" data-testid="fx-table">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th scope="col" className="py-2 pe-3 text-start font-medium">{text("fxbar_col_currency")}</th>
                      <th scope="col" className="px-3 py-2 text-end font-medium">{text("fxbar_col_assets")}</th>
                      <th scope="col" className="px-3 py-2 text-end font-medium">{text("fxbar_col_liabilities")}</th>
                      <th scope="col" className="px-3 py-2 text-end font-medium">{text("fxbar_col_net")}</th>
                      <th scope="col" className="ps-3 py-2 text-end font-medium">{text("fxbar_col_share")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fx.rows.map((r) => (
                      <tr key={r.key} className="border-b border-border/60" data-testid={`fx-row-${r.key}`}>
                        <th scope="row" className="py-2 pe-3 text-start font-medium text-foreground">{r.label}</th>
                        <td className="px-3 py-2 text-end tabular-nums text-foreground">{fmtMoney(r.assets)}</td>
                        <td className="px-3 py-2 text-end tabular-nums text-foreground">{fmtMoney(r.liabilities)}</td>
                        <td className="px-3 py-2 text-end tabular-nums font-medium text-foreground">{fmtMoney(r.net)}</td>
                        <td className="ps-3 py-2 text-end tabular-nums text-muted-foreground">{fmtShare(r.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="text-foreground" data-testid="fx-row-total">
                      <th scope="row" className="py-2 pe-3 text-start font-semibold">{text("fxbar_total")}</th>
                      <td className="px-3 py-2 text-end tabular-nums font-semibold">{fmtMoney(fx.totalAssets)}</td>
                      <td className="px-3 py-2 text-end tabular-nums font-semibold">{fmtMoney(fx.totalLiabilities)}</td>
                      <td className="px-3 py-2 text-end tabular-nums font-semibold">{fmtMoney(fx.netWorth)}</td>
                      <td className="ps-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!fx.hasLiabilities && (
                <p className="mt-2 text-xs text-muted-foreground" data-testid="fx-no-liabilities">
                  {text("fxbar_no_liabilities")}
                </p>
              )}
              {fx.shareBasis === "gross" && <p className="mt-2 text-xs text-muted-foreground">{text("fxbar_gross_note")}</p>}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

function HedgeTip() {
  const text = useFxBarText();
  return (
    <InfoTooltip label={text("fxbar_hedge_label")} icon={<Info className="size-4" aria-hidden="true" />}>
      {text("fxbar_hedge_text")}
    </InfoTooltip>
  );
}
