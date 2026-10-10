"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BankStatementBatch } from "@/components/bank-statement-batch";
import { useBatchText } from "@/components/batch-import-text";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useLanguage } from "@/context/language-context";
import { MAX_BATCH_FILES, capFiles, type StatementTargetAccount } from "@/lib/banking/batch-import";

export type { StatementTargetAccount };

/**
 * Bank statement import (CSV and PDF). One or several files (up to MAX_BATCH_FILES) go through the SAME review
 * (`bank-statement-batch.tsx`): bank detection with a country-then-bank override, account routing, duplicate
 * checks, row selection and correction, "never import", renewed accounts and replaced cards, closed accounts,
 * password and OCR prompts. This component only owns the dialog and the file chooser; nothing is saved until
 * the review's Import button.
 */
export function BankStatementImportDialog({ accounts }: { accounts: StatementTargetAccount[] }) {
  const { t } = useLanguage();
  const bt = useBatchText();
  const [open, setOpen] = useState(false);
  const [batch, setBatch] = useState<{ files: File[]; dropped: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(list: File[]) {
    if (list.length === 0) return;
    const { kept, dropped } = capFiles(list);
    setBatch({ files: kept, dropped, total: list.length });
  }

  /** Closing through a button skips the dialog's onOpenChange, so the finished import must be cleared here: the next import starts empty. */
  function closeAndReset() {
    setOpen(false);
    setBatch(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setBatch(null);
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

        {batch ? (
          <BankStatementBatch
            key={batch.files.map((f) => f.name + f.size).join("|")}
            files={batch.files}
            dropped={batch.dropped}
            total={batch.total}
            accounts={accounts}
            onChooseOther={() => setBatch(null)}
            onDone={closeAndReset}
          />
        ) : (
          <div
            className="space-y-1"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(Array.from(e.dataTransfer.files ?? []));
            }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".csv,text/csv,text/plain,.pdf,application/pdf"
                className="hidden"
                onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                {t("stmt_choose_file")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{bt("batch_hint", { max: MAX_BATCH_FILES })}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
