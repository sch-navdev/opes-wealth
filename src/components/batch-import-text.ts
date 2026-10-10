"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import type { TranslationKey } from "@/lib/i18n";

/**
 * English texts of the multi-file statement import (`batch_*`) and of the Valuation Log source / file
 * name (`hist_*`). The full 9-language set lives in `tmp-i18n-batch.json` until it is merged into the
 * i18n files; until a key is merged `t()` returns the key itself and `useBatchText` falls back to the
 * English below, so the UI never shows raw keys (same pattern as `banking-text.ts`).
 */
export const BATCH_EN = {
  batch_hint: "Tip: you can select several CSV or PDF files at once (up to {max}). Each file is read on its own.",
  batch_title_files: "{n} files",
  batch_cap_message: "Only the first {max} files were kept ({total} selected).",
  batch_choose_other: "Choose other files",
  batch_reading_progress: "Reading file {done} of {total}…",
  batch_status_queued: "Queued",
  batch_status_reading: "Reading…",
  batch_status_ready: "Ready",
  batch_status_needs_password: "Needs password",
  batch_status_needs_ocr: "Needs OCR",
  batch_status_unsupported: "Unsupported",
  batch_status_not_statement: "Not an account statement",
  batch_status_failed: "Failed",
  batch_remove_file: "Remove",
  batch_unsupported_type: "This file type is not supported. Use a .csv or .pdf file.",
  batch_ocr_button: "Read {files} scanned PDF(s) with OCR (about {pages} pages)…",
  batch_ocr_consent_title: "Send scanned PDFs to OCR?",
  batch_ocr_consent_body:
    "These {files} PDF(s) have no text layer. Reading them sends the files to Amazon Textract, a third-party service, about {pages} pages in total, and may incur a cost. Nothing is sent unless you confirm.",
  batch_ocr_confirm: "Yes, read {files} file(s) with OCR",
  batch_ocr_cancel: "Not now",
  batch_ocr_running: "Reading with OCR…",
  batch_ocr_unconfigured: "OCR is not set up on this server, so scanned PDFs cannot be read.",
  batch_dup_badge: "Also in an earlier file",
  batch_dup_note: "{n} row(s) repeat rows of an earlier statement in this batch and are unticked.",
  batch_overlap_note: "This statement's period overlaps with: {files}.",
  batch_order_note: "Files are imported oldest statement period first, so the balance history builds up in date order.",
  batch_pending_note: "{n} file(s) still need a password or OCR and will be left out.",
  batch_import_n: "Import {n} row(s) from {files} file(s)",
  batch_import_hint_reading: "Wait until every file has been read.",
  batch_result_file: "{added} added · {dup} duplicates · {skipped} skipped · {errors} errors",
  batch_result_file_unread: "Not imported: {reason}",
  batch_result_total: "Total: {added} added, {dup} duplicates, {skipped} skipped, {errors} errors across {files} file(s).",
  batch_never_import: "Never import this account (remember my choice)",
  batch_skipped_pref: "This account will not be imported, based on your preference.",
  batch_change_pref: "Change preference",
  batch_closed_note: "This account was closed on {date}. It will be marked as closed after the import (hidden on Banking, still viewable).",
  batch_edit_row: "Edit",
  batch_edit_row_aria: "Edit the row of {date}: {description}",
  batch_edit_save: "Save",
  batch_edit_cancel: "Cancel",
  batch_edit_date: "Date",
  batch_edit_description: "Description",
  batch_edit_amount: "Amount (negative = money out)",
  batch_edited_badge: "Edited",
  batch_edit_hint: "A wrongly read row can be corrected with Edit before importing.",
  batch_edited_verified: "Verified after your edits: opening balance + transactions = closing balance.",
  batch_edited_mismatch: "After your edits the totals still do not match the statement.",
  batch_rollover_q: "{n} accounts named “{name}” ({refs}) were closed and reopened on the same day. Is this one savings space renewed under a new number (for example to add the interest to the capital)?",
  batch_card_chain_q: "These cards ({refs}) are settled on the same account, so {current} replaces the older ones. All their statements go to ONE card account named after the most recent card, with the old numbers kept in its history. Correct?",
  batch_rollover_yes: "Yes, treat them as one account",
  batch_rollover_no: "No, keep them separate",
  batch_rollover_note: "Part of the renewed account “{name}”: all its statements go to one account, with the old numbers kept in its history.",
  batch_replace_hint: "Card {ref} is new. Is it the replacement of an existing card?",
  batch_replace_yes: "Yes, replaces {name}",
  batch_replace_note: "Replacement card: the most recent statement date decides which card is current; the old card stays in this account's history.",
  batch_left_out_note: "Left out because the account is set to Don't import: {list}",
  hist_source_manual: "Manual entry",
  hist_source_csv_import: "CSV import",
  hist_source_pdf_import: "PDF statement import",
  hist_file_name: "File: {name}",
  hist_source_file: "Source file",
} as const;

export type BatchTextKey = keyof typeof BATCH_EN;

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  let out = text;
  if (vars) for (const [name, val] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(val));
  return out;
}

/** Translator for the multi-file import and the Valuation Log source labels; English fallback while i18n does not know a key. */
export function useBatchText(): (key: BatchTextKey, vars?: Vars) => string {
  const { t } = useLanguage();
  return useCallback(
    (key, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fill(BATCH_EN[key], vars) : translated;
    },
    [t],
  );
}

/** Label of an `asset_history.source` value (`hist_source_*`), or the raw value when there is no label for it. */
export function historySourceLabel(source: string, bt: (key: BatchTextKey) => string): string {
  if (source === "manual") return bt("hist_source_manual");
  if (source === "csv_import") return bt("hist_source_csv_import");
  if (source === "pdf_import") return bt("hist_source_pdf_import");
  return source;
}
