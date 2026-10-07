"use client";

import { useState, useTransition } from "react";
import { useLanguage } from "@/context/language-context";
import { testOcrConnection, type OcrSelfTestActionResult } from "@/app/dashboard/settings/ocr-selftest-actions";

/** Settings: one-click OCR (AWS Textract) connectivity check. Shows only non-secret facts. */
export function OcrSelfTestButton() {
  const { t } = useLanguage();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<OcrSelfTestActionResult | null>(null);
  const [failed, setFailed] = useState(false);

  function run() {
    setFailed(false);
    startTransition(async () => {
      try {
        setResult(await testOcrConnection());
      } catch {
        setResult(null);
        setFailed(true);
      }
    });
  }

  return (
    <section aria-labelledby="ocrtest-title" className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 id="ocrtest-title" className="text-lg font-semibold tracking-tight text-foreground">
        {t("ocrtest_title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("ocrtest_hint")}</p>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        data-testid="ocrtest-run"
        className="mt-4 inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        {pending ? t("ocrtest_running") : t("ocrtest_button")}
      </button>

      <div role="status" aria-live="polite" data-testid="ocrtest-result" className="mt-3 text-sm">
        {failed && <p className="text-destructive">{t("ocrtest_failed")}</p>}
        {result && "unauthenticated" in result && <p className="text-destructive">{t("ocrtest_signin")}</p>}
        {result && !("unauthenticated" in result) && (
          <div className="space-y-1">
            <p className={result.ok ? "font-medium text-foreground" : "font-medium text-destructive"}>
              {result.ok ? t("ocrtest_ok", { region: result.region }) : t("ocrtest_error", { region: result.region })}
            </p>
            {!result.configured && <p className="text-muted-foreground">{t("ocrtest_not_configured")}</p>}
            {result.errorClass && (
              <p className="text-muted-foreground">{t("ocrtest_class", { value: result.errorClass })}</p>
            )}
            {result.httpStatus !== undefined && (
              <p className="text-muted-foreground">{t("ocrtest_status", { value: String(result.httpStatus) })}</p>
            )}
            {result.requestId && (
              <p className="break-all text-muted-foreground">{t("ocrtest_request", { value: result.requestId })}</p>
            )}
            {result.hint && <p className="text-muted-foreground">{result.hint}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
