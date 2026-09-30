"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";
import {
  applyPropertyDocumentPatch,
  parsePropertyDocumentFile,
  type ParsePropertyDocumentResult,
} from "@/app/dashboard/actions";
import type { TranslationKey } from "@/lib/i18n";

type Parsed = Extract<ParsePropertyDocumentResult, { ok: true }>;

const prettyKey = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^\w/, (c) => c.toUpperCase());

/**
 * Upload a UAE property-document PDF (Abu Dhabi SPA / title deed, Dubai title
 * deed / Form F / Oqood / DLD receipt): the type is auto-detected, the
 * extracted fields are previewed, and on confirmation merged into the asset's
 * existing `RealEstateMetadata` (`lib/property-document-parser.ts`). Empty
 * fields are filled by default; "overwrite" replaces existing values.
 */
export function PropertyDocumentDialog({ assetId }: { assetId: string }) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);

  function reset() {
    setIsDragging(false);
    setError(null);
    setParsed(null);
    setOverwrite(false);
    setAppliedCount(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleFile(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError(t("property_document_error_type"));
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await parsePropertyDocumentFile(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setParsed(result);
    });
  }

  function handleApply() {
    if (!parsed) return;
    setError(null);
    startTransition(async () => {
      const result = await applyPropertyDocumentPatch(assetId, parsed.patch, overwrite);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAppliedCount(result.applied);
    });
  }

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
          <FileText className="size-4" />
          {t("import_property_document")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-background sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">{t("import_property_document")}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("import_property_document_desc")}
          </DialogDescription>
        </DialogHeader>

        {appliedCount !== null ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              {appliedCount > 0
                ? t("property_document_applied", { n: appliedCount })
                : t("property_document_nothing")}
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                {t("csv_done")}
              </Button>
            </DialogFooter>
          </div>
        ) : parsed ? (
          <div className="space-y-4">
            <p className="text-sm font-medium text-foreground">
              {t("property_document_detected", {
                type: t(`property_document_type_${parsed.documentType}` as TranslationKey),
              })}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md border border-border bg-muted p-3 text-sm">
              {parsed.fields.map((f) => (
                <div key={f.key} className="contents">
                  <dt className="text-muted-foreground">{prettyKey(f.key)}</dt>
                  <dd className="break-words text-foreground">{f.value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex items-center gap-2">
              <Checkbox
                id="property-doc-overwrite"
                checked={overwrite}
                onCheckedChange={(c) => setOverwrite(c === true)}
                disabled={isPending}
              />
              <Label htmlFor="property-doc-overwrite" className="text-sm text-foreground">
                {t("property_document_overwrite")}
              </Label>
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={reset} disabled={isPending}>
                {t("csv_cancel")}
              </Button>
              <Button type="button" onClick={handleApply} disabled={isPending}>
                {isPending ? t("property_document_applying") : t("property_document_apply")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              role="button"
              tabIndex={isPending ? -1 : 0}
              aria-disabled={isPending}
              onClick={() => !isPending && inputRef.current?.click()}
              onKeyDown={(e) => {
                if (!isPending && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file && !isPending) handleFile(file);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted px-6 py-10 text-center transition-colors",
                isDragging && "border-foreground",
                isPending && "cursor-not-allowed opacity-60",
              )}
            >
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                {isPending ? t("property_document_reading") : t("property_document_cta")}
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              disabled={isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
