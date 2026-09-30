"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  FileSpreadsheet,
  Landmark,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";
import { parseCsv } from "@/lib/csv-parser";
import { currencies } from "@/lib/currencies";
import { BROKERS, aggregateTrades, type BrokerDefinition } from "@/lib/parsers/broker-registry";
import type {
  ParsedIncome,
  ParsedTrade,
  ParsedTradeRowError,
  TradeSide,
} from "@/lib/parsers/types";
import {
  parseGenericCsvTrades,
  parseGenericWorkbook,
  type GenericCsvDateFormat,
} from "@/lib/parsers/generic-csv";
import { importBrokerTrades, type ImportBrokerTradesResult } from "@/app/dashboard/actions";
import type { TranslationKey } from "@/lib/i18n";

type Method = "broker" | "file" | "manual";
type Stage =
  | "select"
  | "broker-grid"
  | "broker-drop"
  | "generic-drop"
  | "generic-map"
  | "manual-form"
  | "preview"
  | "result";

const dateFormats: GenericCsvDateFormat[] = ["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY"];

function guessColumn(headers: string[], keyword: string): string {
  return headers.find((h) => h.toLowerCase().includes(keyword)) ?? "";
}

type TradeSortKey = "ticker" | "tradeDate" | "side" | "quantity" | "price" | "exchangeRate" | "brokerage";

function compareTradeValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function SortableHead({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align,
}: {
  label: string;
  sortKey: TradeSortKey;
  activeKey: TradeSortKey | null;
  direction: "asc" | "desc";
  onSort: (key: TradeSortKey) => void;
  align?: "right";
}) {
  const isActive = activeKey === sortKey;
  const Icon = isActive ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <Icon className="size-3" />
      </button>
    </TableHead>
  );
}

export function AddInvestmentsDialog() {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportPending, startImportTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("select");
  const [selectedBroker, setSelectedBroker] = useState<BrokerDefinition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);

  const [trades, setTrades] = useState<ParsedTrade[]>([]);
  const [parseErrors, setParseErrors] = useState<ParsedTradeRowError[]>([]);
  const [skippedNonTradeCount, setSkippedNonTradeCount] = useState(0);
  const [accountInfo, setAccountInfo] = useState<{ brokerName: string; accountId: string } | null>(
    null,
  );
  const [dividends, setDividends] = useState<ParsedIncome[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<ImportBrokerTradesResult[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [sortKey, setSortKey] = useState<TradeSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [genericHeaders, setGenericHeaders] = useState<string[]>([]);
  const [genericRows, setGenericRows] = useState<Record<string, string>[]>([]);
  const [tickerColumn, setTickerColumn] = useState("");
  const [sideColumn, setSideColumn] = useState("");
  const [quantityColumn, setQuantityColumn] = useState("");
  const [priceColumn, setPriceColumn] = useState("");
  const [dateColumn, setDateColumn] = useState("");
  const [dateFormat, setDateFormat] = useState<GenericCsvDateFormat>("YYYY-MM-DD");
  const [genericCurrency, setGenericCurrency] = useState("USD");

  const [manualTicker, setManualTicker] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualSide, setManualSide] = useState<TradeSide>("buy");
  const [manualQuantity, setManualQuantity] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualCurrency, setManualCurrency] = useState("USD");
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualError, setManualError] = useState<string | null>(null);

  const aggregatedHoldings = useMemo(() => aggregateTrades(trades), [trades]);

  // Original `trades` indices, reordered for display only — sorting never
  // reorders `trades` itself, so a row's edits always stay attached to the
  // correct underlying trade regardless of the current sort.
  const displayOrder = useMemo(() => {
    const indices = trades.map((_, i) => i);
    if (!sortKey) return indices;
    return indices.sort((a, b) => {
      const result = compareTradeValues(trades[a][sortKey], trades[b][sortKey]);
      return sortDirection === "asc" ? result : -result;
    });
  }, [trades, sortKey, sortDirection]);

  function toggleSort(key: TradeSortKey) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  function updateTrade<K extends keyof ParsedTrade>(index: number, key: K, value: ParsedTrade[K]) {
    setTrades((prev) => prev.map((t, i) => (i === index ? { ...t, [key]: value } : t)));
  }

  function toggleTradeSelected(index: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIndices((prev) => (prev.size === trades.length ? new Set() : new Set(trades.map((_, i) => i))));
  }

  function deleteTrade(index: number) {
    setTrades((prev) => prev.filter((_, i) => i !== index));
    setSelectedIndices(new Set());
  }

  function deleteSelectedTrades() {
    setTrades((prev) => prev.filter((_, i) => !selectedIndices.has(i)));
    setSelectedIndices(new Set());
  }

  function resetAll() {
    setStage("select");
    setSelectedBroker(null);
    setIsDragging(false);
    setFileName(null);
    setDropError(null);
    setTrades([]);
    setParseErrors([]);
    setSkippedNonTradeCount(0);
    setAccountInfo(null);
    setDividends([]);
    setImportError(null);
    setImportResults([]);
    setSelectedIndices(new Set());
    setSortKey(null);
    setSortDirection("asc");
    setGenericHeaders([]);
    setGenericRows([]);
    setTickerColumn("");
    setSideColumn("");
    setQuantityColumn("");
    setPriceColumn("");
    setDateColumn("");
    setDateFormat("YYYY-MM-DD");
    setGenericCurrency("USD");
    setManualTicker("");
    setManualName("");
    setManualSide("buy");
    setManualQuantity("");
    setManualPrice("");
    setManualCurrency("USD");
    setManualDate(new Date().toISOString().slice(0, 10));
    setManualError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetAll();
  }

  function selectMethod(next: Method) {
    if (next === "broker") setStage("broker-grid");
    else if (next === "file") setStage("generic-drop");
    else setStage("manual-form");
  }

  async function handleBrokerFile(file: File, broker: BrokerDefinition) {
    setDropError(null);
    const lowerName = file.name.toLowerCase();
    if (!broker.acceptedExtensions.some((ext) => lowerName.endsWith(ext))) {
      setDropError(t("investments_dropzone_error_type"));
      return;
    }

    const buffer = await file.arrayBuffer();
    const result = broker.parse(buffer, file.name);

    setFileName(file.name);
    setTrades(result.trades.map((t) => ({ ...t, exchangeRate: t.exchangeRate ?? 1, brokerage: t.brokerage ?? 0 })));
    setParseErrors(result.errors);
    setSkippedNonTradeCount(result.skippedNonTradeCount ?? 0);
    setAccountInfo(
      result.accountId
        ? { brokerName: broker.id === "saxo" ? "Saxobank" : broker.name, accountId: result.accountId }
        : null,
    );
    setDividends(result.dividends ?? []);
    setStage("preview");
  }

  async function handleGenericFile(file: File) {
    setDropError(null);
    const lowerName = file.name.toLowerCase();
    const isCsv = lowerName.endsWith(".csv");
    const isExcel = lowerName.endsWith(".xlsx");
    if (!isCsv && !isExcel) {
      setDropError(t("investments_dropzone_error_csv_only"));
      return;
    }

    const parsed = isExcel
      ? parseGenericWorkbook(await file.arrayBuffer())
      : parseCsv(await file.text());
    if (parsed.rows.length === 0) {
      setDropError(t("csv_dropzone_error_empty"));
      return;
    }

    setFileName(file.name);
    setGenericHeaders(parsed.headers);
    setGenericRows(parsed.rows);
    setTickerColumn(guessColumn(parsed.headers, "ticker") || guessColumn(parsed.headers, "symbol"));
    setSideColumn(guessColumn(parsed.headers, "side") || guessColumn(parsed.headers, "type"));
    setQuantityColumn(guessColumn(parsed.headers, "quantity") || guessColumn(parsed.headers, "shares"));
    setPriceColumn(guessColumn(parsed.headers, "price"));
    setDateColumn(guessColumn(parsed.headers, "date"));
    setStage("generic-map");
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (stage === "broker-drop" && selectedBroker) void handleBrokerFile(file, selectedBroker);
    else if (stage === "generic-drop") void handleGenericFile(file);
  }

  function confirmGenericMapping() {
    const { trades: parsed, errors } = parseGenericCsvTrades(genericRows, {
      tickerColumn,
      sideColumn,
      quantityColumn,
      priceColumn,
      dateColumn,
      dateFormat,
      currency: genericCurrency,
    });
    setTrades(parsed.map((t) => ({ ...t, exchangeRate: t.exchangeRate ?? 1, brokerage: t.brokerage ?? 0 })));
    setParseErrors(errors);
    setSkippedNonTradeCount(0);
    setAccountInfo(null);
    setDividends([]);
    setStage("preview");
  }

  function submitManualTrade() {
    setManualError(null);

    if (!manualTicker.trim()) {
      setManualError(t("ticker_symbol_required"));
      return;
    }
    const quantity = Math.abs(Number(manualQuantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setManualError(t("investments_manual_invalid_quantity"));
      return;
    }
    const price = Number(manualPrice);
    if (!Number.isFinite(price) || price <= 0) {
      setManualError(t("investments_manual_invalid_price"));
      return;
    }

    const trade: ParsedTrade = {
      instrumentSymbol: manualTicker.trim().toUpperCase(),
      ticker: manualTicker.trim().toUpperCase(),
      exchange: null,
      instrumentName: manualName.trim() || manualTicker.trim().toUpperCase(),
      currency: manualCurrency,
      tradeDate: manualDate,
      side: manualSide,
      quantity,
      price,
      exchangeRate: 1,
      brokerage: 0,
    };

    setTrades([trade]);
    setParseErrors([]);
    setSkippedNonTradeCount(0);
    setAccountInfo(null);
    setDividends([]);
    setStage("preview");
  }

  function handleConfirmImport() {
    setImportError(null);
    startImportTransition(async () => {
      const result = await importBrokerTrades(aggregatedHoldings, {
        ...(accountInfo ?? {}),
        dividends,
      });
      if ("error" in result) {
        setImportError(result.error);
        return;
      }
      setImportResults(result.results);
      setStage("result");
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Plus className="size-4" />
          {t("add_investments")}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-2xl border-border bg-card p-6 max-h-[85vh] overflow-y-auto overflow-x-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">{t("add_investments")}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("add_investments_desc")}
          </DialogDescription>
        </DialogHeader>

        {stage === "select" && (
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
            {(
              [
                { key: "broker" as const, icon: Landmark, label: "method_upload_broker", desc: "method_upload_broker_desc" },
                { key: "file" as const, icon: FileSpreadsheet, label: "method_upload_file", desc: "method_upload_file_desc" },
                { key: "manual" as const, icon: Plus, label: "method_manual_trade", desc: "method_manual_trade_desc" },
              ]
            ).map(({ key, icon: Icon, label, desc }) => (
              <button
                key={key}
                type="button"
                onClick={() => selectMethod(key)}
                className="flex flex-col items-start gap-2 border border-border bg-muted/30 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <Icon className="size-6 text-primary" />
                <span className="text-sm font-medium text-foreground">{t(label as TranslationKey)}</span>
                <span className="text-xs text-muted-foreground">{t(desc as TranslationKey)}</span>
              </button>
            ))}
          </div>
        )}

        {stage === "broker-grid" && (
          <div className="min-w-0 space-y-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStage("select")}>
              <ArrowLeft className="size-4" />
              {t("back")}
            </Button>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {BROKERS.map((broker) => (
                <button
                  key={broker.id}
                  type="button"
                  onClick={() => {
                    setSelectedBroker(broker);
                    setStage("broker-drop");
                  }}
                  className="flex flex-col items-center gap-2 border border-border bg-muted/30 p-4 transition-colors hover:border-primary hover:bg-primary/5"
                >
                  <Avatar size="lg" className="rounded-md">
                    <AvatarFallback className="rounded-md text-lg font-semibold">
                      {broker.logoInitial}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-foreground">{broker.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === "broker-drop" && selectedBroker && (
          <div className="min-w-0 space-y-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStage("broker-grid")}>
              <ArrowLeft className="size-4" />
              {t("back")}
            </Button>
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
              )}
            >
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                {t("investments_dropzone_cta")}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedBroker.acceptedExtensions.join(", ")}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={selectedBroker.acceptedExtensions.join(",")}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleBrokerFile(file, selectedBroker);
              }}
            />
            {dropError && (
              <p className="text-sm text-destructive" role="alert">
                {dropError}
              </p>
            )}
          </div>
        )}

        {stage === "generic-drop" && (
          <div className="min-w-0 space-y-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStage("select")}>
              <ArrowLeft className="size-4" />
              {t("back")}
            </Button>
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
              )}
            >
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                {t("investments_dropzone_cta")}
              </p>
              <p className="text-xs text-muted-foreground">.csv, .xlsx</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleGenericFile(file);
              }}
            />
            {dropError && (
              <p className="text-sm text-destructive" role="alert">
                {dropError}
              </p>
            )}
          </div>
        )}

        {stage === "generic-map" && (
          <div className="min-w-0 space-y-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStage("generic-drop")}>
              <ArrowLeft className="size-4" />
              {t("back")}
            </Button>
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-sm text-foreground">{t("csv_map_columns")}</CardTitle>
                <CardDescription>{fileName}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: t("column_ticker"), value: tickerColumn, onChange: setTickerColumn },
                  { label: t("column_side"), value: sideColumn, onChange: setSideColumn },
                  { label: t("column_quantity"), value: quantityColumn, onChange: setQuantityColumn },
                  { label: t("column_price"), value: priceColumn, onChange: setPriceColumn },
                  { label: t("column_date"), value: dateColumn, onChange: setDateColumn },
                ].map((field) => (
                  <div key={field.label} className="space-y-2">
                    <Label>{field.label}</Label>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t("csv_select_column")} />
                      </SelectTrigger>
                      <SelectContent>
                        {genericHeaders.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}

                <div className="space-y-2">
                  <Label>{t("csv_date_format")}</Label>
                  <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as GenericCsvDateFormat)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dateFormats.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("column_currency")}</Label>
                  <Select value={genericCurrency} onValueChange={setGenericCurrency}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
            <DialogFooter>
              <Button
                type="button"
                onClick={confirmGenericMapping}
                disabled={!tickerColumn || !sideColumn || !quantityColumn || !priceColumn || !dateColumn}
              >
                {t("csv_map_columns")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {stage === "manual-form" && (
          <div className="min-w-0 space-y-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStage("select")}>
              <ArrowLeft className="size-4" />
              {t("back")}
            </Button>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="manual_ticker">{t("ticker_symbol")}</Label>
                <Input
                  id="manual_ticker"
                  value={manualTicker}
                  onChange={(e) => setManualTicker(e.target.value.toUpperCase())}
                  placeholder={t("ticker_symbol_equity_placeholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual_name">{t("investments_manual_instrument_name")}</Label>
                <Input
                  id="manual_name"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="e.g. Apple Inc."
                />
              </div>
              <div className="space-y-2">
                <Label>{t("investments_manual_side")}</Label>
                <Select value={manualSide} onValueChange={(v) => setManualSide(v as TradeSide)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">{t("side_buy")}</SelectItem>
                    <SelectItem value="sell">{t("side_sell")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual_date">{t("investments_manual_date")}</Label>
                <Input
                  id="manual_date"
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual_quantity">{t("investments_manual_quantity")}</Label>
                <Input
                  id="manual_quantity"
                  type="number"
                  step="any"
                  min="0"
                  value={manualQuantity}
                  onChange={(e) => setManualQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual_price">{t("investments_manual_price")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="manual_price"
                    type="number"
                    step="any"
                    min="0"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                  />
                  <Select value={manualCurrency} onValueChange={setManualCurrency}>
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            {manualError && (
              <p className="text-sm text-destructive" role="alert">
                {manualError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" onClick={submitManualTrade}>
                {t("investments_add_trade")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {stage === "preview" && (
          <div className="min-w-0 space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">{t("investments_review_heading")}</h3>
              <p className="text-xs text-muted-foreground">{t("investments_review_desc")}</p>
            </div>
            {fileName && (
              <p className="text-xs text-muted-foreground">
                {t("csv_selected_file")}: {fileName}
              </p>
            )}
            {parseErrors.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("csv_row_errors", { n: parseErrors.length })}
              </p>
            )}
            {skippedNonTradeCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("investments_skipped_non_trade_rows", { n: skippedNonTradeCount })}
              </p>
            )}
            {trades.length === 0 ? (
              <p className="text-sm text-destructive" role="alert">
                {t("investments_no_trades_found")}
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {t("investments_trades_selected", { selected: selectedIndices.size, total: trades.length })}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={deleteSelectedTrades}
                    disabled={selectedIndices.size === 0}
                  >
                    <Trash2 className="size-4" />
                    {t("investments_delete_selected")}
                  </Button>
                </div>
                <div role="region" tabIndex={0} className="overflow-x-auto border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={selectedIndices.size > 0 && selectedIndices.size === trades.length}
                            onCheckedChange={toggleSelectAll}
                            aria-label={t("investments_trades_selected", {
                              selected: selectedIndices.size,
                              total: trades.length,
                            })}
                          />
                        </TableHead>
                        <SortableHead label={t("trade_instrument")} sortKey="ticker" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                        <SortableHead label={t("trade_date")} sortKey="tradeDate" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                        <SortableHead label={t("trade_type")} sortKey="side" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                        <SortableHead label={t("trade_quantity")} sortKey="quantity" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} align="right" />
                        <SortableHead label={t("trade_price")} sortKey="price" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} align="right" />
                        <SortableHead label={t("trade_exchange_rate")} sortKey="exchangeRate" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} align="right" />
                        <SortableHead label={t("trade_brokerage")} sortKey="brokerage" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} align="right" />
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayOrder.map((index) => {
                        const trade = trades[index];
                        return (
                          <TableRow key={index}>
                            <TableCell>
                              <Checkbox
                                checked={selectedIndices.has(index)}
                                onCheckedChange={() => toggleTradeSelected(index)}
                                aria-label={trade.ticker}
                              />
                            </TableCell>
                            <TableCell className="min-w-32">
                              <div className="font-medium text-foreground">
                                {trade.ticker}
                                {trade.exchange && (
                                  <span className="ml-1 text-xs text-muted-foreground">{trade.exchange}</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {trade.instrumentName} · {trade.currency}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="date"
                                className="w-36"
                                value={trade.tradeDate}
                                onChange={(e) => updateTrade(index, "tradeDate", e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={trade.side}
                                onValueChange={(v) => updateTrade(index, "side", v as TradeSide)}
                              >
                                <SelectTrigger className="w-24">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="buy">{t("side_buy")}</SelectItem>
                                  <SelectItem value="sell">{t("side_sell")}</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="any"
                                min="0"
                                className="w-24 text-right"
                                value={trade.quantity}
                                onChange={(e) => updateTrade(index, "quantity", Number(e.target.value) || 0)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className="w-28 text-right"
                                value={trade.price}
                                onChange={(e) => updateTrade(index, "price", Number(e.target.value) || 0)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.000001"
                                min="0"
                                className="w-28 text-right"
                                value={trade.exchangeRate ?? 1}
                                onChange={(e) => updateTrade(index, "exchangeRate", Number(e.target.value) || 0)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className="w-24 text-right"
                                value={trade.brokerage ?? 0}
                                onChange={(e) => updateTrade(index, "brokerage", Number(e.target.value) || 0)}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => deleteTrade(index)}
                                aria-label={t("investments_delete_selected")}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
            {importError && (
              <p className="text-sm text-destructive" role="alert">
                {importError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetAll} disabled={isImportPending}>
                {t("csv_cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImportPending || aggregatedHoldings.length === 0}
              >
                {isImportPending
                  ? t("investments_importing")
                  : t("investments_import_button", { n: aggregatedHoldings.length })}
              </Button>
            </DialogFooter>
          </div>
        )}

        {stage === "result" && (
          <div className="min-w-0 space-y-4">
            <div role="region" tabIndex={0} className="overflow-x-auto border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("holding_ticker")}</TableHead>
                    <TableHead className="text-right">{t("investments_result_status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importResults.map((result) => (
                    <TableRow key={result.ticker}>
                      <TableCell className="font-medium text-foreground">{result.ticker}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right",
                          result.status === "error" ? "text-destructive" : "text-success",
                        )}
                        title={result.message}
                      >
                        {t(`investments_result_${result.status}` as TranslationKey)}
                        {result.priced === false &&
                          result.status !== "error" &&
                          ` · ${t("investments_unpriced")}`}
                        {result.history === "cost" &&
                          result.status !== "error" &&
                          ` · ${t("investments_history_cost")}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {importResults.some(
              (r) => r.code === "invalid_api_key" || r.code === "provider_not_configured",
            ) && (
              <p className="text-sm text-destructive" role="alert">
                {t("brokerage_api_key_warning")}
              </p>
            )}
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                {t("csv_done")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
