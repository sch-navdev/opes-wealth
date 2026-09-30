"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useLanguage } from "@/context/language-context";
import { CsvDropzone, type ParsedCsvFile } from "@/components/csv-dropzone";
import { CsvColumnMapper } from "@/components/csv-column-mapper";

/**
 * Bank-history import flow, mounted on the asset detail page's Settings tab:
 * `CsvDropzone` (pick + parse headers) → `CsvColumnMapper` (map columns,
 * preview, submit to `importBankCsvHistory`) → success. Only owns the dialog
 * chrome and which stage is showing.
 */
export function CsvImportDialog({
  assetId,
  currentValue,
  currency,
}: {
  assetId: string;
  currentValue: number;
  currency: string;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<ParsedCsvFile | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  function reset() {
    setFile(null);
    setImportedCount(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Upload className="size-4" />
          {t("import_bank_history")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-background sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">{t("import_bank_history")}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("import_bank_history_desc")}
          </DialogDescription>
        </DialogHeader>

        {importedCount !== null ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              {t("csv_import_success", { n: importedCount })}
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                {t("csv_done")}
              </Button>
            </DialogFooter>
          </div>
        ) : file ? (
          <CsvColumnMapper
            assetId={assetId}
            currentValue={currentValue}
            currency={currency}
            file={file}
            onReset={reset}
            onSuccess={setImportedCount}
          />
        ) : (
          <CsvDropzone onParsed={setFile} />
        )}
      </DialogContent>
    </Dialog>
  );
}
