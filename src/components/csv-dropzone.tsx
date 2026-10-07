"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";
import { parseCsv } from "@/lib/csv-parser";
import { PdfPasswordPrompt } from "@/components/pdf-password-prompt";
import { PdfOcrPrompt } from "@/components/pdf-ocr-prompt";
import { readBankStatementPdf } from "@/app/dashboard/bank-pdf-actions";
import { statementAccountToCsvFile } from "@/lib/parsers/bank-pdf/bridge";
import { PDF_FAILURE_MESSAGE_KEYS, type PdfFailureCode, type PdfStatement } from "@/lib/parsers/bank-pdf";

export type ParsedCsvFile = {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
};

/**
 * Drag-and-drop / click-to-browse bank-statement picker (`.csv` or `.pdf`), styled after the
 * 21st.dev "File Upload Multi-File Dropzone" (ephraimduncan/file-upload-03, id 18111):
 * dashed zone that tints with a ring while dragging, a "Drag and drop or
 * <choose file>" line and a constraints note. Kept hand-rolled (no
 * `react-dropzone` dependency) and single-file, as the import is one statement.
 *
 * A CSV is read client-side (`lib/csv-parser.ts`). A PDF is sent to the
 * `readBankStatementPdf` server action (the PDF reader is a Node library; the file is not
 * stored), which returns the parsed transactions per account; the chosen account is turned
 * into the same `ParsedCsvFile` shape (Date / Description / Debit / Credit / Balance) so the
 * column mapper and the importers downstream are unchanged. A PDF holding several accounts
 * (Wio) or whose printed totals do not reconcile asks the user to confirm which account to
 * use. Unreadable, password-protected, scanned (OCR needed), image-only and unsupported PDFs
 * show a specific message. The file extension is checked on both the drop and picker paths
 * (the `accept` attribute doesn't constrain drag-drop).
 */
export function CsvDropzone({
  onParsed,
  disabled = false,
  currency,
}: {
  onParsed: (file: ParsedCsvFile) => void;
  disabled?: boolean;
  /** Currency of the account being imported into: picks the matching account of a multi-account PDF. */
  currency?: string;
}) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ statement: PdfStatement; fileName: string } | null>(null);
  /** A password-protected PDF waiting for its password (the File is kept so it can be re-sent with it). */
  const [locked, setLocked] = useState<{ file: File; incorrect: boolean } | null>(null);
  /** A scanned PDF waiting for the user's explicit OK to send it to the OCR provider (the File is kept to re-send with `ocr=1`). */
  const [ocrOffer, setOcrOffer] = useState<{ file: File; password?: string } | null>(null);
  /** The scanned-PDF message is showing and OCR is not configured on this server. */
  const [ocrMissing, setOcrMissing] = useState(false);

  const busy = disabled || isParsing;

  function chooseAccount(statement: PdfStatement, index: number, fileName: string) {
    setPending(null);
    onParsed(statementAccountToCsvFile(statement, index, fileName));
  }

  async function handlePdf(file: File, password?: string, ocr = false) {
    const form = new FormData();
    form.append("file", file);
    if (password) form.append("password", password);
    if (ocr) form.append("ocr", "1");
    const result = await readBankStatementPdf(form);
    setOcrOffer(null);
    setOcrMissing(false);
    if (!result.ok) {
      const code = result.failure.code;
      if (code === "encrypted" || code === "password_incorrect") {
        setLocked({ file, incorrect: code === "password_incorrect" });
        return;
      }
      setLocked(null);
      const ocrState = "ocr" in result.failure ? result.failure.ocr : undefined;
      if (ocrState === "available") {
        // Scanned PDF and OCR is possible: ask for consent instead of failing.
        setOcrOffer({ file, password });
        return;
      }
      if (ocrState === "unconfigured") setOcrMissing(true);
      const key = code in PDF_FAILURE_MESSAGE_KEYS ? PDF_FAILURE_MESSAGE_KEYS[code as PdfFailureCode] : "bank_pdf_error_unreadable";
      const detail = "detail" in result.failure ? result.failure.detail : undefined;
      setError(detail ? `${t(key)} [${detail}]` : t(key));
      return;
    }
    setLocked(null);
    const { statement } = result;
    const candidates = statement.accounts
      .map((account, index) => ({ account, index }))
      .filter(({ account }) => !currency || account.currency.toUpperCase() === currency.toUpperCase());
    const only = candidates.length === 1 ? candidates[0] : null;
    // An OCR read is never auto-continued: the user always confirms the account and checks the rows.
    if (statement.source !== "ocr" && statement.accounts.length === 1 && only && only.account.reconciliation.status === "ok") {
      chooseAccount(statement, only.index, file.name);
      return;
    }
    // Several accounts, a currency mismatch or totals that do not reconcile: let the user confirm.
    setPending({ statement, fileName: file.name });
  }

  async function handleFile(file: File) {
    setError(null);
    setPending(null);
    setLocked(null);
    setOcrOffer(null);
    setOcrMissing(false);
    const name = file.name.toLowerCase();
    const isPdf = name.endsWith(".pdf");
    if (!isPdf && !name.endsWith(".csv")) {
      setError(t("csv_dropzone_error_type"));
      return;
    }

    setIsParsing(true);
    try {
      if (isPdf) {
        await handlePdf(file);
        return;
      }
      const parsed = parseCsv(await file.text());
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError(t("csv_dropzone_error_empty"));
        return;
      }
      onParsed({ fileName: file.name, headers: parsed.headers, rows: parsed.rows });
    } catch {
      setError(t("csv_dropzone_error_read"));
    } finally {
      setIsParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function unlock(password: string) {
    if (!locked) return;
    setError(null);
    setIsParsing(true);
    try {
      await handlePdf(locked.file, password);
    } catch {
      setLocked(null);
      setError(t("csv_dropzone_error_read"));
    } finally {
      setIsParsing(false);
    }
  }

  async function confirmOcr() {
    if (!ocrOffer) return;
    const { file, password } = ocrOffer;
    setError(null);
    setIsParsing(true);
    try {
      await handlePdf(file, password, true);
    } catch {
      setOcrOffer(null);
      setError(t("csv_dropzone_error_read"));
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-disabled={busy}
        aria-label={`${t("csv_drag_or")} ${t("csv_choose_file")}`}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (busy) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && !busy) void handleFile(file);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed px-6 py-12 text-center transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          busy ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary/60 hover:bg-muted/60",
          isDragging ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "border-border bg-muted/40",
        )}
      >
        {isParsing ? (
          <Loader2 className="size-10 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
        ) : (
          <FileSpreadsheet className="size-10 text-muted-foreground/80" aria-hidden />
        )}
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {isParsing ? (
            t("csv_parsing")
          ) : (
            <>
              {t("csv_drag_or")}{" "}
              <span className="font-medium text-primary underline-offset-4 hover:underline">
                {t("csv_choose_file")}
              </span>
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("csv_dropzone_subtext")} · {t("csv_only_note")}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,.pdf,application/pdf"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      {locked && (
        <PdfPasswordPrompt
          fileName={locked.file.name}
          error={locked.incorrect}
          pending={isParsing}
          onSubmit={(password) => void unlock(password)}
          onCancel={() => setLocked(null)}
        />
      )}
      {ocrOffer && (
        <PdfOcrPrompt
          fileName={ocrOffer.file.name}
          pending={isParsing}
          onConfirm={() => void confirmOcr()}
          onCancel={() => setOcrOffer(null)}
        />
      )}
      {pending && (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3" role="group" aria-label={t("bank_pdf_choose_account")}>
          {pending.statement.source === "ocr" && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm font-medium text-foreground" role="status">
              {t("bank_pdf_ocr_verify")}
            </p>
          )}
          <p className="text-sm text-foreground">{t("bank_pdf_choose_account")}</p>
          <ul className="space-y-2">
            {pending.statement.accounts.map((account, index) => {
              const status = account.reconciliation.status;
              return (
                <li key={`${account.accountRef}-${index}`} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {account.accountRef ? `…${account.accountRef.slice(-4)} · ` : ""}
                    {account.currency} · {t("bank_pdf_tx_count", { n: account.transactions.length })} ·{" "}
                    <span className={status === "mismatch" ? "text-destructive" : undefined}>
                      {status === "ok"
                        ? t("bank_pdf_verified")
                        : status === "mismatch"
                          ? t("bank_pdf_mismatch")
                          : t("bank_pdf_unverified")}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={account.transactions.length === 0}
                    onClick={() => chooseAccount(pending.statement, index, pending.fileName)}
                  >
                    {t("bank_pdf_use_account")}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {error && ocrMissing && <p className="text-xs text-muted-foreground">{t("bank_pdf_ocr_keys_missing")}</p>}
    </div>
  );
}
