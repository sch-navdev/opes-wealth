"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { OwnerShareNote } from "@/components/owner-share-note";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";
import { importTenancyContract } from "@/app/dashboard/actions";

type Stage = "drop" | "success";

/**
 * Uploads an Ejari (Dubai) or Tawtheeq (Abu Dhabi) tenancy contract PDF and
 * auto-fills the property's tenancy fields from it (`lib/tenancy-parser.ts`,
 * `importTenancyContract` server action) — mirrors `CsvImportDialog`'s
 * dropzone pattern, mounted in the asset detail page's Tenancy tab since the
 * action is scoped to one asset.
 */
export function TenancyContractDialog({ assetId, ownerShareFactor = 1 }: { assetId: string; ownerShareFactor?: number }) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("drop");
  const [isDragging, setIsDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [foundFieldCount, setFoundFieldCount] = useState(0);

  function resetState() {
    setStage("drop");
    setIsDragging(false);
    setDropError(null);
    setFoundFieldCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetState();
  }

  function handleFile(file: File) {
    setDropError(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setDropError(t("tenancy_dropzone_error_type"));
      return;
    }

    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      const result = await importTenancyContract(assetId, formData);
      if (!result.ok) {
        setDropError(result.error);
        return;
      }
      const count = Object.values(result.parsed).filter(
        (v) => v !== null && v !== "",
      ).length;
      setFoundFieldCount(count);
      setStage("success");
    });
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Upload className="size-4" />
          {t("import_tenancy_contract")}
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {t("import_tenancy_contract")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("import_tenancy_contract_desc")}
          </DialogDescription>
          <OwnerShareNote factor={ownerShareFactor} variant="edit" />
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
                isPending && "pointer-events-none opacity-60",
              )}
            >
              <FileText className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                {isPending ? t("tenancy_dropzone_pending") : t("tenancy_dropzone_cta")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("tenancy_dropzone_subtext")}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {dropError && (
              <p className="text-sm text-destructive" role="alert">
                {dropError}
              </p>
            )}
          </div>
        )}

        {stage === "success" && (
          <div className="space-y-4">
            <p className="text-sm text-success">
              {t("tenancy_import_success", { n: foundFieldCount })}
            </p>
            <Button type="button" onClick={() => handleOpenChange(false)}>
              {t("csv_done")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
