import type { TranslationKey } from "@/lib/i18n";
import type { DataQualityIssue, DataQualityKind, DataQualitySeverity } from "@/lib/data-quality";

type Vars = Record<string, string | number>;

export const KIND_LABEL_KEYS: Record<DataQualityKind, TranslationKey> = {
  fx_missing: "dq_kind_fx_missing",
  fx_fallback: "dq_kind_fx_fallback",
  stale_valuation: "dq_kind_stale_valuation",
  no_valuation_date: "dq_kind_no_valuation_date",
  missing_cost_basis: "dq_kind_missing_cost_basis",
  cash_balance_mismatch: "dq_kind_cash_balance_mismatch",
  zero_value: "dq_kind_zero_value",
  pe_overdue_call: "dq_kind_pe_overdue_call",
  duplicate_suspect: "dq_kind_duplicate_suspect",
};

export const SEVERITY_LABEL_KEYS: Record<DataQualitySeverity, TranslationKey> = {
  high: "dq_severity_high",
  medium: "dq_severity_medium",
  low: "dq_severity_low",
};

const MARKET_CATEGORIES = new Set(["Equities", "Crypto", "Precious Metals", "Exotic Assets"]);
const NAV_CATEGORIES = new Set(["Private Equity", "SCPI", "Startups"]);

export type IssueText = { explainKey: TranslationKey; explainVars: Vars; hintKey: TranslationKey };

/**
 * Which explanation and "how to fix" hint an issue gets, plus the values to fill in. Money is
 * formatted by the caller (`formatMoney`) so the component can route it through Privacy Mode.
 */
export function describeIssue(issue: DataQualityIssue, formatMoney: (amount: number, currency: string) => string): IssueText {
  const p = issue.params;
  const category = issue.category ?? "";
  switch (issue.kind) {
    case "fx_missing":
      return p.scope === "base"
        ? { explainKey: "dq_explain_fx_missing_base", explainVars: { currency: p.currency }, hintKey: "dq_hint_fx_missing_base" }
        : { explainKey: "dq_explain_fx_missing", explainVars: { currency: p.currency, base: p.base }, hintKey: "dq_hint_fx_missing" };
    case "fx_fallback":
      return { explainKey: "dq_explain_fx_fallback", explainVars: {}, hintKey: "dq_hint_fx_fallback" };
    case "stale_valuation":
      return {
        explainKey: "dq_explain_stale_valuation",
        explainVars: { date: p.date, days: p.days, threshold: p.threshold },
        hintKey: MARKET_CATEGORIES.has(category)
          ? "dq_hint_stale_market"
          : category === "Cash"
            ? "dq_hint_stale_cash"
            : NAV_CATEGORIES.has(category)
              ? "dq_hint_stale_nav"
              : "dq_hint_stale_generic",
      };
    case "no_valuation_date":
      return { explainKey: "dq_explain_no_valuation_date", explainVars: {}, hintKey: "dq_hint_stale_generic" };
    case "missing_cost_basis":
      return p.basis === "trades"
        ? { explainKey: "dq_explain_missing_cost_trades", explainVars: {}, hintKey: "dq_hint_missing_cost_trades" }
        : { explainKey: "dq_explain_missing_cost_price", explainVars: {}, hintKey: "dq_hint_missing_cost_price" };
    case "cash_balance_mismatch": {
      const currency = String(p.currency ?? "");
      return {
        explainKey: "dq_explain_cash_mismatch",
        explainVars: { current: formatMoney(Number(p.current), currency), recorded: formatMoney(Number(p.recorded), currency), date: p.date },
        hintKey: "dq_hint_cash_mismatch",
      };
    }
    case "zero_value":
      return { explainKey: "dq_explain_zero_value", explainVars: {}, hintKey: "dq_hint_zero_value" };
    case "pe_overdue_call":
      return { explainKey: "dq_explain_pe_overdue", explainVars: { count: p.count, date: p.date }, hintKey: "dq_hint_pe_overdue" };
    case "duplicate_suspect":
      return { explainKey: "dq_explain_duplicate", explainVars: { count: p.count }, hintKey: "dq_hint_duplicate" };
  }
}

/** Where an issue's link goes: the asset page, or the data quality page for global issues. */
export function issueHref(issue: DataQualityIssue): string {
  return issue.assetId ? `/dashboard/assets/${encodeURIComponent(issue.assetId)}` : "/dashboard/data-quality";
}
