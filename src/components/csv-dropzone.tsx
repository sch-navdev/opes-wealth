"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";
import { parseCsv } from "@/lib/csv-parser";

export type ParsedCsvFile = {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
};

/**
 * Drag-and-drop / click-to-browse `.csv` picker, styled after the 21st.dev
 * "File Upload Multi-File Dropzone" (ephraimduncan/file-upload-03, id 18111):
 * dashed zone that tints with a ring while dragging, a "Drag and drop or
 * <choose file>" line and a constraints note. Kept hand-rolled (no
 * `react-dropzone` dependency) and single-file, as the import is one CSV.
 *
 * Reads the file client-side. Reads the file client-side,
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
        aria-label={`${t("csv_drag_or")} ${t("csv_choose_file")}`}
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
          "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed px-6 py-12 text-center transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          busy ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary/60 hover:bg-muted/60",
          isDragging ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "border-border bg-muted/40",
        )}
      >
        {isParsing ? (
          <Loader2 className="size-10 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
        ) : (
          <FileSpreadsheet className="size-10 text-muted-foreground/80" aria-hidden />
        )}
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {isParsing ? (
            t("csv_parsing")
          ) : (
            <>
              {t("csv_drag_or")}{" "}
              <span className="font-medium text-primary underline-offset-4 hover:underline">
                {t("csv_choose_file")}
              </span>
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("csv_dropzone_subtext")} · {t("csv_only_note")}
        </p>
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
