"use client";

import { useRef, useState, useTransition } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PdfPasswordPrompt } from "@/components/pdf-password-prompt";
import { PdfOcrPrompt } from "@/components/pdf-ocr-prompt";
import { InstitutionLogo } from "@/components/institution-logo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLanguage } from "@/context/language-context";
import { importBankCsvHistory } from "@/app/dashboard/actions";
import { checkExistingTransactions, importBankTransactions } from "@/app/dashboard/transaction-import-actions";
import { cn } from "@/lib/utils";
import { identicalWithinList, occurrenceIndexes } from "@/lib/transaction-keys";
import { readBankStatementPdf } from "@/app/dashboard/bank-pdf-actions";
import { rememberCashAccountBank } from "@/app/dashboard/banking/actions";
import {
  detectProfile,
  getBankProfile,
  parseStatement,
  routeGroup,
  type BankProfileId,
  type RoutableAccount,
  type StatementGroup,
  type StatementParseResult,
} from "@/lib/banking/csv-profiles";
import {
  banksForCountry,
  countriesFor,
  countryFlag,
  countryLabel,
  defaultCountry,
  isPdfBankId,
  readStoredCountry,
  writeStoredCountry,
  type StatementFileKind,
} from "@/lib/banking/bank-picker";
import { statementToParseResult } from "@/lib/parsers/bank-pdf/bridge";
import { PDF_FAILURE_MESSAGE_KEYS, type PdfFailureCode, type PdfStatement } from "@/lib/parsers/bank-pdf";
import { TransactionDetailsSheet } from "@/components/transaction-details-sheet";
import { detailFromFingerprint, detailFromNormalized, type TransactionDetail } from "@/lib/transaction-detail";
import { computeRunningBalance, type ParsedBankCsvRow, type ParsedTransactionRow } from "@/lib/bank-csv";

const NONE = "__none__";
const PREVIEW_ROWS = 8;

export type StatementTargetAccount = RoutableAccount & { nativeValue: number };

/** Rows → one balance point per day: the file's own running balance when every row has one, else derived from the amounts anchored on the account's current balance (same rule as the single-account CSV import). */
function toBalanceRows(group: StatementGroup, currentValue: number): ParsedBankCsvRow[] {
  const sorted = [...group.rows].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length > 0 && sorted.every((r) => r.balance !== null)) {
    const byDate = new Map<string, ParsedBankCsvRow>();
    for (const r of sorted) {
      // Later rows of the same day overwrite: the last balance is the day's closing balance.
      byDate.set(r.date, { recorded_date: r.date, value: r.balance as number, description: r.description || undefined });
    }
    return Array.from(byDate.values());
  }
  const transactions: ParsedTransactionRow[] = sorted.map((r) => ({
    recorded_date: r.date,
    amount: r.amount,
    description: r.description || undefined,
  }));
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  const starting = Math.round((currentValue - total) * 100) / 100;
  return computeRunningBalance(transactions, starting);
}

type GroupState = { target: string; remember: boolean; /** Pre-selected because it is the only Cash account in the group's currency. */ autoPicked?: boolean };

function without<T>(record: Record<number, T>, key: number): Record<number, T> {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

/** Duplicate check of one group against the stored transactions of its target account. */
type CheckState = { assetId: string; status: "loading" | "ready" | "unknown"; existing: boolean[] };

/** A group's rows as import / check payload (same order as the file, which is what the fingerprint occurrence numbering uses). */
function toImportTx(group: StatementGroup) {
  return group.rows.map((r) => ({ date: r.date, amount: r.amount, description: r.description }));
}

/**
 * Multi-account bank statement import: drop a CSV from Wio, Emirates NBD,
 * ADCB, FAB, BoursoBank, Société Générale, BNP Paribas or Crédit Agricole →
 * the bank is detected (or chosen) → every account found in the file is routed
 * to its Cash account (saved account reference, else the one account known
 * for that bank + currency) → check the parsed preview → import. The bank
 * presets are best-effort (see `lib/banking/csv-profiles.ts`), hence the
 * preview and the manual bank override.
 *
 * Bank picker (country, then bank): detection stays the default and the picker is
 * an override. CSV: choosing a bank re-parses the file text with that preset. PDF:
 * choosing a bank re-sends the SAME file to `readBankStatementPdf` with a `bank`
 * field that forces that bank's parser (the file, the password and, only when the
 * current result was OCR-read, the OCR consent are kept in memory for the re-send).
 * A PDF that failed to parse shows the picker only for the failures where a bank
 * choice can help (no recognised layout), never for scanned / password / OCR states.
 * Apart from the PDF-validated banks, the CSV presets are unverified; the
 * `stmt_unverified_note` above the picker says so for CSV files.
 */
export function BankStatementImportDialog({ accounts }: { accounts: StatementTargetAccount[] }) {
  const { t, intlLocale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [profileId, setProfileId] = useState<BankProfileId | "">("");
  const [detection, setDetection] = useState<"none" | "ambiguous" | "found" | null>(null);
  const [parsed, setParsed] = useState<StatementParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  /** Set when the file was a PDF: the parsed statement (with each account's reconciliation). */
  const [pdfStatement, setPdfStatement] = useState<PdfStatement | null>(null);
  const [groupState, setGroupState] = useState<GroupState[]>([]);
  const [results, setResults] = useState<{ label: string; ok: boolean; text: string }[] | null>(null);
  /** The preview row open in the details drawer (index into that group's newest-first list). */
  const [sheet, setSheet] = useState<{ group: number; index: number } | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  /** Per group: duplicate check result against the stored transactions of the target account. */
  const [checks, setChecks] = useState<Record<number, CheckState>>({});
  /** Per group: which rows (index into group.rows) are ticked. Missing = all ticked. */
  const [selection, setSelection] = useState<Record<number, boolean[]>>({});
  const checkSeq = useRef(0);
  const checkLatest = useRef<Record<number, number>>({});
  const [isPending, startTransition] = useTransition();
  /** A password-protected PDF waiting for its password (the File is kept so it can be re-sent with it). */
  const [locked, setLocked] = useState<{ file: File; incorrect: boolean } | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  /** A scanned PDF waiting for the user's explicit OK to send it to the OCR provider. */
  const [ocrOffer, setOcrOffer] = useState<{ file: File; password?: string } | null>(null);
  const [ocrMissing, setOcrMissing] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  /** Which pipeline the current file went through (decides which banks the picker offers). */
  const [kind, setKind] = useState<StatementFileKind | null>(null);
  /** Country step of the picker (preselected from the detected bank, else the remembered country, else the UAE). */
  const [country, setCountry] = useState("AE");
  /** The bank the fingerprint / header detection picked (the "Detected" badge shows while it is still the chosen one). */
  const [detectedId, setDetectedId] = useState<BankProfileId | "">("");
  /** The PDF last sent to the server, kept in memory so a bank choice can re-send it (password and OCR consent included). */
  const [pdfSource, setPdfSource] = useState<{ file: File; password?: string; ocr: boolean } | null>(null);
  /** The PDF has a text layer but no bank layout was recognised: the bank picker can fix it. */
  const [pickerFailure, setPickerFailure] = useState(false);
  const [rereading, setRereading] = useState(false);
  /** Masked OCR layout carried by a failed OCR read (digits and names hidden), shown for support. */
  const [ocrLayout, setOcrLayout] = useState<string | null>(null);
  const [layoutCopied, setLayoutCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const layoutRef = useRef<HTMLTextAreaElement>(null);

  async function copyLayout() {
    if (!ocrLayout) return;
    try {
      await navigator.clipboard.writeText(ocrLayout);
      setLayoutCopied(true);
    } catch {
      // Clipboard blocked: select the text so Ctrl+C works.
      layoutRef.current?.select();
    }
  }

  function reset() {
    setOcrLayout(null);
    setLayoutCopied(false);
    setText(null);
    setFileName("");
    setProfileId("");
    setDetection(null);
    setParsed(null);
    setParseError(null);
    setPdfStatement(null);
    setGroupState([]);
    setResults(null);
    setSheet(null);
    setExpanded({});
    setChecks({});
    setSelection({});
    checkLatest.current = {};
    setLocked(null);
    setUnlocking(false);
    setOcrOffer(null);
    setOcrMissing(false);
    setOcrRunning(false);
    setKind(null);
    setDetectedId("");
    setPdfSource(null);
    setPickerFailure(false);
    setRereading(false);
  }

  /** Initial target of a group: remembered route first, else the only Cash account in the group's currency (never a guess between several). */
  function initialGroupState(group: StatementGroup, id: BankProfileId): GroupState {
    const route = routeGroup(group, id, accounts);
    if (route.kind === "matched") return { target: route.assetId, remember: true };
    const sameCurrency = accounts.filter((a) => a.currency.toUpperCase() === group.currency.toUpperCase());
    if (sameCurrency.length === 1) return { target: sameCurrency[0].id, remember: true, autoPicked: true };
    return { target: NONE, remember: true };
  }

  /** Asks the server which of a group's rows are already stored for the account; stale answers (target changed meanwhile) are dropped. Failure = "unknown", never blocking. */
  async function runCheck(index: number, group: StatementGroup, assetId: string) {
    const seq = ++checkSeq.current;
    checkLatest.current[index] = seq;
    const account = accounts.find((a) => a.id === assetId);
    if (!account || account.currency.toUpperCase() !== group.currency.toUpperCase()) {
      setChecks((prev) => without(prev, index));
      return;
    }
    setChecks((prev) => ({ ...prev, [index]: { assetId, status: "loading", existing: [] } }));
    let res: Awaited<ReturnType<typeof checkExistingTransactions>> | undefined;
    try {
      res = await checkExistingTransactions(assetId, toImportTx(group));
    } catch {
      res = undefined;
    }
    if (checkLatest.current[index] !== seq) return;
    if (!res || "error" in res || res.existing.length !== group.rows.length) {
      setChecks((prev) => ({ ...prev, [index]: { assetId, status: "unknown", existing: [] } }));
      return;
    }
    const existing = res.existing;
    setChecks((prev) => ({ ...prev, [index]: { assetId, status: "ready", existing } }));
    // Rows already stored start unticked: they cannot be silently imported twice.
    setSelection((prev) => ({ ...prev, [index]: existing.map((e) => !e) }));
  }

  /** Sets the groups' initial targets and starts their duplicate checks. */
  function applyRouting(result: StatementParseResult, id: BankProfileId) {
    const states = result.groups.map((g) => initialGroupState(g, id));
    setGroupState(states);
    setChecks({});
    setSelection({});
    checkLatest.current = {};
    states.forEach((st, i) => {
      if (st.target !== NONE) void runCheck(i, result.groups[i], st.target);
    });
  }

  function changeTarget(index: number, group: StatementGroup, target: string) {
    setGroupState((prev) => prev.map((st, j) => (j === index ? { ...st, target, autoPicked: false } : st)));
    setSelection((prev) => without(prev, index));
    if (target === NONE) {
      checkLatest.current[index] = ++checkSeq.current;
      setChecks((prev) => without(prev, index));
      return;
    }
    void runCheck(index, group, target);
  }

  function applyProfile(content: string, id: BankProfileId) {
    setProfileId(id);
    const result = parseStatement(content, id);
    if ("error" in result) {
      setParsed(null);
      setParseError(result.error);
      setGroupState([]);
      setChecks({});
      setSelection({});
      checkLatest.current = {};
      return;
    }
    setParseError(null);
    setParsed(result);
    applyRouting(result, id);
  }

  async function handlePdfFile(file: File, opts: { password?: string; ocr?: boolean; bank?: string } = {}) {
    const { password, ocr = false, bank } = opts;
    setFileName(file.name);
    setPickerFailure(false);
    setOcrLayout(null);
    setLayoutCopied(false);
    const form = new FormData();
    form.append("file", file);
    if (password) form.append("password", password);
    if (ocr) form.append("ocr", "1");
    if (bank) form.append("bank", bank);
    const result = await readBankStatementPdf(form);
    setOcrOffer(null);
    setOcrMissing(false);
    setPdfSource({ file, password, ocr });
    if (!result.ok) {
      // A failed (re-)read leaves no stale preview behind.
      setParsed(null);
      setPdfStatement(null);
      setGroupState([]);
      setChecks({});
      setSelection({});
      checkLatest.current = {};
      const code = result.failure.code;
      if (code === "encrypted" || code === "password_incorrect") {
        setLocked({ file, incorrect: code === "password_incorrect" });
        setParseError(null);
        return;
      }
      setLocked(null);
      const ocrState = "ocr" in result.failure ? result.failure.ocr : undefined;
      if (ocrState === "available") {
        // Scanned PDF and OCR is possible: ask for consent instead of failing (no bank picker here).
        setOcrOffer({ file, password });
        setParseError(null);
        return;
      }
      if (ocrState === "unconfigured") setOcrMissing(true);
      // Only "no layout recognised" (or "layout recognised but empty" after a forced bank) can be helped by choosing a bank.
      if (code === "unsupported" || (bank && code === "no_transactions")) {
        setPickerFailure(true);
        if (bank) {
          setProfileId(bank as BankProfileId);
          setCountry((c) => defaultCountry("pdf", bank, c));
        }
      }
      const message = t(code in PDF_FAILURE_MESSAGE_KEYS ? PDF_FAILURE_MESSAGE_KEYS[code as PdfFailureCode] : "bank_pdf_error_unreadable");
      const detail = "detail" in result.failure ? result.failure.detail : undefined;
      setParseError(detail ? `${message} [${detail}]` : message);
      if ("layout" in result.failure && result.failure.layout) setOcrLayout(result.failure.layout);
      return;
    }
    setLocked(null);
    const statement = result.statement;
    const parsedPdf = statementToParseResult(statement);
    const id = parsedPdf.profile.id;
    // Re-send with OCR consent only when this result was itself OCR-read.
    setPdfSource({ file, password, ocr: statement.source === "ocr" });
    setPdfStatement(statement);
    setProfileId(id);
    setDetection("found");
    // A forced bank is the user's choice, not a detection.
    setDetectedId(bank ? "" : id);
    setCountry(defaultCountry("pdf", id, readStoredCountry()));
    setParseError(null);
    setParsed(parsedPdf);
    applyRouting(parsedPdf, id);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    reset();
    if (file.name.toLowerCase().endsWith(".pdf")) {
      setKind("pdf");
      setCountry(defaultCountry("pdf", null, readStoredCountry()));
      await handlePdfFile(file);
      return;
    }
    setKind("csv");
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    const found = detectProfile(content);
    setCountry(defaultCountry("csv", found?.profile.id, readStoredCountry()));
    if (!found) {
      setDetection("none");
      return;
    }
    setDetection(found.ambiguous ? "ambiguous" : "found");
    setDetectedId(found.profile.id);
    applyProfile(content, found.profile.id);
  }

  async function unlock(password: string) {
    if (!locked) return;
    setUnlocking(true);
    try {
      await handlePdfFile(locked.file, { password });
    } catch {
      setLocked(null);
      setParseError(t("bank_pdf_error_unreadable"));
    } finally {
      setUnlocking(false);
    }
  }

  async function confirmOcr() {
    if (!ocrOffer) return;
    const { file, password } = ocrOffer;
    setOcrRunning(true);
    try {
      await handlePdfFile(file, { password, ocr: true });
    } catch {
      setOcrOffer(null);
      setParseError(t("bank_pdf_error_unreadable"));
    } finally {
      setOcrRunning(false);
    }
  }

  function changeCountry(next: string) {
    setCountry(next);
    writeStoredCountry(next);
  }

  /** Bank step of the picker: CSV re-parses the text with that preset, PDF re-reads the same file forced to that bank. */
  async function changeBank(id: string) {
    const bank = banksForCountry(kind ?? "csv", country).find((b) => b.id === id);
    if (!bank) return;
    writeStoredCountry(bank.country);
    if (kind === "csv") {
      if (text) applyProfile(text, bank.id);
      return;
    }
    if (kind !== "pdf" || !pdfSource || !isPdfBankId(id) || (pdfStatement && profileId === id)) return;
    setRereading(true);
    try {
      await handlePdfFile(pdfSource.file, { password: pdfSource.password, ocr: pdfSource.ocr, bank: id });
    } catch {
      setParsed(null);
      setPdfStatement(null);
      setParseError(t("bank_pdf_error_unreadable"));
    } finally {
      setRereading(false);
    }
  }

  /** Everything the preview and the import need to know about one group's selection and duplicate check. */
  function groupPlan(group: StatementGroup, index: number) {
    const state = groupState[index] ?? { target: NONE, remember: true };
    const account = state.target === NONE ? undefined : accounts.find((a) => a.id === state.target);
    const mismatch = !!account && account.currency.toUpperCase() !== group.currency.toUpperCase();
    const check = checks[index];
    const flags = check?.status === "ready" ? check.existing : null;
    const alreadyCount = flags ? flags.filter(Boolean).length : 0;
    const fullyImported = !!flags && group.rows.length > 0 && alreadyCount === group.rows.length;
    const selected = selection[index] ?? group.rows.map(() => true);
    const isSelected = (j: number) => !fullyImported && (selected[j] ?? true);
    const selectedCount = group.rows.reduce((n, _r, j) => n + (isSelected(j) ? 1 : 0), 0);
    const routed = !!account && !mismatch;
    return { state, account, mismatch, check, flags, alreadyCount, fullyImported, isSelected, selectedCount, routed };
  }

  function setRowSelected(index: number, count: number, j: number, value: boolean) {
    setSelection((prev) => {
      const next = (prev[index] ?? Array.from({ length: count }, () => true)).slice();
      next[j] = value;
      return { ...prev, [index]: next };
    });
  }

  function setAllSelected(index: number, values: boolean[]) {
    setSelection((prev) => ({ ...prev, [index]: values }));
  }

  function handleImport() {
    if (!parsed) return;
    startTransition(async () => {
      const out: { label: string; ok: boolean; text: string }[] = [];
      for (let i = 0; i < parsed.groups.length; i++) {
        const group = parsed.groups[i];
        const plan = groupPlan(group, i);
        const state = plan.state;
        const label = group.accountRef || t("stmt_account_unnamed");
        if (!groupState[i] || state.target === NONE) {
          out.push({ label, ok: false, text: t("stmt_skipped") });
          continue;
        }
        const account = plan.account;
        if (!account) continue;
        if (plan.mismatch) {
          out.push({ label, ok: false, text: t("stmt_currency_mismatch", { file: group.currency, account: account.currency }) });
          continue;
        }
        if (plan.fullyImported) {
          out.push({ label, ok: false, text: t("stmt_result_all_imported") });
          continue;
        }
        if (plan.selectedCount === 0) {
          out.push({ label, ok: false, text: t("stmt_result_none_selected") });
          continue;
        }
        // Balance history reflects the real account: it always uses ALL parsed rows, never the selection.
        const rows = toBalanceRows(group, account.nativeValue);
        const result = await importBankCsvHistory(account.id, rows);
        if (result?.error) {
          out.push({ label, ok: false, text: result.error });
          continue;
        }
        if (state.remember && profileId) {
          await rememberCashAccountBank(account.id, profileId, group.accountRef);
        }
        // Only the ticked rows become transactions. Each keeps its occurrence number from the whole file,
        // so its fingerprint equals the one a full import (and the duplicate check) computes.
        const all = toImportTx(group);
        const occurrences = occurrenceIndexes(all);
        const chosen = all.flatMap((tx, j) => (plan.isSelected(j) ? [{ ...tx, occurrence: occurrences[j] }] : []));
        const tx = await importBankTransactions(account.id, chosen, pdfStatement ? "pdf_import" : "csv_import");
        let alreadyUnselected = 0;
        let skippedByYou = 0;
        all.forEach((_tx, j) => {
          if (plan.isSelected(j)) return;
          if (plan.flags?.[j]) alreadyUnselected++;
          else skippedByYou++;
        });
        out.push({
          label,
          ok: true,
          text:
            "success" in tx
              ? t("stmt_imported_tx_sel", {
                  n: rows.length,
                  account: account.name,
                  added: tx.inserted,
                  dup: tx.duplicates + alreadyUnselected,
                  skipped: skippedByYou,
                })
              : t("stmt_imported", { n: rows.length, account: account.name }),
        });
      }
      setResults(out);
    });
  }

  const profile = profileId ? getBankProfile(profileId) : undefined;

  /** One group's rows, newest first, as drawer view-models. PDF imports carry the full parsed metadata (rows map 1:1 to the statement's transactions); CSV rows only have date / description / amount / balance. */
  function sheetEntries(group: StatementGroup, groupIndex: number): { j: number; detail: TransactionDetail }[] {
    const pdfTxs = pdfStatement?.accounts[groupIndex]?.transactions;
    return group.rows
      .map((r, j) => {
        const full = pdfTxs?.[j];
        const detail = full
          ? detailFromFingerprint(full, { bankName: profile?.name })
          : detailFromNormalized(r, { currency: group.currency, bankName: profile?.name, accountRef: group.accountRef });
        return { j, detail };
      })
      .sort((a, b) => b.detail.date.localeCompare(a.detail.date));
  }
  function sheetRows(group: StatementGroup, groupIndex: number): TransactionDetail[] {
    return sheetEntries(group, groupIndex).map((e) => e.detail);
  }
  const plans = parsed ? parsed.groups.map((g, i) => groupPlan(g, i)) : [];
  const importable = groupState.some((g) => g.target !== NONE);
  const routedPlans = plans.filter((pl) => pl.routed);
  const importCount = routedPlans.reduce((n, pl) => n + pl.selectedCount, 0);
  const checking = plans.some((pl) => pl.check?.status === "loading");
  /** Why the Import button is disabled (shown beside it). */
  const importHint = isPending
    ? ""
    : checking
      ? t("stmt_checking")
      : !importable || routedPlans.length === 0
        ? t("stmt_import_hint_no_account")
        : importCount === 0
          ? routedPlans.every((pl) => pl.fullyImported)
            ? t("stmt_hint_all_imported")
            : t("stmt_hint_nothing_selected")
          : "";
  const importDisabled = isPending || checking || importCount === 0;
  /** CSV: always once a file is read. PDF: after a successful read, or when no layout was recognised. */
  const showPicker = kind === "csv" ? text !== null : kind === "pdf" ? !!pdfStatement || pickerFailure : false;
  const pickerBanks = kind ? banksForCountry(kind, country) : [];
  const pickerProfile = profile && profile.country === country ? profile.id : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <FileSpreadsheet className="size-4" />
          {t("stmt_open")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-background sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">{t("stmt_title")}</DialogTitle>
          <DialogDescription className="text-muted-foreground">{t("stmt_desc")}</DialogDescription>
        </DialogHeader>

        <p className="border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
          {pdfStatement ? t("bank_pdf_import_note") : t("stmt_unverified_note")}
        </p>

        {results ? (
          <div className="space-y-3">
            <ul className="space-y-2">
              {results.map((r, i) => (
                <li key={i} className={r.ok ? "text-sm text-success" : "text-sm text-muted-foreground"}>
                  <span className="font-medium">{r.label}:</span> {r.text}
                </li>
              ))}
            </ul>
            <Button type="button" onClick={() => setOpen(false)}>
              {t("csv_done")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv,text/plain,.pdf,application/pdf"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                {fileName || t("stmt_choose_file")}
              </Button>
            </div>

            {showPicker && kind && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="stmt-country" className="text-xs text-muted-foreground">
                      {t("stmt_country")}
                    </Label>
                    <Select value={country} onValueChange={changeCountry} disabled={rereading}>
                      <SelectTrigger id="stmt-country" data-testid="stmt-country-select" className="h-8 w-52">
                        <SelectValue placeholder={t("stmt_choose_country")} />
                      </SelectTrigger>
                      <SelectContent>
                        {countriesFor(kind).map((code) => (
                          <SelectItem key={code} value={code}>
                            <span aria-hidden>{countryFlag(code)}</span>
                            {countryLabel(code, intlLocale)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="stmt-bank" className="text-xs text-muted-foreground">
                      {t("stmt_bank")}
                    </Label>
                    <Select value={pickerProfile} onValueChange={(v) => void changeBank(v)} disabled={rereading}>
                      <SelectTrigger id="stmt-bank" data-testid="stmt-bank-select" className="h-8 w-64">
                        <SelectValue placeholder={t("stmt_choose_bank")} />
                      </SelectTrigger>
                      <SelectContent>
                        {pickerBanks.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <InstitutionLogo kind="bank" id={p.id} name={p.name} />
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {detectedId && detectedId === profileId && <Badge variant="outline">{t("stmt_detected")}</Badge>}
                </div>
                {kind === "pdf" && (
                  <p className="text-xs text-muted-foreground" role={rereading ? "status" : undefined}>
                    {rereading ? t("stmt_rereading") : pdfStatement ? t("stmt_pdf_bank_hint") : t("stmt_pdf_unsupported_hint")}
                  </p>
                )}
              </div>
            )}

            {detection === "none" && (
              <p className="text-sm text-muted-foreground">{t("stmt_not_detected")}</p>
            )}
            {detection === "ambiguous" && (
              <p className="text-sm text-muted-foreground">{t("stmt_ambiguous")}</p>
            )}
            {locked && (
              <PdfPasswordPrompt
                fileName={locked.file.name}
                error={locked.incorrect}
                pending={unlocking}
                onSubmit={(password) => void unlock(password)}
                onCancel={reset}
              />
            )}
            {ocrOffer && (
              <PdfOcrPrompt
                fileName={ocrOffer.file.name}
                pending={ocrRunning}
                onConfirm={() => void confirmOcr()}
                onCancel={reset}
              />
            )}
            {parseError && (
              <p className="text-sm text-destructive" role="alert">
                {parseError}
              </p>
            )}
            {parseError && ocrLayout && (
              <details className="rounded-md border border-border p-2 text-sm">
                <summary className="cursor-pointer text-muted-foreground">{t("stmt_ocrlayout_summary")}</summary>
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted-foreground">{t("stmt_ocrlayout_explain")}</p>
                  <textarea
                    ref={layoutRef}
                    readOnly
                    dir="ltr"
                    rows={10}
                    value={ocrLayout}
                    aria-label={t("stmt_ocrlayout_summary")}
                    className="w-full rounded-md border border-border bg-muted/30 p-2 font-mono text-xs text-foreground"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void copyLayout()}>
                      {t("stmt_ocrlayout_copy")}
                    </Button>
                    {layoutCopied && (
                      <span className="text-xs text-muted-foreground" role="status">
                        {t("stmt_ocrlayout_copied")}
                      </span>
                    )}
                  </div>
                </div>
              </details>
            )}
            {parseError && ocrMissing && <p className="text-xs text-muted-foreground">{t("bank_pdf_ocr_keys_missing")}</p>}
            {pdfStatement?.source === "ocr" && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm font-medium text-foreground" role="status">
                {t("bank_pdf_ocr_verify")}
              </p>
            )}

            {parsed &&
              parsed.groups.map((group, i) => {
                const plan = plans[i];
                const state = plan.state;
                const entries = sheetEntries(group, i);
                const visibleEntries = expanded[i] ? entries : entries.slice(0, PREVIEW_ROWS);
                const total = group.rows.length;
                const identical = identicalWithinList(toImportTx(group));
                const identicalCount = identical.filter(Boolean).length;
                const needsAccount = !importable && state.target === NONE;
                const headerChecked: boolean | "indeterminate" =
                  plan.selectedCount === 0 ? false : plan.selectedCount === total ? true : "indeterminate";
                const fmt = new Intl.NumberFormat(intlLocale, { style: "currency", currency: group.currency });
                const reconciliation = pdfStatement?.accounts[i]?.reconciliation;
                return (
                  <div key={i} className="space-y-2 border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {profile?.name} · {group.accountRef || t("stmt_account_unnamed")} · {group.currency}{" "}
                        <span className="font-normal text-muted-foreground">
                          ({t("stmt_rows", { n: group.rows.length })})
                        </span>
                      </p>
                      <div className="flex items-center gap-2">
                        <Select value={state.target} onValueChange={(v) => changeTarget(i, group, v)}>
                          <SelectTrigger
                            data-testid={`stmt-target-${i}`}
                            aria-invalid={needsAccount || undefined}
                            className={cn("h-8 w-64", needsAccount && "border-destructive ring-1 ring-destructive/40")}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>{t("stmt_dont_import")}</SelectItem>
                            {accounts.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name} ({a.currency})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {needsAccount && (
                      <p className="text-xs font-medium text-destructive">{t("stmt_account_needed")}</p>
                    )}
                    {state.autoPicked && state.target !== NONE && (
                      <p className="text-xs text-muted-foreground">{t("stmt_autopick_note", { currency: group.currency })}</p>
                    )}
                    {plan.check?.status === "unknown" && (
                      <p className="text-xs text-muted-foreground">{t("stmt_check_unknown")}</p>
                    )}
                    {plan.flags && plan.alreadyCount > 0 && (
                      <p className="rounded-md border border-border bg-muted/40 p-2 text-xs font-medium text-foreground" role="status">
                        {plan.fullyImported
                          ? t("stmt_banner_all", { account: plan.account?.name ?? "" })
                          : t("stmt_banner_some", { n: plan.alreadyCount, total })}
                      </p>
                    )}
                    {identicalCount > 0 && (
                      <p className="text-xs text-muted-foreground">{t("stmt_identical_warn", { n: identicalCount })}</p>
                    )}
                    {reconciliation && (
                      <p
                        className={
                          reconciliation.status === "mismatch" ? "text-xs text-destructive" : "text-xs text-muted-foreground"
                        }
                      >
                        {reconciliation.status === "ok"
                          ? t("bank_pdf_verified")
                          : reconciliation.status === "mismatch"
                            ? t("bank_pdf_mismatch")
                            : t("bank_pdf_unverified")}
                      </p>
                    )}
                    {state.target !== NONE && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={state.remember}
                          onCheckedChange={(v) =>
                            setGroupState((prev) => prev.map((s, j) => (j === i ? { ...s, remember: v === true } : s)))
                          }
                        />
                        {t("stmt_remember")}
                      </label>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground" aria-live="polite">
                        {t("stmt_selected_count", { n: plan.selectedCount, total })}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={plan.fullyImported}
                        onClick={() => setAllSelected(i, group.rows.map(() => true))}
                      >
                        {t("stmt_sel_all")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={plan.fullyImported}
                        onClick={() => setAllSelected(i, group.rows.map(() => false))}
                      >
                        {t("stmt_sel_none")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={plan.fullyImported || !plan.flags}
                        onClick={() => setAllSelected(i, group.rows.map((_r, j) => !plan.flags?.[j]))}
                      >
                        {t("stmt_sel_new")}
                      </Button>
                    </div>
                    <div className="overflow-x-auto border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8">
                              <Checkbox
                                checked={headerChecked}
                                disabled={plan.fullyImported}
                                aria-label={t("stmt_select_all_aria")}
                                onCheckedChange={() =>
                                  setAllSelected(i, group.rows.map(() => plan.selectedCount < total))
                                }
                              />
                            </TableHead>
                            <TableHead className="text-muted-foreground">{t("csv_parsed_date")}</TableHead>
                            <TableHead className="text-muted-foreground">{t("csv_parsed_description")}</TableHead>
                            <TableHead className="text-end text-muted-foreground">{t("dcc_amount")}</TableHead>
                            <TableHead className="text-end text-muted-foreground">{t("csv_parsed_balance")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleEntries.map(({ j, detail: r }, k) => (
                            <TableRow key={j} className="cursor-pointer" onClick={() => setSheet({ group: i, index: k })}>
                              <TableCell className="w-8" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={plan.isSelected(j)}
                                  disabled={plan.fullyImported}
                                  aria-label={t("stmt_select_row", { date: r.date, description: r.description || "—" })}
                                  onCheckedChange={(v) => setRowSelected(i, total, j, v === true)}
                                />
                              </TableCell>
                              <TableCell className="tabular-nums text-foreground">
                                <button
                                  type="button"
                                  className="underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSheet({ group: i, index: k });
                                  }}
                                >
                                  {r.date}
                                </button>
                              </TableCell>
                              <TableCell className="max-w-56 text-muted-foreground">
                                <span className="block truncate">{r.description || "—"}</span>
                                {(plan.flags?.[j] || identical[j]) && (
                                  <span className="mt-0.5 flex flex-wrap gap-1">
                                    {plan.flags?.[j] && <Badge variant="outline">{t("stmt_already_badge")}</Badge>}
                                    {identical[j] && <Badge variant="secondary">{t("stmt_identical_badge")}</Badge>}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className={r.amount < 0 ? "text-end tabular-nums text-destructive" : "text-end tabular-nums text-foreground"}>
                                {fmt.format(r.amount)}
                              </TableCell>
                              <TableCell className="text-end tabular-nums text-muted-foreground">
                                {r.balance != null ? fmt.format(r.balance) : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {total > plan.selectedCount && !plan.fullyImported && (
                      <p className="text-xs text-muted-foreground">{t("stmt_history_note")}</p>
                    )}
                    {entries.length > PREVIEW_ROWS && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setExpanded((prev) => ({ ...prev, [i]: !prev[i] }))}
                      >
                        {expanded[i] ? t("txd_show_less") : t("txd_view_all", { n: entries.length })}
                      </Button>
                    )}
                  </div>
                );
              })}

            {parsed && (parsed.errors.length > 0 || parsed.skipped > 0) && (
              <p className="text-xs text-muted-foreground">
                {t("stmt_row_notes", { errors: parsed.errors.length, skipped: parsed.skipped })}
                {parsed.errors[0] ? ` — ${parsed.errors[0].message}` : ""}
              </p>
            )}

            {parsed && (
              <div className="flex flex-col items-end gap-1">
                <Button
                  type="button"
                  onClick={handleImport}
                  disabled={importDisabled}
                  aria-describedby={importDisabled && importHint ? "stmt-import-hint" : undefined}
                >
                  {isPending ? t("csv_importing") : importCount > 0 ? t("stmt_import_n", { n: importCount }) : t("stmt_import")}
                </Button>
                {importDisabled && importHint && (
                  <p id="stmt-import-hint" className="text-xs text-muted-foreground" role="status">
                    {importHint}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {parsed && sheet && parsed.groups[sheet.group] && (
          <TransactionDetailsSheet
            transactions={sheetRows(parsed.groups[sheet.group], sheet.group)}
            index={sheet.index}
            onIndexChange={(next) => setSheet(next === null ? null : { group: sheet.group, index: next })}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
