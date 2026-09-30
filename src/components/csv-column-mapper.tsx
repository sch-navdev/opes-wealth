"use client";

import { useMemo, useState, useTransition } from "react";
import { FileSpreadsheet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLanguage } from "@/context/language-context";
import {
  computeRunningBalance,
  parseBankCsvRows,
  parseTransactionRows,
  type BankCsvDateFormat,
  type ParsedBankCsvRow,
} from "@/lib/bank-csv";
import { importBankCsvHistory } from "@/app/dashboard/actions";
import type { ParsedCsvFile } from "@/components/csv-dropzone";

type Mode = "balance" | "transactions";
type AmountMode = "single" | "creditDebit";

const DATE_FORMATS: BankCsvDateFormat[] = ["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY"];
const NONE = "__none__";
const PREVIEW_ROWS = 3;

function guessColumn(headers: string[], keyword: string): string {
  return headers.find((h) => h.toLowerCase().includes(keyword)) ?? "";
}

function ColumnSelect({
  label,
  value,
  onChange,
  headers,
  disabled,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  headers: string[];
  disabled: boolean;
  optional?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value === "" && optional ? NONE : value}
        onValueChange={(next) => onChange(next === NONE ? "" : next)}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("csv_select_column")} />
        </SelectTrigger>
        <SelectContent>
          {optional && <SelectItem value={NONE}>{t("csv_column_none")}</SelectItem>}
          {headers.map((header) => (
            <SelectItem key={header} value={header}>
              {header}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Column-mapping step after `CsvDropzone` has parsed a file. Lets the user
 * map CSV headers onto the fields `importBankCsvHistory` understands (Date +
 * Running Balance, or Date + Amount/Credit/Debit with a derived starting
 * balance), shows the first few rows so the mapping can be sanity-checked,
 * and submits the validated `ParsedBankCsvRow[]`.
 *
 * The mapping is applied client-side (`lib/bank-csv.ts`) so per-row errors
 * are visible before committing; the server action takes the already
 * normalized rows rather than raw `FormData` + a mapping. Description is
 * optional and preview-only — `asset_history` has no column to store it.
 */
export function CsvColumnMapper({
  assetId,
  currentValue,
  currency,
  file,
  onReset,
  onSuccess,
}: {
  assetId: string;
  /** The asset's current balance — anchors a transactions-only import's starting balance so the derived running balance reconciles to what's on record. */
  currentValue: number;
  currency: string;
  file: ParsedCsvFile;
  onReset: () => void;
  onSuccess: (importedCount: number) => void;
}) {
  const { t } = useLanguage();
  const { headers, rows, fileName } = file;
  const [isPending, startTransition] = useTransition();
  const [importError, setImportError] = useState<string | null>(null);

  const [initial] = useState(() => {
    const balance = guessColumn(headers, "balance");
    const credit = guessColumn(headers, "credit");
    const debit = guessColumn(headers, "debit");
    const amount = guessColumn(headers, "amount");
    // No running-balance-looking column but something amount-like: default to
    // transactions mode rather than a Balance selector with nothing to pick.
    const transactional = !balance && (amount || (credit && debit));
    return {
      balance,
      credit,
      debit,
      amount,
      mode: (transactional ? "transactions" : "balance") as Mode,
      amountMode: (amount ? "single" : "creditDebit") as AmountMode,
    };
  });

  const [mode, setMode] = useState<Mode>(initial.mode);
  const [amountMode, setAmountMode] = useState<AmountMode>(initial.amountMode);
  const [dateColumn, setDateColumn] = useState(() => guessColumn(headers, "date"));
  const [balanceColumn, setBalanceColumn] = useState(initial.balance);
  const [amountColumn, setAmountColumn] = useState(initial.amount);
  const [creditColumn, setCreditColumn] = useState(initial.credit);
  const [debitColumn, setDebitColumn] = useState(initial.debit);
  const [descriptionColumn, setDescriptionColumn] = useState(() =>
    guessColumn(headers, "descr"),
  );
  const [dateFormat, setDateFormat] = useState<BankCsvDateFormat>("YYYY-MM-DD");
  const [startingBalance, setStartingBalance] = useState("");
  const [startingBalanceTouched, setStartingBalanceTouched] = useState(false);

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat("en-US", { style: "currency", currency }),
    [currency],
  );

  const balanceResult = useMemo(() => {
    if (mode !== "balance" || !dateColumn || !balanceColumn) return null;
    return parseBankCsvRows(rows, { dateColumn, balanceColumn, dateFormat });
  }, [mode, rows, dateColumn, balanceColumn, dateFormat]);

  const transactionResult = useMemo(() => {
    if (mode !== "transactions" || !dateColumn) return null;
    if (amountMode === "single") {
      if (!amountColumn) return null;
      return parseTransactionRows(rows, { dateColumn, dateFormat, amountMode, amountColumn });
    }
    if (!creditColumn || !debitColumn) return null;
    return parseTransactionRows(rows, { dateColumn, dateFormat, amountMode, creditColumn, debitColumn });
  }, [mode, rows, dateColumn, dateFormat, amountMode, amountColumn, creditColumn, debitColumn]);

  // Starting balance (immediately before the earliest transaction) is derived
  // by working back from today's known total, so the last computed point
  // reconciles to `currentValue`; editable in case the file isn't the
  // account's most recent activity.
  const derivedStartingBalance = useMemo(() => {
    if (!transactionResult) return null;
    const totalDelta = transactionResult.validRows.reduce((sum, r) => sum + r.amount, 0);
    return Math.round((currentValue - totalDelta) * 100) / 100;
  }, [transactionResult, currentValue]);

  const effectiveStartingBalance = startingBalanceTouched
    ? Number(startingBalance)
    : (derivedStartingBalance ?? 0);

  const transactionRows = useMemo(() => {
    if (!transactionResult || !Number.isFinite(effectiveStartingBalance)) return null;
    return computeRunningBalance(transactionResult.validRows, effectiveStartingBalance);
  }, [transactionResult, effectiveStartingBalance]);

  const importResult: {
    validRows: ParsedBankCsvRow[];
    errors: { rowIndex: number; message: string }[];
  } | null =
    mode === "balance"
      ? balanceResult
      : transactionResult && transactionRows
        ? { validRows: transactionRows, errors: transactionResult.errors }
        : null;

  const mappedColumns = [
    { label: t("csv_date_column"), column: dateColumn },
    ...(mode === "balance"
      ? [{ label: t("csv_balance_column"), column: balanceColumn }]
      : amountMode === "single"
        ? [{ label: t("csv_amount_column"), column: amountColumn }]
        : [
            { label: t("csv_credit_column"), column: creditColumn },
            { label: t("csv_debit_column"), column: debitColumn },
          ]),
    { label: t("csv_description_column"), column: descriptionColumn },
  ].filter((c) => c.column !== "");

  function handleImport() {
    if (!importResult || importResult.validRows.length === 0) return;
    setImportError(null);

    startTransition(async () => {
      const result = await importBankCsvHistory(assetId, importResult.validRows);
      if (result?.error) {
        setImportError(result.error);
        return;
      }
      onSuccess(result?.imported ?? importResult.validRows.length);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("csv_selected_file")}</p>
            <p className="truncate text-sm text-foreground">{fileName}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("csv_choose_different_file")}
          onClick={onReset}
          disabled={isPending}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <Tabs value={mode} onValueChange={(next) => setMode(next as Mode)}>
        <TabsList className="w-full">
          <TabsTrigger value="balance" className="flex-1" disabled={isPending}>
            {t("csv_mode_balance")}
          </TabsTrigger>
          <TabsTrigger value="transactions" className="flex-1" disabled={isPending}>
            {t("csv_mode_transactions")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-4 rounded-md border border-border bg-background p-4">
        <div>
          <p className="text-sm font-medium text-foreground">{t("csv_map_columns")}</p>
          <p className="text-sm text-muted-foreground">
            {mode === "balance"
              ? t("csv_map_columns_desc")
              : t("csv_map_columns_desc_transactions")}
          </p>
        </div>

        <ColumnSelect
          label={t("csv_date_column")}
          value={dateColumn}
          onChange={setDateColumn}
          headers={headers}
          disabled={isPending}
        />

        {mode === "balance" ? (
          <ColumnSelect
            label={t("csv_balance_column")}
            value={balanceColumn}
            onChange={setBalanceColumn}
            headers={headers}
            disabled={isPending}
          />
        ) : (
          <>
            <Tabs value={amountMode} onValueChange={(next) => setAmountMode(next as AmountMode)}>
              <TabsList className="w-full">
                <TabsTrigger value="single" className="flex-1" disabled={isPending}>
                  {t("csv_amount_mode_single")}
                </TabsTrigger>
                <TabsTrigger value="creditDebit" className="flex-1" disabled={isPending}>
                  {t("csv_amount_mode_credit_debit")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {amountMode === "single" ? (
              <ColumnSelect
                label={t("csv_amount_column")}
                value={amountColumn}
                onChange={setAmountColumn}
                headers={headers}
                disabled={isPending}
              />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <ColumnSelect
                  label={t("csv_credit_column")}
                  value={creditColumn}
                  onChange={setCreditColumn}
                  headers={headers}
                  disabled={isPending}
                />
                <ColumnSelect
                  label={t("csv_debit_column")}
                  value={debitColumn}
                  onChange={setDebitColumn}
                  headers={headers}
                  disabled={isPending}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>{t("csv_starting_balance")}</Label>
              <Input
                type="number"
                step="any"
                disabled={isPending}
                value={startingBalanceTouched ? startingBalance : (derivedStartingBalance ?? "")}
                onChange={(e) => {
                  setStartingBalanceTouched(true);
                  setStartingBalance(e.target.value);
                }}
              />
              <p className="text-xs text-muted-foreground">
                {t("csv_starting_balance_hint", {
                  value: currencyFormatter.format(currentValue),
                })}
              </p>
            </div>
          </>
        )}

        <ColumnSelect
          label={t("csv_description_column")}
          value={descriptionColumn}
          onChange={setDescriptionColumn}
          headers={headers}
          disabled={isPending}
          optional
        />

        <div className="space-y-2">
          <Label>{t("csv_date_format")}</Label>
          <Select
            value={dateFormat}
            onValueChange={(next) => setDateFormat(next as BankCsvDateFormat)}
            disabled={isPending}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMATS.map((format) => (
                <SelectItem key={format} value={format}>
                  {format}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {mappedColumns.length > 1 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">{t("csv_preview_title")}</p>
          <div className="overflow-x-auto rounded-md border border-border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  {mappedColumns.map(({ label, column }) => (
                    <TableHead key={label} className="text-muted-foreground">
                      {label}
                      <span className="block text-xs font-normal">{column}</span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                  <TableRow key={i}>
                    {mappedColumns.map(({ label, column }) => (
                      <TableCell key={label} className="max-w-40 truncate text-foreground">
                        {row[column] ?? ""}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {importResult && (
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">
            {t("csv_preview_rows", { n: importResult.validRows.length })}
          </p>
          {importResult.errors.length > 0 && (
            <p className="text-muted-foreground">
              {t("csv_row_errors", { n: importResult.errors.length })}
            </p>
          )}
          {importResult.validRows.length === 0 && (
            <p className="text-destructive" role="alert">
              {t("csv_no_valid_rows")}
            </p>
          )}
        </div>
      )}

      {importError && (
        <p className="text-sm text-destructive" role="alert">
          {importError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onReset} disabled={isPending}>
          {t("csv_cancel")}
        </Button>
        <Button
          type="button"
          onClick={handleImport}
          disabled={isPending || !importResult || importResult.validRows.length === 0}
        >
          {isPending
            ? t("csv_importing")
            : t("csv_import_button", { n: importResult?.validRows.length ?? 0 })}
        </Button>
      </div>
    </div>
  );
}
