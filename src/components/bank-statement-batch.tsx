"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Pencil, ScanText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InstitutionLogo } from "@/components/institution-logo";
import { TransactionDetailsSheet } from "@/components/transaction-details-sheet";
import { detailFromFingerprint, detailFromNormalized, type TransactionDetail } from "@/lib/transaction-detail";
import { PdfPasswordPrompt } from "@/components/pdf-password-prompt";
import { useBatchText } from "@/components/batch-import-text";
import { useLanguage } from "@/context/language-context";
import { importBankCsvHistory } from "@/app/dashboard/actions";
import { readBankStatementPdf } from "@/app/dashboard/bank-pdf-actions";
import { createStatementCashAccount, markCashAccountClosed, mergeAccountRefs, recordBalanceSnapshots, recordStatementCoverage, rememberCashAccountBank } from "@/app/dashboard/banking/actions";
import { readSkippedAccounts, setAccountSkipped, skipKey } from "@/lib/banking/skipped-accounts";
import { findRolloverChains, type RefHistoryEntry } from "@/lib/banking/rollover";
import { checkExistingTransactions, importBankTransactions } from "@/app/dashboard/transaction-import-actions";
import {
  accountTail,
  detectProfile,
  getBankProfile,
  parseStatement,
  type BankProfileId,
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
} from "@/lib/banking/bank-picker";
import {
  MAX_STATEMENT_PDF_BYTES,
  NEW,
  NONE,
  chainBalanceRows,
  chronologicalOrder,
  classifyFile,
  estimateOcrPages,
  findBatchDuplicates,
  groupPeriod,
  initialGroupState,
  toImportTx,
  type BatchFileKind,
  type BatchGroupInput,
  type BatchStatus,
  type GroupState,
  type StatementTargetAccount,
} from "@/lib/banking/batch-import";
import { statementToParseResult } from "@/lib/parsers/bank-pdf/bridge";
import { PDF_FAILURE_MESSAGE_KEYS, type PdfFailureCode, type PdfStatement } from "@/lib/parsers/bank-pdf";
import type { ParsedBankCsvRow } from "@/lib/bank-csv";
import { identicalWithinList, occurrenceIndexes } from "@/lib/transaction-keys";
import { cn } from "@/lib/utils";
import type { BatchTextKey } from "@/components/batch-import-text";

const PREVIEW_ROWS = 8;

/** Duplicate check of one group against the stored transactions of its target account. */
type CheckState = { assetId: string; status: "loading" | "ready" | "unknown"; existing: boolean[] };

type BatchItem = {
  id: number;
  file: File;
  kind: BatchFileKind;
  status: BatchStatus;
  /** Why the file is not ready (translated), null otherwise. */
  message: string | null;
  incorrectPassword: boolean;
  unlocking: boolean;
  /** PDF page count when the reader reported it (scanned PDFs), for the OCR estimate. */
  pages?: number;
  ocrMissing: boolean;
  /** The current result was read by OCR (kept so a bank re-read keeps the consent the user gave). */
  ocrRead: boolean;
  text: string | null;
  parsed: StatementParseResult | null;
  pdfStatement: PdfStatement | null;
  profileId: BankProfileId | "";
  detectedId: BankProfileId | "";
  ambiguous: boolean;
  country: string;
  /** Masked OCR layout of a failed read (numbers and names hidden): shown for support, never sent anywhere. */
  layout: string | null;
  /** No bank layout recognised: the bank picker can fix it. */
  pickerFailure: boolean;
  rereading: boolean;
  groupState: GroupState[];
  checks: Record<number, CheckState>;
  /** Per group: the user's own ticks. Missing = the default (not stored yet, not repeated by an earlier file). */
  selection: Record<number, boolean[]>;
  expanded: Record<number, boolean>;
  /** Rows the user corrected by hand, keyed "group:row". */
  edited: Record<string, boolean>;
};

function newItem(file: File, id: number): BatchItem {
  const kind = classifyFile(file.name);
  return {
    id,
    file,
    kind,
    status: kind === "unsupported" ? "unsupported" : "queued",
    message: null,
    incorrectPassword: false,
    unlocking: false,
    ocrMissing: false,
    ocrRead: false,
    layout: null,
    text: null,
    parsed: null,
    pdfStatement: null,
    profileId: "",
    detectedId: "",
    ambiguous: false,
    country: "AE",
    pickerFailure: false,
    rereading: false,
    groupState: [],
    checks: {},
    selection: {},
    expanded: {},
    edited: {},
  };
}

type Line = { label: string; kind: "ok" | "skip" | "error"; text: string };
type FileResult = {
  id: number;
  name: string;
  imported: boolean;
  added: number;
  dup: number;
  skipped: number;
  errors: number;
  lines: Line[];
  reason?: string;
};

/** The three statuses a user can still act on (a password or the OCR consent). */
const ACTIONABLE: BatchStatus[] = ["needs_password", "needs_ocr"];

/**
 * Batch statement import: several PDF / CSV files at once. Each file is read INDEPENDENTLY and one at a time
 * (a PDF is its own server call, a CSV is parsed here), so one failure never blocks the rest. A scanned PDF is
 * only listed as "needs OCR": OCR (a third-party service) runs for all of them together after ONE explicit
 * consent. Everything is reviewed on one screen, grouped by file then by account group (same target dropdown,
 * duplicate check and row ticks as the single-file dialog), plus a WITHIN-BATCH duplicate check for repeated rows
 * and overlapping statements. Nothing is saved until Import, which runs oldest statement period first so the
 * balance history builds up in date order, and ends with a per-file summary.
 */
export function BankStatementBatch({
  files,
  dropped,
  total,
  accounts,
  onChooseOther,
  onDone,
}: {
  files: File[];
  /** Files beyond the cap that were left out. */
  dropped: number;
  /** How many files the user selected in all. */
  total: number;
  accounts: StatementTargetAccount[];
  onChooseOther: () => void;
  onDone: () => void;
}) {
  const { t, intlLocale } = useLanguage();
  const bt = useBatchText();
  const [items, setItems] = useState<BatchItem[]>(() => files.map((file, id) => newItem(file, id)));
  const [results, setResults] = useState<FileResult[] | null>(null);
  const [editing, setEditing] = useState<{ id: number; gi: number; j: number } | null>(null);
  /** The transaction details drawer: which file / group, and the position in that group's newest-first list. */
  const [sheet, setSheet] = useState<{ id: number; gi: number; index: number } | null>(null);

  /** One group's rows, newest first, as drawer view-models. PDF imports carry the full parsed metadata (rows map 1:1 to the statement's transactions); CSV rows only have date / description / amount / balance. */
  function sheetRows(it: BatchItem, group: StatementGroup, gi: number): TransactionDetail[] {
    const bankName = getBankProfile(it.profileId || "")?.name;
    const pdfTxs = it.pdfStatement?.accounts[gi]?.transactions;
    return group.rows
      .map((r, j) => {
        const full = pdfTxs?.[j];
        return full
          ? detailFromFingerprint(full, { bankName, sourceFile: it.file.name })
          : detailFromNormalized(r, { currency: group.currency, bankName, accountRef: group.accountRef, sourceFile: it.file.name });
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  const [ocrAsking, setOcrAsking] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [isPending, startTransition] = useTransition();
  const mounted = useRef(true);
  const started = useRef(false);
  const checkSeq = useRef(0);
  const checkLatest = useRef<Record<string, number>>({});
  /** Passwords live only in memory, per file, for the re-send after a bank change (never stored or shown). */
  const passwords = useRef(new Map<number, string>());

  function patch(id: number, p: Partial<BatchItem> | ((it: BatchItem) => Partial<BatchItem>)) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...(typeof p === "function" ? p(it) : p) } : it)));
  }

  // ---- duplicate check against the stored transactions (per file and group) ----

  async function runCheck(itemId: number, gi: number, group: StatementGroup, assetId: string) {
    const key = `${itemId}:${gi}`;
    const seq = ++checkSeq.current;
    checkLatest.current[key] = seq;
    const account = accounts.find((a) => a.id === assetId);
    if (!account || account.currency.toUpperCase() !== group.currency.toUpperCase()) {
      patch(itemId, (it) => ({ checks: omit(it.checks, gi) }));
      return;
    }
    patch(itemId, (it) => ({ checks: { ...it.checks, [gi]: { assetId, status: "loading", existing: [] } } }));
    let res: Awaited<ReturnType<typeof checkExistingTransactions>> | undefined;
    try {
      res = await checkExistingTransactions(assetId, toImportTx(group));
    } catch {
      res = undefined;
    }
    if (checkLatest.current[key] !== seq || !mounted.current) return;
    if (!res || "error" in res || res.existing.length !== group.rows.length) {
      patch(itemId, (it) => ({ checks: { ...it.checks, [gi]: { assetId, status: "unknown", existing: [] } } }));
      return;
    }
    const existing = res.existing;
    patch(itemId, (it) => ({ checks: { ...it.checks, [gi]: { assetId, status: "ready", existing } } }));
  }

  /** Stores a successful read and routes its groups (remembered account, else the only account in the currency) and starts their stored-duplicate checks. */
  function applyParsed(id: number, parsed: StatementParseResult, profileId: BankProfileId, extra: Partial<BatchItem>) {
    const skipped = readSkippedAccounts();
    const states = parsed.groups.map((g) => initialGroupState(g, profileId, accounts, skipped));
    patch(id, {
      ...extra,
      status: "ready",
      message: null,
      parsed,
      profileId,
      groupState: states,
      checks: {},
      selection: {},
      expanded: {},
      edited: {},
      incorrectPassword: false,
      pickerFailure: false,
      ocrMissing: false,
    });
    parsed.groups.forEach((g, gi) => {
      checkLatest.current[`${id}:${gi}`] = ++checkSeq.current;
      if (states[gi].target !== NONE) void runCheck(id, gi, g, states[gi].target);
    });
  }

  // ---- reading one file ----

  async function readPdf(id: number, file: File, opts: { password?: string; ocr?: boolean; bank?: string; quiet?: boolean } = {}) {
    const { password, ocr = false, bank, quiet = false } = opts;
    if (file.size > MAX_STATEMENT_PDF_BYTES) {
      patch(id, { status: "failed", message: t("bank_pdf_error_too_large"), unlocking: false, rereading: false });
      return;
    }
    // A password / bank re-read keeps the file's current card on screen; only a first read or OCR shows "Reading…".
    if (!quiet) patch(id, { status: "reading", message: null });
    const form = new FormData();
    form.append("file", file);
    if (password) form.append("password", password);
    if (ocr) form.append("ocr", "1");
    if (bank) form.append("bank", bank);
    let result: Awaited<ReturnType<typeof readBankStatementPdf>>;
    try {
      result = await readBankStatementPdf(form);
    } catch {
      if (mounted.current) {
        patch(id, { status: "failed", message: t("bank_pdf_error_unreadable"), unlocking: false, rereading: false });
      }
      return;
    }
    if (!mounted.current) return;
    if (password) passwords.current.set(id, password);
    if (!result.ok) {
      const f = result.failure;
      const base = { parsed: null, pdfStatement: null, groupState: [], checks: {}, selection: {}, unlocking: false, rereading: false, layout: null };
      if (f.code === "encrypted" || f.code === "password_incorrect") {
        patch(id, { ...base, status: "needs_password", incorrectPassword: f.code === "password_incorrect", message: null });
        return;
      }
      const ocrState = "ocr" in f ? f.ocr : undefined;
      if (ocrState === "available") {
        // Scanned PDF and OCR is possible: only listed, never read without the batch-level consent.
        patch(id, { ...base, status: "needs_ocr", message: null, pages: "pages" in f ? f.pages : undefined });
        return;
      }
      const message = t(f.code in PDF_FAILURE_MESSAGE_KEYS ? PDF_FAILURE_MESSAGE_KEYS[f.code as PdfFailureCode] : "bank_pdf_error_unreadable");
      const detail = "detail" in f ? f.detail : undefined;
      const status: BatchStatus =
        f.code === "unsupported" || (!!bank && f.code === "no_transactions")
          ? "unsupported"
          : f.code === "not_account_statement"
            ? "not_statement"
            : "failed";
      patch(id, {
        ...base,
        status,
        message: detail ? `${message} [${detail}]` : message,
        ocrMissing: ocrState === "unconfigured",
        layout: "layout" in f && typeof f.layout === "string" ? f.layout : null,
        // Only "no layout recognised" (or "recognised but empty" after a forced bank) can be helped by choosing a bank.
        pickerFailure: status === "unsupported",
        ...(bank ? { profileId: bank as BankProfileId, country: defaultCountry("pdf", bank, readStoredCountry()) } : {}),
      });
      return;
    }
    const statement = result.statement;
    const parsedPdf = statementToParseResult(statement);
    const pid = parsedPdf.profile.id as BankProfileId;
    applyParsed(id, parsedPdf, pid, {
      pdfStatement: statement,
      ocrRead: statement.source === "ocr",
      detectedId: bank ? "" : pid,
      country: defaultCountry("pdf", pid, readStoredCountry()),
      unlocking: false,
      rereading: false,
    });
  }

  /** CSV text → profile (detected, or the one the user chose) → groups. */
  function applyCsvText(id: number, content: string, forced?: BankProfileId) {
    const found = detectProfile(content);
    const pid = forced ?? found?.profile.id;
    const country = defaultCountry("csv", pid, readStoredCountry());
    if (!pid) {
      patch(id, { status: "unsupported", message: t("stmt_not_detected"), text: content, country, pickerFailure: true, parsed: null, groupState: [] });
      return;
    }
    const result = parseStatement(content, pid);
    if ("error" in result) {
      patch(id, { status: "failed", message: result.error, text: content, profileId: pid, country, pickerFailure: true, parsed: null, groupState: [] });
      return;
    }
    applyParsed(id, result, pid, {
      text: content,
      detectedId: forced ? "" : (found?.profile.id ?? ""),
      ambiguous: !forced && !!found?.ambiguous,
      country,
    });
  }

  async function readOne(id: number, file: File) {
    const kind = classifyFile(file.name);
    try {
      if (kind === "pdf") {
        await readPdf(id, file);
      } else if (kind === "csv") {
        patch(id, { status: "reading", message: null });
        applyCsvText(id, await file.text());
      }
    } catch {
      if (mounted.current) patch(id, { status: "failed", message: t("bank_pdf_error_unreadable") });
    }
  }

  // Files are read one at a time, in the order chosen; a failed file is only marked and the loop carries on.
  useEffect(() => {
    mounted.current = true;
    if (!started.current) {
      started.current = true;
      void (async () => {
        for (let id = 0; id < files.length; id++) {
          if (!mounted.current) return;
          if (classifyFile(files[id].name) === "unsupported") continue;
          await readOne(id, files[id]);
        }
      })();
    }
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for the files this batch was mounted with
  }, []);

  async function unlock(it: BatchItem, password: string) {
    patch(it.id, { unlocking: true });
    await readPdf(it.id, it.file, { password, quiet: true });
  }

  function removeFile(id: number) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    passwords.current.delete(id);
  }

  async function runOcr() {
    setOcrAsking(false);
    setOcrRunning(true);
    for (const it of items.filter((x) => x.status === "needs_ocr")) {
      if (!mounted.current) break;
      await readPdf(it.id, it.file, { password: passwords.current.get(it.id), ocr: true });
    }
    if (mounted.current) setOcrRunning(false);
  }

  function changeCountry(it: BatchItem, next: string) {
    patch(it.id, { country: next });
    writeStoredCountry(next);
  }

  /** Bank override of ONE file: CSV re-parses its text, PDF re-reads only that file forced to the bank. */
  async function changeBank(it: BatchItem, bankId: string) {
    const bank = banksForCountry(it.kind === "pdf" ? "pdf" : "csv", it.country).find((b) => b.id === bankId);
    if (!bank) return;
    writeStoredCountry(bank.country);
    if (it.kind === "csv") {
      if (it.text !== null) applyCsvText(it.id, it.text, bank.id);
      return;
    }
    if (it.kind !== "pdf" || !isPdfBankId(bankId) || (it.parsed && it.profileId === bankId)) return;
    patch(it.id, { rereading: true });
    await readPdf(it.id, it.file, { password: passwords.current.get(it.id), ocr: it.ocrRead, bank: bankId, quiet: true });
  }

  /** "Never import this account": remembered on this device, and immediately reflected in the group's state. */
  function setNeverImport(it: BatchItem, gi: number, group: StatementGroup, on: boolean) {
    const key = skipKey(it.profileId, group);
    if (key) setAccountSkipped(key, on);
    patch(it.id, (cur) => ({
      groupState: cur.groupState.map((s, j) => (j === gi ? { ...s, neverImport: on, skippedByPreference: on ? s.skippedByPreference : false } : s)),
    }));
  }

  /** Corrects one row by hand (the reader sometimes mis-splits a glued amount); the stored-duplicate check is re-run. */
  function saveRowEdit(it: BatchItem, gi: number, j: number, row: { date: string; description: string; amount: number }) {
    patch(it.id, (cur) => ({
      parsed: cur.parsed
        ? {
            ...cur.parsed,
            groups: cur.parsed.groups.map((g, k) =>
              k === gi ? { ...g, rows: g.rows.map((r, x) => (x === j ? { ...r, date: row.date, description: row.description, amount: row.amount } : r)) } : g,
            ),
          }
        : cur.parsed,
      edited: { ...cur.edited, [`${gi}:${j}`]: true },
    }));
    const state = stateOf(it, gi);
    const group = it.parsed?.groups[gi];
    if (group && state && state.target !== NONE && state.target !== NEW) {
      const next = { ...group, rows: group.rows.map((r, x) => (x === j ? { ...r, ...row } : r)) };
      void runCheck(it.id, gi, next, state.target);
    }
  }

  /** The user says this card / account replaces an existing one: pick it as the target and remember the replacement. */
  function markReplacement(it: BatchItem, gi: number, group: StatementGroup, accountId: string) {
    changeTarget(it, gi, group, accountId);
    patch(it.id, (cur) => ({ groupState: cur.groupState.map((s, j) => (j === gi ? { ...s, replacement: true } : s)) }));
  }

  function changeTarget(it: BatchItem, gi: number, group: StatementGroup, target: string) {
    const chain = mergedChain(`${it.id}:${gi}`);
    if (chain) {
      // All the groups of a renewed account follow the same choice, each with its own duplicate check.
      setChainTarget((prev) => ({ ...prev, [chain.id]: target }));
      for (const k of chain.keys) {
        const [fid, g] = k.split(":").map(Number);
        const other = items.find((i) => i.id === fid);
        const og = other?.parsed?.groups[g];
        if (!other || !og) continue;
        patch(fid, (cur) => ({ checks: target === NONE ? omit(cur.checks, g) : cur.checks, selection: omit(cur.selection, g) }));
        if (target !== NONE && target !== NEW) void runCheck(fid, g, og, target);
      }
      return;
    }
    patch(it.id, (cur) => ({
      groupState: cur.groupState.map((st, j) =>
        j === gi ? { ...st, target, autoPicked: false, ...(target !== NONE ? { skippedByPreference: false, neverImport: false } : {}) } : st,
      ),
      selection: omit(cur.selection, gi),
    }));
    if (target !== NONE) {
      const key = skipKey(it.profileId, group);
      if (key && it.groupState[gi]?.neverImport) setAccountSkipped(key, false);
    }
    if (target === NONE) {
      checkLatest.current[`${it.id}:${gi}`] = ++checkSeq.current;
      patch(it.id, (cur) => ({ checks: omit(cur.checks, gi) }));
      return;
    }
    void runCheck(it.id, gi, group, target);
  }

  // ---- plans: per group, what will happen on Import ----

  // ---- renewed accounts: a savings space closed and reopened under a new number is ONE account ----

  const chains = useMemo(() => {
    const members: { key: string; ref: string; name?: string; openedOn?: string; closedOn?: string }[] = [];
    for (const it of items) {
      if (it.status !== "ready" || !it.parsed) continue;
      it.parsed.groups.forEach((g, gi) =>
        members.push({ key: `${it.id}:${gi}`, ref: g.accountRef, name: g.accountName, openedOn: g.openedOn, closedOn: g.closedOn }),
      );
    }
    return findRolloverChains(members).map((c) => ({ ...c, id: c.keys[0] }));
  }, [items]);
  const [chainMerge, setChainMerge] = useState<Record<string, boolean>>({});
  const [chainTarget, setChainTarget] = useState<Record<string, string>>({});

  /** The renewed-account chain a group belongs to, unless the user chose to keep them separate. */
  function mergedChain(key: string) {
    const c = chains.find((x) => x.keys.includes(key));
    return c && (chainMerge[c.id] ?? true) ? c : undefined;
  }
  function derivedChainTarget(c: { keys: string[] }): string {
    let sawNew = false;
    for (const k of c.keys) {
      const [id, g] = k.split(":").map(Number);
      const st = items.find((i) => i.id === id)?.groupState[g];
      if (!st) continue;
      if (st.target !== NONE && st.target !== NEW) return st.target;
      if (st.target === NEW) sawNew = true;
    }
    return sawNew ? NEW : NONE;
  }
  /** A group's state; the groups of a renewed account share ONE target. */
  function stateOf(it: BatchItem, gi: number): GroupState {
    const own = it.groupState[gi] ?? { target: NONE, remember: true };
    const c = mergedChain(`${it.id}:${gi}`);
    if (!c) return own;
    return { ...own, target: chainTarget[c.id] ?? derivedChainTarget(c), autoPicked: false };
  }

  function newKeyOf(it: BatchItem, group: StatementGroup) {
    const gi = it.parsed ? it.parsed.groups.indexOf(group) : -1;
    const c = gi >= 0 ? mergedChain(`${it.id}:${gi}`) : undefined;
    if (c) return `new:chain:${c.id}`;
    return `new:${it.profileId}|${group.currency.toUpperCase()}|${group.accountRef}`;
  }
  /** Current-account layouts that do not print a product name: named "current account" so it is not mistaken for a card. */
  const CURRENT_ACCOUNT_PROFILES = new Set(["banque_populaire"]);
  function newAccountName(it: BatchItem, group: StatementGroup): string {
    const gi = it.parsed ? it.parsed.groups.indexOf(group) : -1;
    const c = gi >= 0 ? mergedChain(`${it.id}:${gi}`) : undefined;
    const ref = c ? c.refs[c.refs.length - 1] : group.accountRef;
    const tail = ref.replace(/[^0-9A-Za-z]/g, "").slice(-4);
    const product = c ? c.name : group.accountName ?? (CURRENT_ACCOUNT_PROFILES.has(it.profileId) ? "current account" : "");
    return [getBankProfile(it.profileId || "")?.name ?? "", product, group.currency, tail ? "···" + tail : ""].filter(Boolean).join(" ");
  }
  function targetKeyOf(it: BatchItem, group: StatementGroup, state: GroupState | undefined): string | null {
    if (!state || state.target === NONE) return null;
    if (state.target === NEW) return newKeyOf(it, group);
    const account = accounts.find((a) => a.id === state.target);
    return account && account.currency.toUpperCase() === group.currency.toUpperCase() ? account.id : null;
  }

  /** Within-batch duplicates and overlaps, recomputed whenever a target changes. */
  const batchChecks = useMemo(() => {
    const inputs: BatchGroupInput[] = [];
    for (const it of items) {
      if (it.status !== "ready" || !it.parsed) continue;
      it.parsed.groups.forEach((g, gi) => {
        const st = stateOf(it, gi);
        const target =
          !st || st.target === NONE
            ? null
            : st.target === NEW
              ? newKeyOf(it, g)
              : (() => {
                  const a = accounts.find((x) => x.id === st.target);
                  return a && a.currency.toUpperCase() === g.currency.toUpperCase() ? a.id : null;
                })();
        const period = groupPeriod(g);
        inputs.push({
          key: `${it.id}:${gi}`,
          fileId: it.id,
          fileName: it.file.name,
          targetKey: target,
          start: period?.start ?? null,
          end: period?.end ?? null,
          rows: toImportTx(g),
        });
      });
    }
    return findBatchDuplicates(inputs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, accounts, chains, chainMerge, chainTarget]);

  function groupPlan(it: BatchItem, group: StatementGroup, gi: number) {
    const state = stateOf(it, gi);
    const account =
      state.target === NONE
        ? undefined
        : state.target === NEW
          ? { id: NEW, name: newAccountName(it, group), currency: group.currency, nativeValue: 0 }
          : accounts.find((a) => a.id === state.target);
    const mismatch = !!account && account.currency.toUpperCase() !== group.currency.toUpperCase();
    const check = it.checks[gi];
    const flags = check?.status === "ready" ? check.existing : null;
    const bc = batchChecks.get(`${it.id}:${gi}`);
    const batchDup = bc?.duplicate ?? group.rows.map(() => false);
    const batchDupCount = batchDup.filter(Boolean).length;
    const alreadyCount = flags ? flags.filter(Boolean).length : 0;
    const fullyImported = !!flags && group.rows.length > 0 && alreadyCount === group.rows.length;
    const own = it.selection[gi];
    const isSelected = (j: number) => !fullyImported && (own ? (own[j] ?? true) : !(flags?.[j] ?? false) && !batchDup[j]);
    const selectedCount = group.rows.reduce((n, _r, j) => n + (isSelected(j) ? 1 : 0), 0);
    const routed = !!account && !mismatch;
    const balanceOnly = group.rows.length === 0 && (group.balances?.length ?? 0) > 0;
    return { state, account, mismatch, check, flags, batchDup, batchDupCount, overlapWith: bc?.overlapWith ?? [], alreadyCount, fullyImported, isSelected, selectedCount, routed, balanceOnly };
  }

  function setTicks(it: BatchItem, gi: number, values: boolean[]) {
    patch(it.id, (cur) => ({ selection: { ...cur.selection, [gi]: values } }));
  }

  // ---- import ----

  function handleImport() {
    startTransition(async () => {
      type Job = {
        it: BatchItem;
        group: StatementGroup;
        gi: number;
        plan: ReturnType<typeof groupPlan>;
        key: string;
        fileId: number;
        start: string | null;
        end: string | null;
      };
      const readyItems = items.filter((x) => x.status === "ready" && x.parsed);
      const byFile = new Map<number, FileResult>();
      for (const it of items) {
        byFile.set(it.id, { id: it.id, name: it.file.name, imported: false, added: 0, dup: 0, skipped: 0, errors: 0, lines: [] });
      }
      for (const it of items) {
        if (it.status === "ready") continue;
        const r = byFile.get(it.id);
        if (r) r.reason = it.message ? `${bt(statusKey(it.status))}: ${it.message}` : bt(statusKey(it.status));
      }

      const jobs: Job[] = [];
      for (const it of readyItems) {
        (it.parsed as StatementParseResult).groups.forEach((group, gi) => {
          const period = groupPeriod(group);
          jobs.push({ it, group, gi, plan: groupPlan(it, group, gi), key: `${it.id}:${gi}`, fileId: it.id, start: period?.start ?? null, end: period?.end ?? null });
        });
      }
      const ordered = chronologicalOrder(jobs);

      const push = (job: Job, line: Line, stats: Partial<Pick<FileResult, "added" | "dup" | "skipped" | "errors">> = {}) => {
        const r = byFile.get(job.fileId);
        if (!r) return;
        r.lines.push(line);
        r.imported = r.imported || line.kind === "ok";
        r.added += stats.added ?? 0;
        r.dup += stats.dup ?? 0;
        r.skipped += stats.skipped ?? 0;
        r.errors += stats.errors ?? 0;
        if (line.kind === "error" && !stats.errors) r.errors += 1;
      };

      // Groups that will really import: balance rows are chained per target account, newest statement ending on its current balance.
      const go = new Set<string>();
      const chainInput = new Map<string, { key: string; group: StatementGroup }[]>();
      const nativeOf = new Map<string, number>();
      for (const job of ordered) {
        const { plan, group } = job;
        const label = group.accountRef || t("stmt_account_unnamed");
        const line = (kind: Line["kind"], text: string): Line => ({ label, kind, text });
        if (job.it.groupState[job.gi] === undefined || plan.state.target === NONE) {
          push(job, line("skip", t("stmt_skipped")), { skipped: group.rows.length });
          continue;
        }
        if (!plan.account) continue;
        if (plan.mismatch) {
          push(job, line("error", t("stmt_currency_mismatch", { file: group.currency, account: plan.account.currency })));
          continue;
        }
        if (plan.fullyImported) {
          // Nothing new, but the statement still proves the account is open as of its end date.
          const through = group.periodEnd ?? groupPeriod(group)?.end;
          if (through && plan.state.target !== NEW) await recordStatementCoverage(plan.account.id, through);
          push(job, line("skip", t("stmt_result_all_imported")), { dup: group.rows.length });
          continue;
        }
        if (plan.selectedCount === 0 && !plan.balanceOnly) {
          push(job, line("skip", t("stmt_result_none_selected")), { ...unselectedStats(plan, group) });
          continue;
        }
        go.add(job.key);
        if (!plan.balanceOnly) {
          const target = targetKeyOf(job.it, group, plan.state) ?? plan.account.id;
          chainInput.set(target, [...(chainInput.get(target) ?? []), { key: job.key, group }]);
          nativeOf.set(target, plan.account.nativeValue);
        }
      }
      const balanceRows = new Map<string, ParsedBankCsvRow[]>();
      for (const [target, list] of chainInput) {
        for (const [k, rows] of chainBalanceRows(list, nativeOf.get(target) ?? 0)) balanceRows.set(k, rows);
      }

      const created = new Map<string, string>();
      // Numbers that belong to ONE account (renewed savings space, replaced card): written once per account at the end.
      const refEntries = new Map<string, RefHistoryEntry[]>();
      const addRefHistory = (accountId: string, job: { it: BatchItem; gi: number; group: StatementGroup; plan: ReturnType<typeof groupPlan> }) => {
        const g = job.group;
        if (!g.accountRef) return;
        const existingRef = accounts.find((a) => a.id === job.plan.state.target)?.accountRef;
        const differs = !!existingRef && accountTail(existingRef) !== accountTail(g.accountRef);
        if (!(mergedChain(`${job.it.id}:${job.gi}`) || job.plan.state.replacement || differs)) return;
        const period = groupPeriod(g);
        const list = refEntries.get(accountId) ?? [];
        list.push({ ref: g.accountRef, from: g.openedOn ?? period?.start ?? null, to: g.closedOn ?? g.periodEnd ?? period?.end ?? null });
        if (existingRef && differs) list.push({ ref: existingRef, from: null, to: null });
        refEntries.set(accountId, list);
      };
      // A closure only closes the account when nothing renewed it: in a renewed chain only the LAST account's closure counts.
      // The statement's period end proves the account is still reported on: dated as of it even with no transaction.
      const markCovered = async (accountId: string, group: StatementGroup) => {
        const through = group.periodEnd ?? groupPeriod(group)?.end;
        if (through) await recordStatementCoverage(accountId, through);
      };
      const closeIfDue = async (accountId: string, job: { it: BatchItem; gi: number; group: StatementGroup }) => {
        if (!job.group.closedOn) return;
        const chain = mergedChain(`${job.it.id}:${job.gi}`);
        if (chain && chain.keys[chain.keys.length - 1] !== `${job.it.id}:${job.gi}`) return;
        await markCashAccountClosed(accountId, job.group.closedOn);
      };
      for (const job of ordered) {
        if (!go.has(job.key)) continue;
        const { it, group, plan } = job;
        const label = group.accountRef || t("stmt_account_unnamed");
        const line = (kind: Line["kind"], text: string): Line => ({ label, kind, text });
        const source = it.pdfStatement ? "pdf_import" : "csv_import";
        const fileName = it.file.name;
        let account = plan.account as { id: string; name: string; currency: string; nativeValue: number };
        if (plan.state.target === NEW) {
          const nk = newKeyOf(it, group);
          let id = created.get(nk);
          if (!id) {
            const made = await createStatementCashAccount({
              name: account.name,
              currency: group.currency,
              bankProfile: it.profileId || "",
              institutionName: getBankProfile(it.profileId || "")?.name ?? "",
              accountRef: group.accountRef,
            });
            if (!made.ok) {
              push(job, line("error", t("stmt_result_create_failed", { error: made.error })));
              continue;
            }
            id = made.id;
            created.set(nk, id);
          }
          account = { ...account, id };
        }
        if (plan.balanceOnly) {
          const snap = await recordBalanceSnapshots(
            account.id,
            (group.balances ?? []).map((b) => ({ date: b.date, value: b.balance })),
            { source, fileName },
          );
          if (!snap.ok) {
            push(job, line("error", snap.error));
            continue;
          }
          if (it.profileId) await rememberCashAccountBank(account.id, it.profileId, group.accountRef);
          addRefHistory(account.id, job);
          await markCovered(account.id, group);
          await closeIfDue(account.id, job);
          push(job, line("ok", t("stmt_balance_recorded", { account: account.name, added: snap.added, skipped: snap.skipped })));
          continue;
        }
        // Balance history reflects the real account: it uses ALL parsed rows, never the ticks.
        const rows = balanceRows.get(job.key) ?? [];
        const history = await importBankCsvHistory(account.id, rows, { source, fileName });
        if (history?.error) {
          push(job, line("error", history.error));
          continue;
        }
        if (plan.state.remember && it.profileId) await rememberCashAccountBank(account.id, it.profileId, group.accountRef);
        addRefHistory(account.id, job);
        await markCovered(account.id, group);
        await closeIfDue(account.id, job);
        const all = toImportTx(group);
        const occurrences = occurrenceIndexes(all);
        const chosen = all.flatMap((tx, j) => (plan.isSelected(j) ? [{ ...tx, occurrence: occurrences[j] }] : []));
        const tx = await importBankTransactions(account.id, chosen, source, fileName);
        const un = unselectedStats(plan, group);
        if ("success" in tx) {
          push(
            job,
            line(
              "ok",
              t("stmt_imported_tx_sel", { n: rows.length, account: account.name, added: tx.inserted, dup: tx.duplicates + un.dup, skipped: un.skipped }),
            ),
            { added: tx.inserted, dup: tx.duplicates + un.dup, skipped: un.skipped },
          );
        } else {
          push(job, line("ok", t("stmt_imported", { n: rows.length, account: account.name })), { ...un, errors: 1 });
        }
      }
      for (const [accountId, entries] of refEntries) await mergeAccountRefs(accountId, entries);
      setResults(items.map((it) => byFile.get(it.id) as FileResult));
    });
  }

  /** Rows left out of the import: stored or repeated ones count as duplicates, the user's own unticks as skipped. */
  function unselectedStats(plan: ReturnType<typeof groupPlan>, group: StatementGroup) {
    let dup = 0;
    let skipped = 0;
    group.rows.forEach((_r, j) => {
      if (plan.isSelected(j)) return;
      if (plan.flags?.[j] || plan.batchDup[j]) dup++;
      else skipped++;
    });
    return { dup, skipped };
  }

  function statusKey(s: BatchStatus): BatchTextKey {
    return `batch_status_${s}` as BatchTextKey;
  }

  // ---- derived state ----

  const readyItems = items.filter((it) => it.status === "ready" && it.parsed);
  const reading = items.some((it) => it.status === "queued" || it.status === "reading");
  const doneReading = items.filter((it) => it.status !== "queued" && it.status !== "reading").length;
  const ocrItems = items.filter((it) => it.status === "needs_ocr");
  const ocrPages = estimateOcrPages(ocrItems);
  const pendingFiles = items.filter((it) => ACTIONABLE.includes(it.status)).length;
  const plansByItem = new Map(readyItems.map((it) => [it.id, (it.parsed as StatementParseResult).groups.map((g, gi) => groupPlan(it, g, gi))]));
  const allPlans = Array.from(plansByItem.values()).flat();
  const routed = allPlans.filter((pl) => pl.routed);
  const importCount = routed.reduce((n, pl) => n + (pl.balanceOnly ? 1 : pl.selectedCount), 0);
  const importFiles = readyItems.filter((it) => (plansByItem.get(it.id) ?? []).some((pl) => pl.routed && (pl.balanceOnly || pl.selectedCount > 0))).length;
  const checking = allPlans.some((pl) => pl.check?.status === "loading");
  // Groups quietly set to "Don't import" (not by the user's own "never import" choice) are named, never silently dropped.
  const leftOut = readyItems.flatMap((it) =>
    (it.parsed as StatementParseResult).groups.flatMap((g, gi) => {
      const pl = plansByItem.get(it.id)?.[gi];
      const has = g.rows.length > 0 || (g.balances?.length ?? 0) > 0;
      return pl && has && pl.state.target === NONE && !pl.state.neverImport && !pl.state.skippedByPreference ? [g.accountRef || t("stmt_account_unnamed")] : [];
    }),
  );
  const importDisabled = isPending || reading || ocrRunning || checking || importCount === 0;
  const importHint = isPending
    ? ""
    : reading || ocrRunning
      ? bt("batch_import_hint_reading")
      : checking
        ? t("stmt_checking")
        : routed.length === 0
          ? t("stmt_import_hint_no_account")
          : importCount === 0
            ? routed.every((pl) => pl.fullyImported)
              ? t("stmt_hint_all_imported")
              : t("stmt_hint_nothing_selected")
            : "";

  if (results) {
    const sum = results.reduce(
      (a, r) => ({ added: a.added + r.added, dup: a.dup + r.dup, skipped: a.skipped + r.skipped, errors: a.errors + r.errors }),
      { added: 0, dup: 0, skipped: 0, errors: 0 },
    );
    return (
      <div className="space-y-3" data-testid="batch-results">
        <p className="text-sm font-medium text-foreground">{bt("batch_result_total", { ...sum, files: results.filter((r) => r.imported).length })}</p>
        <ul className="space-y-3">
          {results.map((r) => (
            <li key={r.id} className="space-y-1 border border-border p-3 text-sm">
              <p className="truncate font-medium text-foreground" dir="auto">
                {r.name}
              </p>
              {r.reason ? (
                <p className="text-muted-foreground">{bt("batch_result_file_unread", { reason: r.reason })}</p>
              ) : (
                <p className={r.errors > 0 ? "text-destructive" : "text-success"}>
                  {bt("batch_result_file", { added: r.added, dup: r.dup, skipped: r.skipped, errors: r.errors })}
                </p>
              )}
              {r.lines.map((l, i) => (
                <p key={i} className={l.kind === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                  <span className="font-medium">{l.label}:</span> {l.text}
                </p>
              ))}
            </li>
          ))}
        </ul>
        <Button type="button" onClick={onDone}>
          {t("csv_done")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="batch-root">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{bt("batch_title_files", { n: items.length })}</p>
        <Button type="button" variant="outline" size="sm" onClick={onChooseOther} disabled={isPending}>
          {bt("batch_choose_other")}
        </Button>
      </div>
      {dropped > 0 && (
        <p className="text-xs text-destructive" role="alert">
          {bt("batch_cap_message", { max: files.length, total })}
        </p>
      )}
      {reading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
          {bt("batch_reading_progress", { done: doneReading, total: items.length })}
        </p>
      )}

      {ocrItems.length > 0 && !ocrAsking && (
        <Button type="button" variant="outline" size="sm" disabled={ocrRunning || reading} onClick={() => setOcrAsking(true)}>
          {ocrRunning ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <ScanText className="size-4" aria-hidden />}
          {ocrRunning ? bt("batch_ocr_running") : bt("batch_ocr_button", { files: ocrItems.length, pages: ocrPages })}
        </Button>
      )}
      {ocrAsking && (
        <div role="group" aria-label={bt("batch_ocr_consent_title")} className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ScanText className="size-4" aria-hidden />
            </span>
            <p className="text-sm font-medium text-foreground">{bt("batch_ocr_consent_title")}</p>
          </div>
          <p className="text-sm text-muted-foreground">{bt("batch_ocr_consent_body", { files: ocrItems.length, pages: ocrPages })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => void runOcr()}>
              {bt("batch_ocr_confirm", { files: ocrItems.length })}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOcrAsking(false)}>
              {bt("batch_ocr_cancel")}
            </Button>
          </div>
        </div>
      )}

      {chains.map((c) => (
        <div key={c.id} role="group" aria-label={c.name} className="space-y-2 rounded-md border border-border bg-muted/30 p-3" data-testid={`rollover-${c.id}`}>
          <p className="text-sm text-foreground">
            {bt("batch_rollover_q", { n: c.keys.length, name: c.name, refs: c.refs.map((r) => "···" + accountTail(r)).join(", ") })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={(chainMerge[c.id] ?? true) ? "default" : "outline"} aria-pressed={chainMerge[c.id] ?? true} onClick={() => setChainMerge((p) => ({ ...p, [c.id]: true }))}>
              {bt("batch_rollover_yes")}
            </Button>
            <Button type="button" size="sm" variant={(chainMerge[c.id] ?? true) ? "outline" : "default"} aria-pressed={!(chainMerge[c.id] ?? true)} onClick={() => setChainMerge((p) => ({ ...p, [c.id]: false }))}>
              {bt("batch_rollover_no")}
            </Button>
          </div>
        </div>
      ))}

      {items.map((it) => renderFile(it))}

      {readyItems.length > 1 && <p className="text-xs text-muted-foreground">{bt("batch_order_note")}</p>}
      {pendingFiles > 0 && <p className="text-xs text-muted-foreground">{bt("batch_pending_note", { n: pendingFiles })}</p>}

      {sheet &&
        (() => {
          const it = items.find((i) => i.id === sheet.id);
          const group = it?.parsed?.groups[sheet.gi];
          if (!it || !group) return null;
          return (
            <TransactionDetailsSheet
              transactions={sheetRows(it, group, sheet.gi)}
              index={sheet.index}
              onIndexChange={(next) => setSheet(next === null ? null : { ...sheet, index: next })}
            />
          );
        })()}

      {leftOut.length > 0 && !isPending && (
        <p className="text-xs text-muted-foreground" role="status">
          {bt("batch_left_out_note", { list: leftOut.join(", ") })}
        </p>
      )}

      <div className="flex flex-col items-end gap-1">
        <Button type="button" onClick={handleImport} disabled={importDisabled} aria-describedby={importDisabled && importHint ? "batch-import-hint" : undefined}>
          {isPending ? t("csv_importing") : importCount > 0 ? bt("batch_import_n", { n: importCount, files: importFiles }) : t("stmt_import")}
        </Button>
        {importDisabled && importHint && (
          <p id="batch-import-hint" className="text-xs text-muted-foreground" role="status">
            {importHint}
          </p>
        )}
      </div>
    </div>
  );

  // ---- rendering of one file ----

  function renderFile(it: BatchItem) {
    const profile = it.profileId ? getBankProfile(it.profileId) : undefined;
    const showPicker = it.parsed !== null || it.pickerFailure;
    const pickerKind = it.kind === "pdf" ? "pdf" : "csv";
    const pickerBanks = banksForCountry(pickerKind, it.country);
    const pickerProfile = profile && profile.country === it.country ? profile.id : "";
    const plans = plansByItem.get(it.id) ?? [];
    return (
      <section key={it.id} className="space-y-3 border border-border p-3" aria-label={it.file.name} data-testid={`batch-file-${it.id}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium text-foreground" dir="auto">
            {it.file.name}
          </p>
          <div className="flex items-center gap-2">
            <Badge variant={it.status === "failed" || it.status === "unsupported" || it.status === "not_statement" ? "destructive" : it.status === "ready" ? "default" : "outline"} data-testid={`batch-status-${it.id}`}>
              {it.status === "reading" && <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />}
              {bt(statusKey(it.status))}
            </Badge>
            <Button type="button" variant="ghost" size="xs" disabled={isPending} onClick={() => removeFile(it.id)} aria-label={`${bt("batch_remove_file")}: ${it.file.name}`}>
              {bt("batch_remove_file")}
            </Button>
          </div>
        </div>

        {it.kind === "unsupported" && <p className="text-xs text-muted-foreground">{bt("batch_unsupported_type")}</p>}
        {it.status === "needs_password" && (
          <PdfPasswordPrompt
            fileName={it.file.name}
            error={it.incorrectPassword}
            pending={it.unlocking}
            onSubmit={(password) => void unlock(it, password)}
            onCancel={() => removeFile(it.id)}
          />
        )}
        {it.status === "needs_ocr" && (
          <p className="text-xs text-muted-foreground">
            {t("bank_pdf_error_scanned")}
            {it.pages ? ` (${it.pages})` : ""}
          </p>
        )}
        {it.message && it.status !== "ready" && (
          <p className="text-sm text-destructive" role="alert">
            {it.message}
          </p>
        )}
        {it.ocrMissing && it.status !== "ready" && <p className="text-xs text-muted-foreground">{bt("batch_ocr_unconfigured")}</p>}
        {it.message && it.status !== "ready" && it.layout && <LayoutBox layout={it.layout} />}

        {showPicker && (
          <div className="space-y-1">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor={`batch-country-${it.id}`} className="text-xs text-muted-foreground">
                  {t("stmt_country")}
                </Label>
                <Select value={it.country} onValueChange={(v) => changeCountry(it, v)} disabled={it.rereading}>
                  <SelectTrigger id={`batch-country-${it.id}`} data-testid={`batch-country-${it.id}`} className="h-8 w-52">
                    <SelectValue placeholder={t("stmt_choose_country")} />
                  </SelectTrigger>
                  <SelectContent>
                    {countriesFor(pickerKind).map((code) => (
                      <SelectItem key={code} value={code}>
                        <span aria-hidden>{countryFlag(code)}</span>
                        {countryLabel(code, intlLocale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`batch-bank-${it.id}`} className="text-xs text-muted-foreground">
                  {t("stmt_bank")}
                </Label>
                <Select value={pickerProfile} onValueChange={(v) => void changeBank(it, v)} disabled={it.rereading}>
                  <SelectTrigger id={`batch-bank-${it.id}`} data-testid={`batch-bank-${it.id}`} className="h-8 w-64">
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
              {it.detectedId && it.detectedId === it.profileId && <Badge variant="outline">{t("stmt_detected")}</Badge>}
            </div>
            {it.rereading && (
              <p className="text-xs text-muted-foreground" role="status">
                {t("stmt_rereading")}
              </p>
            )}
          </div>
        )}
        {it.ambiguous && it.status === "ready" && <p className="text-xs text-muted-foreground">{t("stmt_ambiguous")}</p>}
        {it.pdfStatement?.source === "ocr" && it.status === "ready" && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm font-medium text-foreground" role="status">
            {t("bank_pdf_ocr_verify")}
          </p>
        )}

        {it.status === "ready" && it.parsed && it.parsed.groups.map((group, gi) => renderGroup(it, group, gi, plans[gi], profile?.name))}
      </section>
    );
  }

  function renderGroup(it: BatchItem, group: StatementGroup, gi: number, plan: ReturnType<typeof groupPlan>, bankName?: string) {
    const entries = group.rows.map((r, j) => ({ j, r })).sort((a, b) => b.r.date.localeCompare(a.r.date));
    const visible = it.expanded[gi] ? entries : entries.slice(0, PREVIEW_ROWS);
    const count = group.rows.length;
    const identical = identicalWithinList(toImportTx(group));
    const headerChecked: boolean | "indeterminate" = plan.selectedCount === 0 ? false : plan.selectedCount === count ? true : "indeterminate";
    const fmt = new Intl.NumberFormat(intlLocale, { style: "currency", currency: group.currency });
    const reconciliation = it.pdfStatement?.accounts[gi]?.reconciliation;
    const state = plan.state;
    const editedGroup = group.rows.some((_r, j) => it.edited[`${gi}:${j}`]);
    const editedOk =
      reconciliation && reconciliation.openingBalance !== null && reconciliation.closingBalance !== null
        ? Math.abs(reconciliation.openingBalance + group.rows.reduce((s, r) => s + r.amount, 0) - reconciliation.closingBalance) < 0.005
        : false;
    const defaults = group.rows.map((_r, j) => !(plan.flags?.[j] ?? false) && !plan.batchDup[j]);
    return (
      <div key={gi} className="space-y-2 border border-border p-3" data-testid={`batch-group-${it.id}-${gi}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">
            {bankName} · {group.accountRef || t("stmt_account_unnamed")} · {group.currency}{" "}
            <span className="font-normal text-muted-foreground">({t("stmt_rows", { n: count })})</span>
          </p>
          <Select value={state.target} onValueChange={(v) => changeTarget(it, gi, group, v)}>
            <SelectTrigger
              data-testid={`batch-target-${it.id}-${gi}`}
              className="h-8 w-64"
              aria-invalid={state.target === NONE && !state.neverImport && !state.skippedByPreference ? true : undefined}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("stmt_dont_import")}</SelectItem>
              <SelectItem value={NEW}>{t("stmt_create_account", { name: newAccountName(it, group) })}</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {state.target === NONE && !state.neverImport && !state.skippedByPreference && (
          <p className="text-xs text-destructive">{t("stmt_account_needed")}</p>
        )}
        {state.target === NEW && <p className="text-xs text-muted-foreground">{t("stmt_new_account_note")}</p>}
        {mergedChain(`${it.id}:${gi}`) && (
          <p className="text-xs text-muted-foreground">{bt("batch_rollover_note", { name: group.accountName ?? "" })}</p>
        )}
        {it.profileId.endsWith("_card") && state.target === NEW && group.accountRef && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{bt("batch_replace_hint", { ref: group.accountRef })}</span>
            {accounts
              .filter((a) => a.bankProfile === it.profileId && a.currency.toUpperCase() === group.currency.toUpperCase() && a.accountRef && accountTail(a.accountRef) !== accountTail(group.accountRef))
              .slice(0, 3)
              .map((a) => (
                <Button key={a.id} type="button" variant="outline" size="xs" onClick={() => markReplacement(it, gi, group, a.id)}>
                  {bt("batch_replace_yes", { name: a.name })}
                </Button>
              ))}
          </div>
        )}
        {state.replacement && <p className="text-xs text-muted-foreground">{bt("batch_replace_note")}</p>}
        {group.closedOn && <p className="text-xs text-muted-foreground">{bt("batch_closed_note", { date: group.closedOn })}</p>}
        {state.skippedByPreference && (
          <p className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs font-medium text-foreground" role="status">
            {bt("batch_skipped_pref")}
            <Button type="button" variant="outline" size="xs" onClick={() => changeTarget(it, gi, group, NEW)}>
              {bt("batch_change_pref")}
            </Button>
          </p>
        )}
        {state.target === NONE && !state.skippedByPreference && skipKey(it.profileId, group) && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={state.neverImport === true} onCheckedChange={(v) => setNeverImport(it, gi, group, v === true)} />
            {bt("batch_never_import")}
          </label>
        )}
        {plan.balanceOnly && group.balances && (
          <p className="text-xs text-muted-foreground" role="status">
            {t("stmt_balance_only", { balances: group.balances.map((b) => `${fmt.format(b.balance)} (${b.date})`).join(", ") })}
          </p>
        )}
        {state.autoPicked && state.target !== NONE && <p className="text-xs text-muted-foreground">{t("stmt_autopick_note", { currency: group.currency })}</p>}
        {plan.check?.status === "unknown" && <p className="text-xs text-muted-foreground">{t("stmt_check_unknown")}</p>}
        {plan.flags && plan.alreadyCount > 0 && (
          <p className="rounded-md border border-border bg-muted/40 p-2 text-xs font-medium text-foreground" role="status">
            {plan.fullyImported ? t("stmt_banner_all", { account: plan.account?.name ?? "" }) : t("stmt_banner_some", { n: plan.alreadyCount, total: count })}
          </p>
        )}
        {plan.batchDupCount > 0 && (
          <p className="rounded-md border border-border bg-muted/40 p-2 text-xs font-medium text-foreground" role="status">
            {bt("batch_dup_note", { n: plan.batchDupCount })}
          </p>
        )}
        {plan.overlapWith.length > 0 && <p className="text-xs text-muted-foreground">{bt("batch_overlap_note", { files: plan.overlapWith.join(", ") })}</p>}
        {reconciliation && !editedGroup && (
          <p className={reconciliation.status === "mismatch" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {reconciliation.status === "ok" ? t("bank_pdf_verified") : reconciliation.status === "mismatch" ? t("bank_pdf_mismatch") : t("bank_pdf_unverified")}
          </p>
        )}
        {reconciliation && editedGroup && reconciliation.openingBalance !== null && reconciliation.closingBalance !== null && (
          <p className={editedOk ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
            {editedOk ? bt("batch_edited_verified") : bt("batch_edited_mismatch")}
          </p>
        )}
        {state.target !== NONE && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={state.remember}
              onCheckedChange={(v) => patch(it.id, (cur) => ({ groupState: cur.groupState.map((s, j) => (j === gi ? { ...s, remember: v === true } : s)) }))}
            />
            {t("stmt_remember")}
          </label>
        )}
        {count > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2 border border-border bg-muted/40 px-3 py-2 text-xs">
              <span className={cn("font-medium tabular-nums", plan.selectedCount > 0 ? "text-foreground" : "text-muted-foreground")} aria-live="polite">
                {t("stmt_selected_count", { n: plan.selectedCount, total: count })}
              </span>
              <Button type="button" variant="ghost" size="xs" disabled={plan.fullyImported} onClick={() => setTicks(it, gi, group.rows.map(() => true))}>
                {t("stmt_sel_all")}
              </Button>
              <Button type="button" variant="ghost" size="xs" disabled={plan.fullyImported} onClick={() => setTicks(it, gi, group.rows.map(() => false))}>
                {t("stmt_sel_none")}
              </Button>
              <Button type="button" variant="ghost" size="xs" disabled={plan.fullyImported} onClick={() => setTicks(it, gi, defaults)}>
                {t("stmt_sel_new")}
              </Button>
            </div>
            <div className="max-h-[22rem] overflow-auto border border-border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={headerChecked}
                        disabled={plan.fullyImported}
                        aria-label={t("stmt_select_all_aria")}
                        onCheckedChange={() => setTicks(it, gi, group.rows.map(() => plan.selectedCount < count))}
                      />
                    </TableHead>
                    <TableHead className="text-muted-foreground">{t("csv_parsed_date")}</TableHead>
                    <TableHead className="text-muted-foreground">{t("csv_parsed_description")}</TableHead>
                    <TableHead className="text-end text-muted-foreground">{t("dcc_amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map(({ j, r }) =>
                    editing && editing.id === it.id && editing.gi === gi && editing.j === j ? (
                      <RowEditor
                        key={j}
                        row={r}
                        labels={{
                          date: bt("batch_edit_date"),
                          description: bt("batch_edit_description"),
                          amount: bt("batch_edit_amount"),
                          save: bt("batch_edit_save"),
                          cancel: bt("batch_edit_cancel"),
                        }}
                        onCancel={() => setEditing(null)}
                        onSave={(next) => {
                          saveRowEdit(it, gi, j, next);
                          setEditing(null);
                        }}
                      />
                    ) : (
                    <TableRow key={j}>
                      <TableCell className="w-8">
                        <Checkbox
                          checked={plan.isSelected(j)}
                          disabled={plan.fullyImported}
                          aria-label={`${it.file.name}: ${t("stmt_select_row", { date: r.date, description: r.description || "—" })}`}
                          onCheckedChange={(v) => {
                            const next = group.rows.map((_x, k) => plan.isSelected(k));
                            next[j] = v === true;
                            setTicks(it, gi, next);
                          }}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums text-foreground">
                        <button
                          type="button"
                          className="underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                          onClick={() => setSheet({ id: it.id, gi, index: entries.findIndex((e) => e.j === j) })}
                        >
                          {r.date}
                        </button>
                      </TableCell>
                      <TableCell className="max-w-56 text-muted-foreground">
                        <span className="block truncate">{r.description || "—"}</span>
                        {(plan.flags?.[j] || plan.batchDup[j] || identical[j] || it.edited[`${gi}:${j}`]) && (
                          <span className="mt-0.5 flex flex-wrap gap-1">
                            {it.edited[`${gi}:${j}`] && <Badge variant="secondary">{bt("batch_edited_badge")}</Badge>}
                            {plan.flags?.[j] && <Badge variant="outline">{t("stmt_already_badge")}</Badge>}
                            {plan.batchDup[j] && <Badge variant="outline">{bt("batch_dup_badge")}</Badge>}
                            {identical[j] && <Badge variant="secondary">{t("stmt_identical_badge")}</Badge>}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={r.amount < 0 ? "text-end tabular-nums text-destructive" : "text-end tabular-nums text-foreground"}>
                        {fmt.format(r.amount)}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="ms-1 align-middle"
                          disabled={plan.fullyImported}
                          aria-label={bt("batch_edit_row_aria", { date: r.date, description: r.description || "—" })}
                          title={bt("batch_edit_row")}
                          onClick={() => setEditing({ id: it.id, gi, j })}
                        >
                          <Pencil className="size-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </div>
            {entries.length > PREVIEW_ROWS && (
              <Button type="button" variant="ghost" size="xs" onClick={() => patch(it.id, (cur) => ({ expanded: { ...cur.expanded, [gi]: !cur.expanded[gi] } }))}>
                {it.expanded[gi] ? t("txd_show_less") : t("txd_view_all", { n: entries.length })}
              </Button>
            )}
          </>
        )}
      </div>
    );
  }
}

/** The masked OCR layout of a failed read, in a read-only box with a Copy button (for support). */
function LayoutBox({ layout }: { layout: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(layout);
      setCopied(true);
    } catch {
      // Clipboard blocked: select the text so Ctrl+C works.
      ref.current?.select();
    }
  }
  return (
    <details className="rounded-md border border-border p-2 text-sm">
      <summary className="cursor-pointer text-muted-foreground">{t("stmt_ocrlayout_summary")}</summary>
      <div className="mt-2 space-y-2">
        <p className="text-xs text-muted-foreground">{t("stmt_ocrlayout_explain")}</p>
        <textarea
          ref={ref}
          readOnly
          dir="ltr"
          rows={10}
          value={layout}
          aria-label={t("stmt_ocrlayout_summary")}
          className="w-full rounded-md border border-border bg-muted/30 p-2 font-mono text-xs text-foreground"
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
            {t("stmt_ocrlayout_copy")}
          </Button>
          {copied && (
            <span className="text-xs text-muted-foreground" role="status">
              {t("stmt_ocrlayout_copied")}
            </span>
          )}
        </div>
      </div>
    </details>
  );
}

/** Inline editor of one preview row: date, description and signed amount. */
function RowEditor({
  row,
  labels,
  onSave,
  onCancel,
}: {
  row: { date: string; description: string; amount: number };
  labels: { date: string; description: string; amount: string; save: string; cancel: string };
  onSave: (row: { date: string; description: string; amount: number }) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(row.date);
  const [description, setDescription] = useState(row.description);
  const [amount, setAmount] = useState(String(row.amount));
  const parsed = Number(amount.replace(",", "."));
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && amount.trim() !== "" && Number.isFinite(parsed);
  return (
    <TableRow>
      <TableCell colSpan={4}>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs text-muted-foreground">
            {labels.date}
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-40" />
          </label>
          <label className="grid min-w-40 flex-1 gap-1 text-xs text-muted-foreground">
            {labels.description}
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-8" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            {labels.amount}
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 w-40" />
          </label>
          <Button type="button" size="sm" disabled={!valid} onClick={() => onSave({ date, description: description.trim(), amount: Math.round(parsed * 100) / 100 })}>
            {labels.save}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {labels.cancel}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function omit<T>(record: Record<number, T>, key: number): Record<number, T> {
  const copy = { ...record };
  delete copy[key];
  return copy;
}
