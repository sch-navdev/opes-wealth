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
import { importBankTransactions } from "@/app/dashboard/transaction-import-actions";
import { readBankStatementPdf } from "@/app/dashboard/bank-pdf-actions";
import { rememberCashAccountBank } from "@/app/dashboard/banking/actions";
import {
  BANK_PROFILES,
  detectProfile,
  getBankProfile,
  parseStatement,
  routeGroup,
  type BankProfileId,
  type RoutableAccount,
  type StatementGroup,
  type StatementParseResult,
} from "@/lib/banking/csv-profiles";
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

type GroupState = { target: string; remember: boolean };

/**
 * Multi-account bank statement import: drop a CSV from Wio, Emirates NBD,
 * ADCB, FAB, BoursoBank, Société Générale, BNP Paribas or Crédit Agricole →
 * the bank is detected (or chosen) → every account found in the file is routed
 * to its Cash account (saved account reference, else the one account known
 * for that bank + currency) → check the parsed preview → import. The bank
 * presets are best-effort (see `lib/banking/csv-profiles.ts`), hence the
 * preview and the manual bank override.
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
  const [isPending, startTransition] = useTransition();
  /** A password-protected PDF waiting for its password (the File is kept so it can be re-sent with it). */
  const [locked, setLocked] = useState<{ file: File; incorrect: boolean } | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  /** A scanned PDF waiting for the user's explicit OK to send it to the OCR provider. */
  const [ocrOffer, setOcrOffer] = useState<{ file: File; password?: string } | null>(null);
  const [ocrMissing, setOcrMissing] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
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
    setLocked(null);
    setUnlocking(false);
    setOcrOffer(null);
    setOcrMissing(false);
    setOcrRunning(false);
  }

  function applyProfile(content: string, id: BankProfileId) {
    setProfileId(id);
    const result = parseStatement(content, id);
    if ("error" in result) {
      setParsed(null);
      setParseError(result.error);
      setGroupState([]);
      return;
    }
    setParseError(null);
    setParsed(result);
    setGroupState(
      result.groups.map((g) => {
        const route = routeGroup(g, id, accounts);
        return { target: route.kind === "matched" ? route.assetId : NONE, remember: true };
      }),
    );
  }

  async function handlePdfFile(file: File, password?: string, ocr = false) {
    setFileName(file.name);
    setText("");
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
        setParseError(null);
        return;
      }
      setLocked(null);
      const ocrState = "ocr" in result.failure ? result.failure.ocr : undefined;
      if (ocrState === "available") {
        // Scanned PDF and OCR is possible: ask for consent instead of failing.
        setOcrOffer({ file, password });
        setParseError(null);
        return;
      }
      if (ocrState === "unconfigured") setOcrMissing(true);
      setParseError(t(code in PDF_FAILURE_MESSAGE_KEYS ? PDF_FAILURE_MESSAGE_KEYS[code as PdfFailureCode] : "bank_pdf_error_unreadable"));
      return;
    }
    setLocked(null);
    const statement = result.statement;
    const parsedPdf = statementToParseResult(statement);
    const id = parsedPdf.profile.id;
    setPdfStatement(statement);
    setProfileId(id);
    setDetection("found");
    setParseError(null);
    setParsed(parsedPdf);
    setGroupState(
      parsedPdf.groups.map((g) => {
        const route = routeGroup(g, id, accounts);
        return { target: route.kind === "matched" ? route.assetId : NONE, remember: true };
      }),
    );
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    reset();
    if (file.name.toLowerCase().endsWith(".pdf")) {
      await handlePdfFile(file);
      return;
    }
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    const found = detectProfile(content);
    if (!found) {
      setDetection("none");
      return;
    }
    setDetection(found.ambiguous ? "ambiguous" : "found");
    applyProfile(content, found.profile.id);
  }

  async function unlock(password: string) {
    if (!locked) return;
    setUnlocking(true);
    try {
      await handlePdfFile(locked.file, password);
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
      await handlePdfFile(file, password, true);
    } catch {
      setOcrOffer(null);
      setParseError(t("bank_pdf_error_unreadable"));
    } finally {
      setOcrRunning(false);
    }
  }

  function handleImport() {
    if (!parsed) return;
    startTransition(async () => {
      const out: { label: string; ok: boolean; text: string }[] = [];
      for (let i = 0; i < parsed.groups.length; i++) {
        const group = parsed.groups[i];
        const state = groupState[i];
        const label = group.accountRef || t("stmt_account_unnamed");
        if (!state || state.target === NONE) {
          out.push({ label, ok: false, text: t("stmt_skipped") });
          continue;
        }
        const account = accounts.find((a) => a.id === state.target);
        if (!account) continue;
        if (account.currency.toUpperCase() !== group.currency.toUpperCase()) {
          out.push({ label, ok: false, text: t("stmt_currency_mismatch", { file: group.currency, account: account.currency }) });
          continue;
        }
        const rows = toBalanceRows(group, account.nativeValue);
        const result = await importBankCsvHistory(account.id, rows);
        if (result?.error) {
          out.push({ label, ok: false, text: result.error });
          continue;
        }
        if (state.remember && profileId) {
          await rememberCashAccountBank(account.id, profileId, group.accountRef);
        }
        const tx = await importBankTransactions(
          account.id,
          group.rows.map((r) => ({ date: r.date, amount: r.amount, description: r.description })),
          pdfStatement ? "pdf_import" : "csv_import",
        );
        out.push({
          label,
          ok: true,
          text:
            "success" in tx
              ? t("stmt_imported_tx", {
                  n: rows.length,
                  account: account.name,
                  added: tx.inserted,
                  dup: tx.duplicates,
                })
              : t("stmt_imported", { n: rows.length, account: account.name }),
        });
      }
      setResults(out);
    });
  }

  const profile = profileId ? getBankProfile(profileId) : undefined;

  /** One group's rows, newest first, as drawer view-models. PDF imports carry the full parsed metadata (rows map 1:1 to the statement's transactions); CSV rows only have date / description / amount / balance. */
  function sheetRows(group: StatementGroup, groupIndex: number): TransactionDetail[] {
    const pdfTxs = pdfStatement?.accounts[groupIndex]?.transactions;
    return group.rows
      .map((r, j) => {
        const full = pdfTxs?.[j];
        return full
          ? detailFromFingerprint(full, { bankName: profile?.name })
          : detailFromNormalized(r, { currency: group.currency, bankName: profile?.name, accountRef: group.accountRef });
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  const importable = groupState.some((g) => g.target !== NONE);

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
              {text !== null && !pdfStatement && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">{t("stmt_bank")}</Label>
                  <Select
                    value={profileId || NONE}
                    onValueChange={(v) => v !== NONE && text && applyProfile(text, v as BankProfileId)}
                  >
                    <SelectTrigger className="h-8 w-56">
                      <SelectValue placeholder={t("stmt_choose_bank")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE} disabled>
                        {t("stmt_choose_bank")}
                      </SelectItem>
                      {BANK_PROFILES.filter((p) => !p.pdfOnly).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <InstitutionLogo kind="bank" id={p.id} name={p.name} />
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {detection === "found" && <Badge variant="outline">{t("stmt_detected")}</Badge>}
                </div>
              )}
            </div>

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
            {parseError && ocrMissing && <p className="text-xs text-muted-foreground">{t("bank_pdf_ocr_keys_missing")}</p>}
            {pdfStatement?.source === "ocr" && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm font-medium text-foreground" role="status">
                {t("bank_pdf_ocr_verify")}
              </p>
            )}

            {parsed &&
              parsed.groups.map((group, i) => {
                const state = groupState[i] ?? { target: NONE, remember: true };
                const rows = sheetRows(group, i);
                const visibleRows = expanded[i] ? rows : rows.slice(0, PREVIEW_ROWS);
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
                        <Select
                          value={state.target}
                          onValueChange={(v) =>
                            setGroupState((prev) => prev.map((s, j) => (j === i ? { ...s, target: v } : s)))
                          }
                        >
                          <SelectTrigger className="h-8 w-64">
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
                    <div className="overflow-x-auto border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-muted-foreground">{t("csv_parsed_date")}</TableHead>
                            <TableHead className="text-muted-foreground">{t("csv_parsed_description")}</TableHead>
                            <TableHead className="text-end text-muted-foreground">{t("dcc_amount")}</TableHead>
                            <TableHead className="text-end text-muted-foreground">{t("csv_parsed_balance")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleRows.map((r, k) => (
                            <TableRow key={k} className="cursor-pointer" onClick={() => setSheet({ group: i, index: k })}>
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
                              <TableCell className="max-w-56 truncate text-muted-foreground">{r.description || "—"}</TableCell>
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
                    {rows.length > PREVIEW_ROWS && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setExpanded((prev) => ({ ...prev, [i]: !prev[i] }))}
                      >
                        {expanded[i] ? t("txd_show_less") : t("txd_view_all", { n: rows.length })}
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
              <div className="flex justify-end">
                <Button type="button" onClick={handleImport} disabled={isPending || !importable}>
                  {isPending ? t("csv_importing") : t("stmt_import")}
                </Button>
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
