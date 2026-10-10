"use client";

import { useEffect, useId, useRef, useState } from "react";
import { onQuickAction } from "@/lib/command-menu-events";
import { CheckCircle2, FileSpreadsheet } from "lucide-react";
import { BankStatementBatch } from "@/components/bank-statement-batch";
import { useBatchText } from "@/components/batch-import-text";
import { CsvColumnMapper } from "@/components/csv-column-mapper";
import { CsvDropzone, type ParsedCsvFile } from "@/components/csv-dropzone";
import { useTierMotion } from "@/components/tier-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";
import { MAX_BATCH_FILES, capFiles, type StatementTargetAccount } from "@/lib/banking/batch-import";
import { tileEntranceStyle } from "@/lib/dashboard-tiers";

export type CsvTargetAccount = StatementTargetAccount;

/**
 * Standalone dashboard tile for statement import. It is the SAME flow as the Banking page: one or several CSV / PDF
 * files (up to MAX_BATCH_FILES) go through the batch review (bank detection, account routing, duplicate checks,
 * renewed accounts, closed accounts, replaced cards...). A CSV whose layout no bank profile knows can still be
 * mapped by hand for one account ("Map the columns myself"), the original single-file flow. Card chrome matches the
 * other dashboard cards; the entrance follows the active UI tier. `tileIndex` is its position in the stagger.
 */
export function DashboardCsvCard({
  accounts,
  tileIndex = 0,
}: {
  accounts: CsvTargetAccount[];
  tileIndex?: number;
}) {
  const { t } = useLanguage();
  const bt = useBatchText();
  const motion = useTierMotion();
  const selectId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [batch, setBatch] = useState<{ files: File[]; dropped: number; total: number } | null>(null);
  const [manual, setManual] = useState(false);
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [file, setFile] = useState<ParsedCsvFile | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];

  // Command palette "Upload statement": bring this card into view and focus it.
  useEffect(
    () =>
      onQuickAction("upload-statement", () => {
        const el = document.getElementById("statement-import");
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
        el?.focus({ preventScroll: true });
      }),
    [],
  );

  function handleFiles(list: File[]) {
    if (list.length === 0) return;
    const { kept, dropped } = capFiles(list);
    setBatch({ files: kept, dropped, total: list.length });
  }

  function reset() {
    setBatch(null);
    setFile(null);
    setImportedCount(null);
    setManual(false);
  }

  const status =
    importedCount !== null
      ? t("dash_csv_status_done")
      : file
        ? t("dash_csv_status_ready", { name: file.fileName })
        : "";

  return (
    <Card
      id="statement-import"
      tabIndex={-1}
      className="outline-none animate-in fade-in slide-in-from-bottom-2 gap-4 border-border bg-card py-5 shadow-sm motion-reduce:animate-none"
      style={tileEntranceStyle(motion, tileIndex)}
    >
      <CardHeader className="gap-1 px-5">
        <CardTitle className="flex items-center gap-2 text-sm text-foreground">
          <FileSpreadsheet className="size-4 text-primary" aria-hidden />
          <span className="truncate">{t("dash_csv_title")}</span>
        </CardTitle>
        <CardDescription className="text-xs">
          {importedCount !== null ? t("csv_done") : file ? t("csv_step_map") : t("dash_csv_desc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        <p className="sr-only" role="status" aria-live="polite">
          {status}
        </p>
        {!account ? (
          <p className="text-sm text-muted-foreground">{t("dash_csv_no_accounts")}</p>
        ) : manual ? (
          <>
            {accounts.length > 1 && !file && importedCount === null && (
              <div className="space-y-1.5">
                <Label htmlFor={selectId} className="text-xs text-muted-foreground">
                  {t("dash_csv_account_label")}
                </Label>
                <select
                  id={selectId}
                  value={account.id}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {importedCount !== null ? (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm text-foreground">
                  <CheckCircle2 className="size-4 text-success" aria-hidden />
                  {t("csv_import_success", { n: importedCount })}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={reset}>
                  {t("dash_csv_import_another")}
                </Button>
              </div>
            ) : file ? (
              <CsvColumnMapper
                assetId={account.id}
                currentValue={account.nativeValue}
                currency={account.currency}
                file={file}
                onReset={() => setFile(null)}
                onSuccess={setImportedCount}
              />
            ) : (
              <>
                <CsvDropzone onParsed={setFile} currency={account.currency} />
                <Button type="button" variant="ghost" size="sm" onClick={reset}>
                  {bt("dash_csv_back_batch")}
                </Button>
              </>
            )}
          </>
        ) : batch ? (
          <BankStatementBatch
            key={batch.files.map((f) => f.name + f.size).join("|")}
            files={batch.files}
            dropped={batch.dropped}
            total={batch.total}
            accounts={accounts}
            onChooseOther={reset}
            onDone={reset}
          />
        ) : (
          <div
            className="space-y-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(Array.from(e.dataTransfer.files ?? []));
            }}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".csv,text/csv,text/plain,.pdf,application/pdf"
              className="hidden"
              data-testid="dashboard-statement-input"
              onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-4 py-10 text-center outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <FileSpreadsheet className="size-6 text-muted-foreground" aria-hidden />
              <span className="text-sm text-foreground">{t("stmt_choose_file")}</span>
              <span className="text-xs text-muted-foreground">{bt("batch_hint", { max: MAX_BATCH_FILES })}</span>
            </button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setManual(true)}>
              {bt("dash_csv_manual")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
