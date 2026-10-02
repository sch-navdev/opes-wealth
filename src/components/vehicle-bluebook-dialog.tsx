"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";
import type { BlueBookCandidate } from "@/lib/bluebook-parser";
import { readBlueBookDocument, saveBlueBookValuation } from "@/app/dashboard/vehicle-actions";

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * The official price-guide valuation of a vehicle (Blue Book / Argus / Parkers…),
 * kept apart from its market value. Upload the guide's PDF to read it, type it, or
 * start from the depreciation estimate; the user always confirms before saving.
 */
export function VehicleBlueBookDialog({
  assetId,
  currency,
  current,
  estimate,
}: {
  assetId: string;
  currency: string;
  current: { value: number | null; source: string; date: string; document: string };
  /** Value from the depreciation model, offered as a starting point (clearly an estimate). */
  estimate: number | null;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current.value != null ? String(current.value) : "");
  const [source, setSource] = useState(current.source);
  const [date, setDate] = useState(current.date || todayIso());
  const [documentName, setDocumentName] = useState(current.document);
  const [applyAsCurrent, setApplyAsCurrent] = useState(false);
  const [candidates, setCandidates] = useState<BlueBookCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const text = (msg: string) => (msg.startsWith("bluebook_") ? t(msg as TranslationKey) : msg);

  function handleFile(file: File) {
    setError(null);
    setInfo(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const res = await readBlueBookDocument(formData);
      if (!res.ok) {
        setError(text(res.error));
        return;
      }
      const p = res.parsed;
      if (p.value != null) setValue(String(p.value));
      if (p.source) setSource(p.source);
      if (p.date) setDate(p.date);
      setDocumentName(res.fileName);
      setCandidates(p.candidates);
      setInfo(t(p.value != null ? "bluebook_read_ok" : "bluebook_read_partial"));
    });
  }

  function save() {
    setError(null);
    const n = Number(value);
    startTransition(async () => {
      const res = await saveBlueBookValuation(assetId, { value: n, source, date, documentName, applyAsCurrent });
      if (!res.ok) {
        setError(text(res.error));
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <BookOpen className="size-4" />
          {t("bluebook_title")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">{t("bluebook_title")}</DialogTitle>
          <DialogDescription className="text-muted-foreground">{t("bluebook_desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted/30 px-6 py-8 text-center transition-colors",
              dragging && "border-primary bg-primary/5",
              isPending && "pointer-events-none opacity-60",
            )}
          >
            <FileText className="size-7 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{isPending ? t("tenancy_dropzone_pending") : t("bluebook_upload")}</p>
            <p className="text-xs text-muted-foreground">{documentName || t("bluebook_upload_hint")}</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          {info && <p className="text-xs text-success">{info}</p>}

          {candidates.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t("bluebook_other_amounts")}</p>
              <div className="flex flex-wrap gap-2">
                {candidates.map((c) => (
                  <Button key={c.value} type="button" variant="outline" size="sm" title={c.line} onClick={() => setValue(String(c.value))}>
                    {c.value.toLocaleString()} {c.currency ?? ""}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bb_value">{t("bluebook_value")} ({currency})</Label>
              <Input id="bb_value" type="number" step="any" min="0" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bb_date">{t("bluebook_date")}</Label>
              <Input id="bb_date" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bb_source">{t("bluebook_source")}</Label>
              <Input id="bb_source" value={source} placeholder={t("bluebook_source_placeholder")} onChange={(e) => setSource(e.target.value)} />
            </div>
          </div>

          {estimate != null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setValue(String(Math.round(estimate)));
                setSource(t("bluebook_source_estimate"));
                setDate(todayIso());
                setDocumentName("");
              }}
            >
              {t("bluebook_use_estimate")}
            </Button>
          )}

          <label className="flex min-h-11 cursor-pointer items-start gap-3 border border-border bg-muted/30 p-3">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-primary"
              checked={applyAsCurrent}
              onChange={(e) => setApplyAsCurrent(e.target.checked)}
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium text-foreground">{t("bluebook_apply_current")}</span>
              <span className="block text-xs text-muted-foreground">{t("bluebook_apply_current_hint")}</span>
            </span>
          </label>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="button" disabled={isPending || !value} onClick={save}>
              {t("bluebook_save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
