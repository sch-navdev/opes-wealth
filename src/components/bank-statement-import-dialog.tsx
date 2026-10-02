"use client";

import { useRef, useState, useTransition } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { computeRunningBalance, type ParsedBankCsvRow, type ParsedTransactionRow } from "@/lib/bank-csv";

const NONE = "__none__";
const PREVIEW_ROWS = 4;

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
  const [groupState, setGroupState] = useState<GroupState[]>([]);
  const [results, setResults] = useState<{ label: string; ok: boolean; text: string }[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setText(null);
    setFileName("");
    setProfileId("");
    setDetection(null);
    setParsed(null);
    setParseError(null);
    setGroupState([]);
    setResults(null);
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

  async function handleFile(file: File | undefined) {
    if (!file) return;
    reset();
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

        <p className="border border-border bg-muted/30 p-2 text-xs text-muted-foreground">{t("stmt_unverified_note")}</p>

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
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                {fileName || t("stmt_choose_file")}
              </Button>
              {text !== null && (
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
                      {BANK_PROFILES.map((p) => (
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
            {parseError && (
              <p className="text-sm text-destructive" role="alert">
                {parseError}
              </p>
            )}

            {parsed &&
              parsed.groups.map((group, i) => {
                const state = groupState[i] ?? { target: NONE, remember: true };
                const rows = [...group.rows].sort((a, b) => b.date.localeCompare(a.date));
                const fmt = new Intl.NumberFormat(intlLocale, { style: "currency", currency: group.currency });
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
                          {rows.slice(0, PREVIEW_ROWS).map((r, k) => (
                            <TableRow key={k}>
                              <TableCell className="tabular-nums text-foreground">{r.date}</TableCell>
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
                      <p className="text-xs text-muted-foreground">
                        {t("csv_parsed_preview_more", { n: rows.length - PREVIEW_ROWS })}
                      </p>
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
      </DialogContent>
    </Dialog>
  );
}
