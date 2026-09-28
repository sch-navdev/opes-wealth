"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, FileSpreadsheet, Landmark, Plus, Upload } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type { ParsedTrade, ParsedTradeRowError, TradeSide } from "@/lib/parsers/types";
import {
  parseGenericCsvTrades,
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
  const [importError, setImportError] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<ImportBrokerTradesResult[]>([]);

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

  function resetAll() {
    setStage("select");
    setSelectedBroker(null);
    setIsDragging(false);
    setFileName(null);
    setDropError(null);
    setTrades([]);
    setParseErrors([]);
    setImportError(null);
    setImportResults([]);
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
    setTrades(result.trades);
    setParseErrors(result.errors);
    setStage("preview");
  }

  async function handleGenericFile(file: File) {
    setDropError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setDropError(t("investments_dropzone_error_csv_only"));
      return;
    }

    const text = await file.text();
    const parsed = parseCsv(text);
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
    setTrades(parsed);
    setParseErrors(errors);
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
    };

    setTrades([trade]);
    setParseErrors([]);
    setStage("preview");
  }

  function handleConfirmImport() {
    setImportError(null);
    startImportTransition(async () => {
      const result = await importBrokerTrades(aggregatedHoldings);
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          <div className="space-y-4">
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
          <div className="space-y-3">
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
          <div className="space-y-3">
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
              <p className="text-xs text-muted-foreground">.csv</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
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
          <div className="space-y-4">
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
          <div className="space-y-4">
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
          <div className="space-y-4">
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
            {aggregatedHoldings.length === 0 ? (
              <p className="text-sm text-destructive" role="alert">
                {t("investments_no_trades_found")}
              </p>
            ) : (
              <div className="border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("holding_ticker")}</TableHead>
                      <TableHead>{t("holding_instrument")}</TableHead>
                      <TableHead className="text-right">{t("holding_net_quantity")}</TableHead>
                      <TableHead className="text-right">{t("holding_trades_count")}</TableHead>
                      <TableHead className="text-right">{t("holding_currency")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aggregatedHoldings.map((holding) => (
                      <TableRow key={`${holding.ticker}:${holding.exchange ?? ""}`}>
                        <TableCell className="font-medium text-foreground">
                          {holding.ticker}
                          {holding.exchange && (
                            <span className="ml-1 text-xs text-muted-foreground">{holding.exchange}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{holding.instrumentName}</TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">
                          {holding.netQuantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {holding.trades.length}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{holding.currency}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
          <div className="space-y-4">
            <div className="border border-border">
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
