"use client";

import { useEffect, useId, useState } from "react";
import { onQuickAction } from "@/lib/command-menu-events";
import { CheckCircle2, FileSpreadsheet } from "lucide-react";
import { CsvColumnMapper } from "@/components/csv-column-mapper";
import { CsvDropzone, type ParsedCsvFile } from "@/components/csv-dropzone";
import { useTierMotion } from "@/components/tier-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";
import { tileEntranceStyle } from "@/lib/dashboard-tiers";

export type CsvTargetAccount = {
  id: string;
  name: string;
  currency: string;
  /** Balance in the account's own currency (anchors the import's running balance). */
  nativeValue: number;
};

/**
 * Standalone dashboard tile for the bank-history CSV import: pick a cash
 * account, drop a `.csv` or `.pdf` statement, map columns, import. Reuses `CsvDropzone` and
 * `CsvColumnMapper` (same flow as `CsvImportDialog`), inline instead of in a
 * dialog. Card chrome matches the other dashboard cards; the entrance follows
 * the active UI tier. `tileIndex` is its position in the dashboard's stagger.
 */
export function DashboardCsvCard({
  accounts,
  tileIndex = 0,
}: {
  accounts: CsvTargetAccount[];
  tileIndex?: number;
}) {
  const { t } = useLanguage();
  const motion = useTierMotion();
  const selectId = useId();
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

  function reset() {
    setFile(null);
    setImportedCount(null);
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
        ) : (
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
                onReset={reset}
                onSuccess={setImportedCount}
              />
            ) : (
              <CsvDropzone onParsed={setFile} currency={account.currency} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
