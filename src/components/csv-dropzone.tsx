"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";
import { parseCsv } from "@/lib/csv-parser";

export type ParsedCsvFile = {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
};

/**
 * Drag-and-drop / click-to-browse `.csv` picker. Reads the file client-side,
 * parses its headers and rows (`lib/csv-parser.ts`) and hands them to
 * `onParsed` so the parent can move on to column mapping. The `.csv`
 * extension is checked on both the drop and picker paths (the `accept`
 * attribute doesn't constrain drag-drop).
 */
export function CsvDropzone({
  onParsed,
  disabled = false,
}: {
  onParsed: (file: ParsedCsvFile) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = disabled || isParsing;

  async function handleFile(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError(t("csv_dropzone_error_type"));
      return;
    }

    setIsParsing(true);
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError(t("csv_dropzone_error_empty"));
        return;
      }
      onParsed({ fileName: file.name, headers: parsed.headers, rows: parsed.rows });
    } catch {
      setError(t("csv_dropzone_error_read"));
    } finally {
      setIsParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-disabled={busy}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (busy) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && !busy) void handleFile(file);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted px-6 py-10 text-center transition-colors",
          busy ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-foreground/40",
          isDragging && "border-foreground",
        )}
      >
        {isParsing ? (
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="size-8 text-muted-foreground" />
        )}
        <p className="text-sm font-medium text-foreground">
          {isParsing ? t("csv_parsing") : t("csv_dropzone_cta")}
        </p>
        <p className="text-xs text-muted-foreground">{t("csv_dropzone_subtext")}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
