"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAssuranceVieText } from "@/components/assurance-vie-text";
import { useLanguage } from "@/context/language-context";
import {
  AV_HOLDING_TYPES,
  AV_MAX_HOLDINGS,
  deriveAllocationFromHoldings,
  emptyHolding,
  getHoldingRowErrors,
  getHoldingsWarnings,
  holdingsTotal,
  localTodayIso,
  reconcileHoldings,
  type AvHolding,
  type AvHoldingType,
} from "@/lib/assurance-vie";
import type { AvKey } from "@/lib/assurance-vie-labels";

export const HOLDING_TYPE_KEYS: Record<AvHoldingType, AvKey> = {
  euro_fund: "av_hold_type_euro_fund",
  fund_opcvm: "av_hold_type_fund_opcvm",
  etf: "av_hold_type_etf",
  scpi_sci_opci: "av_hold_type_scpi_sci_opci",
  private_equity_fund: "av_hold_type_private_equity_fund",
  structured_product: "av_hold_type_structured_product",
  bond: "av_hold_type_bond",
  equity_direct: "av_hold_type_equity_direct",
  commodity_etc: "av_hold_type_commodity_etc",
  money_market: "av_hold_type_money_market",
  cash_balance: "av_hold_type_cash_balance",
  other: "av_hold_type_other",
};

const numberOrNull = (raw: string): number | null => {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const cell =
  "h-8 w-full min-w-0 border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30";

/**
 * Dense, Chronograph-style editor for the contract holdings (add / edit / remove rows). Pattern: the 21st.dev
 * "Table Edit" / "Editable Data Table" idea of inline-editable rows with a fixed header, rebuilt square-cornered with
 * the app's own tokens (no new dependency). Controlled: the parent owns the list.
 *
 * Never blocks saving on the reconciliation: it only shows the difference with a neutral note. Blocking row problems
 * are shown when `showErrors` is set (parent decides: after the first edit or a failed submit).
 */
export function AssuranceVieHoldingsEditor({
  holdings,
  onChange,
  currency,
  contractValue,
  showErrors,
}: {
  holdings: AvHolding[];
  onChange: (next: AvHolding[]) => void;
  currency: string;
  /** The value typed in the asset's Value field, or null. */
  contractValue: number | null;
  showErrors: boolean;
}) {
  const t = useAssuranceVieText();
  const { intlLocale } = useLanguage();
  const uid = useId();
  const [addType, setAddType] = useState<AvHoldingType>("fund_opcvm");

  const money = (n: number) => {
    try {
      return new Intl.NumberFormat(intlLocale, { style: "currency", currency }).format(n);
    } catch {
      return String(n);
    }
  };

  const todayIso = localTodayIso();
  const rowErrors = holdings.map((h) => (showErrors ? getHoldingRowErrors(h, todayIso) : []));
  const listErrors = [...new Set(rowErrors.flat())];
  if (showErrors && holdings.length > AV_MAX_HOLDINGS) listErrors.unshift("av_hold_err_count");
  const warnings = getHoldingsWarnings(holdings);
  const recon = reconcileHoldings(holdings, contractValue);
  const derived = deriveAllocationFromHoldings(holdings);
  const atCap = holdings.length >= AV_MAX_HOLDINGS;

  function patch(index: number, change: Partial<AvHolding>) {
    onChange(
      holdings.map((h, i) => {
        if (i !== index) return h;
        const next = { ...h, ...change };
        // Typing units and a unit price fills the value (still editable afterwards).
        if (("units" in change || "unit_price" in change) && next.units !== null && next.unit_price !== null) {
          next.value = round2(next.units * next.unit_price);
        }
        return next;
      }),
    );
  }

  function add() {
    const id = `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    onChange([...holdings, emptyHolding(id, addType)]);
  }

  const col = (key: AvKey) => t(key);
  const aria = (key: AvKey, n: number) => t("av_hold_field_aria", { field: col(key), n });

  return (
    <div className="space-y-3 border-t border-border pt-4" data-testid="av-holdings-editor">
      <h4 className="text-sm font-medium text-foreground">{t("av_hold_heading")}</h4>
      <p className="text-xs text-muted-foreground">{t("av_hold_intro")}</p>
      <p className="border border-border bg-muted/40 p-3 text-xs text-muted-foreground" data-testid="av-hold-eligibility">
        {t("av_hold_eligibility")}
      </p>

      {holdings.length > 0 && (
        <div className="w-full overflow-x-auto border border-border" data-testid="av-hold-table">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-start font-index text-[11px] uppercase tracking-wider text-muted-foreground">
                {(["av_hold_type", "av_hold_name", "av_hold_isin", "av_hold_ticker", "av_hold_units", "av_hold_unit_price", "av_hold_value", "av_hold_as_of"] as const).map((k) => (
                  <th key={k} scope="col" className="px-2 py-1.5 text-start font-normal">
                    {col(k)}
                    {k === "av_hold_value" ? ` (${currency})` : ""}
                  </th>
                ))}
                <th scope="col" className="w-10 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, index) => {
                const n = index + 1;
                const errs = rowErrors[index];
                const has = (...codes: string[]) => codes.some((c) => errs.includes(c)) || undefined;
                return (
                  <tr key={h.id} className="border-b border-border last:border-b-0 align-top" data-testid="av-hold-row">
                    <td className="w-52 p-1">
                      <select
                        className={cell}
                        value={h.type}
                        aria-label={aria("av_hold_type", n)}
                        aria-invalid={has("av_hold_err_type")}
                        onChange={(e) => patch(index, { type: e.target.value as AvHoldingType })}
                      >
                        {AV_HOLDING_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {t(HOLDING_TYPE_KEYS[type])}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="min-w-44 p-1">
                      <input
                        className={cell}
                        maxLength={120}
                        autoComplete="off"
                        value={h.name}
                        aria-label={aria("av_hold_name", n)}
                        aria-invalid={has("av_hold_err_name")}
                        onChange={(e) => patch(index, { name: e.target.value })}
                      />
                    </td>
                    <td className="w-36 p-1">
                      <input
                        className={`${cell} font-mono uppercase`}
                        maxLength={12}
                        autoComplete="off"
                        value={h.isin}
                        aria-label={aria("av_hold_isin", n)}
                        aria-invalid={has("av_hold_err_isin")}
                        onChange={(e) => patch(index, { isin: e.target.value.toUpperCase() })}
                      />
                    </td>
                    <td className="w-24 p-1">
                      <input
                        className={`${cell} font-mono uppercase`}
                        maxLength={20}
                        autoComplete="off"
                        value={h.ticker}
                        aria-label={aria("av_hold_ticker", n)}
                        onChange={(e) => patch(index, { ticker: e.target.value.toUpperCase() })}
                      />
                    </td>
                    <td className="w-24 p-1">
                      <input
                        className={`${cell} text-end tabular-nums`}
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={h.units ?? ""}
                        aria-label={aria("av_hold_units", n)}
                        aria-invalid={has("av_hold_err_units")}
                        onChange={(e) => patch(index, { units: numberOrNull(e.target.value) })}
                      />
                    </td>
                    <td className="w-28 p-1">
                      <input
                        className={`${cell} text-end tabular-nums`}
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={h.unit_price ?? ""}
                        aria-label={aria("av_hold_unit_price", n)}
                        aria-invalid={has("av_hold_err_price")}
                        onChange={(e) => patch(index, { unit_price: numberOrNull(e.target.value) })}
                      />
                    </td>
                    <td className="w-32 p-1">
                      <input
                        className={`${cell} text-end tabular-nums`}
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={h.value ?? ""}
                        aria-label={aria("av_hold_value", n)}
                        aria-invalid={has("av_hold_err_value")}
                        onChange={(e) => patch(index, { value: numberOrNull(e.target.value) })}
                      />
                    </td>
                    <td className="w-36 p-1">
                      <input
                        className={cell}
                        type="date"
                        value={h.as_of}
                        aria-label={aria("av_hold_as_of", n)}
                        aria-invalid={has("av_hold_err_date", "av_hold_err_date_future")}
                        onChange={(e) => patch(index, { as_of: e.target.value })}
                      />
                    </td>
                    <td className="p-1 text-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label={t("av_hold_remove", { n })}
                        onClick={() => onChange(holdings.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${uid}-add-type`} className="sr-only">
          {t("av_hold_add_type")}
        </label>
        <select
          id={`${uid}-add-type`}
          className={`${cell} w-auto max-w-full`}
          value={addType}
          onChange={(e) => setAddType(e.target.value as AvHoldingType)}
        >
          {AV_HOLDING_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(HOLDING_TYPE_KEYS[type])}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" disabled={atCap} onClick={add}>
          <Plus className="size-4" />
          {t("av_hold_add")}
        </Button>
        <p className="ms-auto text-xs text-muted-foreground" data-testid="av-hold-count">
          {t("av_hold_count", { count: holdings.length, max: AV_MAX_HOLDINGS })}
        </p>
      </div>

      {listErrors.map((code) => (
        <p key={code} className="text-xs text-destructive" role="alert">
          {t(code as AvKey)}
        </p>
      ))}
      {warnings.map((code) => (
        <p key={code} className="text-xs text-muted-foreground" role="status">
          {t(code as AvKey)}
        </p>
      ))}

      {recon.state !== "none" && (
        <div className="space-y-1 border border-border bg-muted/40 p-3" data-testid="av-hold-recon" data-state={recon.state}>
          <p className="text-sm font-medium text-foreground">{t("av_hold_recon_title")}</p>
          <p className="text-sm text-foreground" data-testid="av-hold-recon-line">
            {recon.contractValue === null || recon.difference === null
              ? t("av_hold_recon_nocontract", { holdings: money(recon.holdingsTotal) })
              : t(recon.state === "match" ? "av_hold_recon_match" : recon.state === "under" ? "av_hold_recon_under" : "av_hold_recon_over", {
                  holdings: money(recon.holdingsTotal),
                  contract: money(recon.contractValue),
                  difference: money(Math.abs(recon.difference)),
                })}
          </p>
          {recon.state !== "match" && <p className="text-xs text-muted-foreground">{t("av_hold_recon_note")}</p>}
        </div>
      )}
      {holdings.length > 0 && recon.state === "none" ? (
        <p className="text-xs text-muted-foreground">{t("av_hold_total", { amount: money(holdingsTotal(holdings)) })}</p>
      ) : null}
      {derived && (
        <p className="text-xs text-muted-foreground" data-testid="av-hold-derived">
          {t("av_hold_derived", { euro: String(derived.euro_fund_pct), uc: String(derived.uc_pct) })}
        </p>
      )}
    </div>
  );
}
