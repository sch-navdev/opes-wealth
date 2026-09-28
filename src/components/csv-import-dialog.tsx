"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";
import { parseCsv } from "@/lib/csv-parser";
import {
  parseBankCsvRows,
  type BankCsvDateFormat,
} from "@/lib/bank-csv";
import { importBankCsvHistory } from "@/app/dashboard/actions";

type Stage = "drop" | "map" | "success";

const dateFormats: BankCsvDateFormat[] = ["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY"];

function guessColumn(headers: string[], keyword: string): string {
  return headers.find((h) => h.toLowerCase().includes(keyword)) ?? "";
}

export function CsvImportDialog({ assetId }: { assetId: string }) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("drop");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [dateColumn, setDateColumn] = useState("");
  const [balanceColumn, setBalanceColumn] = useState("");
  const [dateFormat, setDateFormat] = useState<BankCsvDateFormat>("YYYY-MM-DD");

  function resetState() {
    setStage("drop");
    setIsDragging(false);
    setFileName(null);
    setDropError(null);
    setImportError(null);
    setImportedCount(0);
    setHeaders([]);
    setRows([]);
    setDateColumn("");
    setBalanceColumn("");
    setDateFormat("YYYY-MM-DD");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetState();
  }

  async function handleFile(file: File) {
    setDropError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setDropError(t("csv_dropzone_error_type"));
      return;
    }

    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.rows.length === 0) {
      setDropError(t("csv_dropzone_error_empty"));
      return;
    }

    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setDateColumn(guessColumn(parsed.headers, "date"));
    setBalanceColumn(guessColumn(parsed.headers, "balance"));
    setStage("map");
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  const importResult = useMemo(() => {
    if (!dateColumn || !balanceColumn) return null;
    return parseBankCsvRows(rows, { dateColumn, balanceColumn, dateFormat });
  }, [rows, dateColumn, balanceColumn, dateFormat]);

  function handleImport() {
    if (!importResult || importResult.validRows.length === 0) return;
    setImportError(null);

    startTransition(async () => {
      const result = await importBankCsvHistory(assetId, importResult.validRows);
      if (result?.error) {
        setImportError(result.error);
        return;
      }
      setImportedCount(result?.imported ?? importResult.validRows.length);
      setStage("success");
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Upload className="size-4" />
          {t("import_bank_history")}
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {t("import_bank_history")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("import_bank_history_desc")}
          </DialogDescription>
        </DialogHeader>

        {stage === "drop" && (
          <div className="space-y-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors",
                isDragging && "border-primary bg-primary/5",
              )}
            >
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                {t("csv_dropzone_cta")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("csv_dropzone_subtext")}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            {dropError && (
              <p className="text-sm text-destructive" role="alert">
                {dropError}
              </p>
            )}
          </div>
        )}

        {stage === "map" && (
          <div className="space-y-4">
            <div
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
              style={{ animationFillMode: "backwards" }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {t("csv_selected_file")}
                  </p>
                  <p className="truncate text-sm text-foreground">{fileName}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("csv_choose_different_file")}
                onClick={resetState}
              >
                <X className="size-3.5" />
              </Button>
            </div>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-sm text-foreground">
                  {t("csv_map_columns")}
                </CardTitle>
                <CardDescription>{t("csv_map_columns_desc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    key: "date",
                    label: t("csv_date_column"),
                    value: dateColumn,
                    onChange: setDateColumn,
                    options: headers,
                  },
                  {
                    key: "balance",
                    label: t("csv_balance_column"),
                    value: balanceColumn,
                    onChange: setBalanceColumn,
                    options: headers,
                  },
                ].map((field, index) => (
                  <div
                    key={field.key}
                    className="space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
                    style={{
                      animationDelay: `${(index + 1) * 80}ms`,
                      animationFillMode: "backwards",
                    }}
                  >
                    <Label>{field.label}</Label>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t("csv_select_column")} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}

                <div
                  className="space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
                  style={{ animationDelay: "240ms", animationFillMode: "backwards" }}
                >
                  <Label>{t("csv_date_format")}</Label>
                  <Select
                    value={dateFormat}
                    onValueChange={(next) => setDateFormat(next as BankCsvDateFormat)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dateFormats.map((format) => (
                        <SelectItem key={format} value={format}>
                          {format}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={resetState}
                disabled={isPending}
              >
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
            </DialogFooter>
          </div>
        )}

        {stage === "success" && (
          <div className="space-y-4">
            <p className="text-sm text-success">
              {t("csv_import_success", { n: importedCount })}
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                {t("csv_done")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
