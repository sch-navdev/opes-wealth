/**
 * English texts of the exchange-rate status UI (`fxr_*`). The full 9-language set lives in
 * `tmp-i18n-fx.json` until it is merged into the i18n files; until a key is merged `t()` returns the
 * key itself and `useFxText` falls back to the English below.
 */
export const FXR_EN = {
  fxr_label: "Exchange rates",
  fxr_updated: "Exchange rates: updated {when} · {source} · {count} currencies",
  fxr_source_live: "live source",
  fxr_source_fallback: "static fallback",
  fxr_source_other: "{source}",
  fxr_state_fresh: "Up to date",
  fxr_state_stale: "Stale",
  fxr_state_fallback: "Approximate rates",
  fxr_state_missing: "No stored rates",
  fxr_no_run: "Exchange rates: no daily rate stored yet",
  fxr_history_unavailable: "History not available yet: past values are converted at today's rate.",
  fxr_refresh: "Refresh now",
  fxr_refreshing: "Refreshing...",
  fxr_refreshed: "Rates refreshed ({count} currencies).",
  fxr_err_signed_out: "Sign in to refresh the rates.",
  fxr_err_mfa: "Complete two-factor verification first.",
  fxr_err_demo: "The demo account is read-only.",
  fxr_err_rate_limited: "Rates were just refreshed. Wait a minute and try again.",
  fxr_err_unavailable: "Daily rates are not available yet on this database.",
  fxr_err_failed: "The rates could not be refreshed. Try again.",
} as const;

export type FxText = keyof typeof FXR_EN;
