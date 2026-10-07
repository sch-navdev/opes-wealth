"use client";

import { Loader2, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";

/**
 * Consent card shown when an uploaded PDF has no text layer (a scan or an image). OCR sends the
 * file to a third party (Amazon Textract), so it only runs after the user confirms here, once
 * per upload. `onConfirm` re-submits the same file with explicit OCR consent.
 */
export function PdfOcrPrompt({
  fileName,
  pending,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div
      role="group"
      aria-label={t("bank_pdf_ocr_prompt_title")}
      className="space-y-3 rounded-md border border-border bg-muted/30 p-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ScanText className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t("bank_pdf_ocr_prompt_title")}</p>
          <p className="truncate text-xs text-muted-foreground" dir="auto">
            {fileName}
          </p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t("bank_pdf_ocr_prompt_body")}</p>
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        <Button type="button" size="sm" disabled={pending} onClick={onConfirm}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              {t("bank_pdf_ocr_confirming")}
            </>
          ) : (
            t("bank_pdf_ocr_confirm")
          )}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
          {t("bank_pdf_ocr_cancel")}
        </Button>
      </div>
    </div>
  );
}
