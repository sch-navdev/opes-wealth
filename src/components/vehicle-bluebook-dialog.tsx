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
import { currencies } from "@/lib/currencies";
import type { TranslationKey } from "@/lib/i18n";
import type { BlueBookCandidate } from "@/lib/bluebook-parser";
import { readBlueBookDocument, saveBlueBookValuation } from "@/app/dashboard/vehicle-actions";

const todayIso = () => new Date().toISOString().slice(0, 10);
const knownCurrency = (code: string | null | undefined, fallback: string) =>
  code && currencies.some((c) => c.code === code) ? code : fallback;

/**
 * Adds an official price-guide valuation of a vehicle (Blue Book / Argus / Parkers…)
 * to its Blue Book curve, kept apart from the market value and the purchase price.
 * Upload the guide's PDF to read it, or type it in, in any supported currency; the
 * user always confirms before saving.
 */
export function VehicleBlueBookDialog({
  assetId,
  assetCurrency,
  estimate,
}: {
  assetId: string;
  assetCurrency: string;
  /** Value from the depreciation model, in the asset's currency; a clearly labelled starting point. */
  estimate: number | null;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(assetCurrency);
  const [source, setSource] = useState("");
  const [date, setDate] = useState(todayIso());
  const [documentName, setDocumentName] = useState("");
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
        setError(text(res.error) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      const p = res.parsed;
      if (p.value != null) setAmount(String(p.value));
      setCurrency(knownCurrency(p.currency, assetCurrency));
      if (p.source) setSource(p.source);
      if (p.date) setDate(p.date);
      setDocumentName(res.fileName);
      setCandidates(p.candidates);
      setInfo(t(p.value != null ? "bluebook_read_ok" : "bluebook_read_partial"));
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveBlueBookValuation(assetId, { amount: Number(amount), currency, source, date, documentName, applyAsCurrent });
      if (!res.ok) {
        setError(text(res.error));
        return;
      }
      setOpen(false);
      setAmount("");
      setSource("");
      setDocumentName("");
      setCandidates([]);
      setInfo(null);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <BookOpen className="size-4" />
          {t("bluebook_add")}
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
                  <Button
                    key={c.value + c.line}
                    type="button"
                    variant="outline"
                    size="sm"
                    title={c.line}
                    onClick={() => {
                      setAmount(String(c.value));
                      if (c.currency) setCurrency(knownCurrency(c.currency, currency));
                    }}
                  >
                    {c.value.toLocaleString()} {c.currency ?? ""}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bb_value">{t("bluebook_value")}</Label>
              <Input id="bb_value" type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bb_currency">{t("bluebook_currency")}</Label>
              <select
                id="bb_currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-9 w-full border border-input bg-background px-3 text-sm text-foreground"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
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
                setAmount(String(Math.round(estimate)));
                setCurrency(assetCurrency);
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
            <Button type="button" disabled={isPending || !amount} onClick={save}>
              {t("bluebook_save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
