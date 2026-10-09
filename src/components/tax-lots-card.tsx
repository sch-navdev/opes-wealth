"use client";

import { moneyFormatter, type MoneyFormatter } from "@/lib/money-parts";
import {
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OwnerShareNote } from "@/components/owner-share-note";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { normalizeShareFactor } from "@/lib/asset-detail-scaling";
import { parseEquityMetadata } from "@/lib/equities";
import type { TranslationKey } from "@/lib/i18n";
import {
  LOT_METHODS,
  isLotMethod,
  matchLots,
  unitPriceFromHolding,
  type LotMethod,
  type LotWarning,
} from "@/lib/tax-lots";
import { cn } from "@/lib/utils";

/** localStorage key remembering the viewer's preferred matching method (a UI preference only). */
export const TAX_LOT_METHOD_STORAGE_KEY = "opes-taxlot-method";

const DEFAULT_METHOD: LotMethod = "fifo";

/** Realised matches shown before the "Show all" toggle. */
const MATCH_PREVIEW = 5;

const METHOD_LABEL: Record<LotMethod, TranslationKey> = {
  fifo: "lots_method_fifo",
  lifo: "lots_method_lifo",
  hifo: "lots_method_hifo",
  average: "lots_method_average",
};

const METHOD_DESC: Record<LotMethod, TranslationKey> = {
  fifo: "lots_method_fifo_desc",
  lifo: "lots_method_lifo_desc",
  hifo: "lots_method_hifo_desc",
  average: "lots_method_average_desc",
};

// Stored method preference, read through useSyncExternalStore (same pattern as the privacy and
// language contexts) so the server render and first paint use the default without a mismatch.
const methodListeners = new Set<() => void>();

function subscribeMethod(listener: () => void): () => void {
  methodListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    methodListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readStoredMethod(): LotMethod {
  try {
    const stored = window.localStorage.getItem(TAX_LOT_METHOD_STORAGE_KEY);
    return isLotMethod(stored) ? stored : DEFAULT_METHOD;
  } catch {
    return DEFAULT_METHOD;
  }
}

function serverMethod(): LotMethod {
  return DEFAULT_METHOD;
}

function storeMethod(method: LotMethod) {
  try {
    window.localStorage.setItem(TAX_LOT_METHOD_STORAGE_KEY, method);
  } catch {
    // storage unavailable (private mode, quota): the in-memory choice still applies
  }
  methodListeners.forEach((listener) => listener());
}

function currencyFormatter(locale: string, currency: string, signed: boolean): MoneyFormatter {
  const sign: Intl.NumberFormatOptions = signed ? { signDisplay: "exceptZero" } : {};
  try {
    return moneyFormatter(locale, currency, { ...sign });
  } catch {
    // Unknown currency code: plain two-decimal numbers rather than a crash.
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, ...sign });
  }
}

/** -1/0/1 after rounding to cents, so an amount that displays as zero is neutral. */
function signOf(amount: number): -1 | 0 | 1 {
  const cents = Math.round(amount * 100);
  return cents > 0 ? 1 : cents < 0 ? -1 : 0;
}

type TaxLotsAsset = {
  quantity: number;
  current_value: number;
  currency: string;
  metadata: Record<string, unknown> | null;
};

/**
 * Tax-lot view of an Equities holding (asset detail, Analysis tab): open lots, realised
 * matches and realised gain by year under FIFO / LIFO / HIFO / average cost, from the
 * holding's trade ledger (`lib/tax-lots.ts`). Lots are matched on the RAW whole-asset trades;
 * displayed amounts and quantities are then reduced to the viewer's share (`ownerFactor`).
 * Unit costs and prices are per share, so they are never scaled. Informational only.
 */
export function TaxLotsCard({
  asset,
  ownerFactor = 1,
  asOf,
  className,
}: {
  /** The RAW whole-asset record (100% values). */
  asset: TaxLotsAsset;
  /** The viewer's 0-1 share of a co-owned asset (1 = sole owner). */
  ownerFactor?: number;
  /** Date held days are measured to (YYYY-MM-DD); defaults to today. */
  asOf?: string;
  className?: string;
}) {
  const { t, intlLocale, dir } = useLanguage();
  const { maskValue, isPrivate } = usePrivacy();
  const storedMethod = useSyncExternalStore(subscribeMethod, readStoredMethod, serverMethod);
  const [chosenMethod, setChosenMethod] = useState<LotMethod | null>(null);
  const method = chosenMethod ?? storedMethod;
  const [showAllMatches, setShowAllMatches] = useState(false);
  const radioRefs = useRef<Partial<Record<LotMethod, HTMLButtonElement | null>>>({});
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const methodLabelId = `${baseId}-method`;
  const methodDescId = `${baseId}-method-desc`;
  const matchesTableId = `${baseId}-matches`;

  const trades = useMemo(() => parseEquityMetadata(asset.metadata).trades, [asset.metadata]);
  const result = useMemo(
    () =>
      matchLots(trades, method, {
        currency: asset.currency,
        currentUnitPrice: unitPriceFromHolding(asset.quantity, asset.current_value),
        heldQuantity: asset.quantity,
        asOf,
      }),
    [trades, method, asset.currency, asset.quantity, asset.current_value, asOf],
  );

  const f = normalizeShareFactor(ownerFactor);
  const moneyFmt = currencyFormatter(intlLocale, asset.currency, false);
  const signedFmt = currencyFormatter(intlLocale, asset.currency, true);
  const qtyFmt = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 6 });
  const dateFmt = new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeZone: "UTC" });

  /** A whole-asset amount, shown as the viewer's share. */
  const money = (amount: number) => maskValue(moneyFmt.format(amount * f));
  /** A per-share amount (never scaled). */
  const perShare = (amount: number) => maskValue(moneyFmt.format(amount));
  const signedMoney = (amount: number) => {
    const share = amount * f;
    return maskValue(signedFmt.format(signOf(share) === 0 ? 0 : share));
  };
  const quantity = (q: number) => maskValue(qtyFmt.format(q * f));
  const tone = (amount: number | null) => {
    if (amount == null || isPrivate) return "text-foreground";
    const s = signOf(amount * f);
    return s > 0 ? "text-success" : s < 0 ? "text-destructive" : "text-foreground";
  };
  const formatDate = (date: string) => {
    const ms = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(ms) ? dateFmt.format(ms) : date || "—";
  };

  function choose(next: LotMethod) {
    setChosenMethod(next);
    storeMethod(next);
  }

  function onRadioKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const index = LOT_METHODS.indexOf(method);
    const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backward = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    let nextIndex: number | null = null;
    if (e.key === forward || e.key === "ArrowDown") nextIndex = (index + 1) % LOT_METHODS.length;
    else if (e.key === backward || e.key === "ArrowUp") nextIndex = (index - 1 + LOT_METHODS.length) % LOT_METHODS.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = LOT_METHODS.length - 1;
    if (nextIndex == null) return;
    e.preventDefault();
    const next = LOT_METHODS[nextIndex];
    choose(next);
    radioRefs.current[next]?.focus();
  }

  const warningText = (w: LotWarning): string => {
    switch (w.kind) {
      case "oversold":
        return t("lots_warn_oversold", { date: formatDate(w.date), quantity: quantity(w.quantity) });
      case "currency_mismatch":
        return t("lots_warn_currency", { date: formatDate(w.date), currency: w.currency });
      case "invalid_trade":
        return t("lots_warn_invalid", { date: formatDate(w.date) });
      case "quantity_mismatch":
        return t("lots_warn_quantity", { lots: quantity(w.lotQuantity), held: quantity(w.heldQuantity) });
    }
  };

  const visibleMatches =
    showAllMatches || result.matches.length <= MATCH_PREVIEW
      ? result.matches
      : result.matches.slice(0, MATCH_PREVIEW);
  const currency = asset.currency;
  const num = "text-end tabular-nums";
  const rowHead = "font-normal text-foreground";

  return (
    <Card
      role="region"
      aria-labelledby={titleId}
      className={cn("min-w-0 border-border bg-card", className)}
      data-testid="tax-lots-card"
    >
      <CardHeader>
        <CardTitle className="text-foreground">
          <h2 id={titleId} className="text-base font-semibold">
            {t("lots_title")}
          </h2>
        </CardTitle>
        <CardDescription>{t("lots_scope")}</CardDescription>
        <OwnerShareNote factor={f} />
      </CardHeader>

      <CardContent className="min-w-0 space-y-6">
        <div className="space-y-2">
          <p id={methodLabelId} className="text-sm font-medium text-foreground">
            {t("lots_method_label")}
          </p>
          <div
            role="radiogroup"
            aria-labelledby={methodLabelId}
            aria-describedby={methodDescId}
            className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1"
          >
            {LOT_METHODS.map((m) => {
              const selected = m === method;
              return (
                <button
                  key={m}
                  ref={(el) => {
                    radioRefs.current[m] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => choose(m)}
                  onKeyDown={onRadioKeyDown}
                  className={cn(
                    "min-h-9 rounded-md px-3 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                  )}
                >
                  {t(METHOD_LABEL[m])}
                </button>
              );
            })}
          </div>
          <p id={methodDescId} className="text-xs text-muted-foreground" aria-live="polite">
            {t(METHOD_DESC[method])}
          </p>
        </div>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryTile label={t("lots_remaining_cost")} testId="lots-remaining-cost">
            {money(result.remainingCost)}
          </SummaryTile>
          <SummaryTile
            label={t("lots_unrealised")}
            testId="lots-unrealised"
            className={tone(result.unrealisedGain)}
            hint={result.unrealisedGain == null ? t("lots_no_price") : undefined}
          >
            {result.unrealisedGain != null ? signedMoney(result.unrealisedGain) : "—"}
          </SummaryTile>
          <SummaryTile
            label={t("lots_realised_total")}
            testId="lots-realised-total"
            className={tone(result.totalRealised)}
          >
            {signedMoney(result.totalRealised)}
          </SummaryTile>
        </dl>

        <section className="min-w-0 space-y-2" aria-labelledby={`${baseId}-years`}>
          <h3 id={`${baseId}-years`} className="text-sm font-semibold text-foreground">
            {t("lots_by_year_title")}
          </h3>
          {result.realisedByYear.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("lots_no_sales")}</p>
          ) : (
            <Table className="caption-top">
              <TableCaption className="mt-0 mb-2 text-start text-xs">
                {t("lots_by_year_caption", { currency })}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t("lots_col_year")}</TableHead>
                  <TableHead scope="col" className="text-end">{t("lots_col_proceeds")}</TableHead>
                  <TableHead scope="col" className="text-end">{t("lots_col_cost")}</TableHead>
                  <TableHead scope="col" className="text-end">{t("lots_col_gain")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.realisedByYear.map((y) => (
                  <TableRow key={y.year}>
                    <TableHead scope="row" className={cn(rowHead, "tabular-nums")}>{y.year}</TableHead>
                    <TableCell className={num}>{money(y.proceeds)}</TableCell>
                    <TableCell className={num}>{money(y.cost)}</TableCell>
                    <TableCell className={cn(num, tone(y.gain))}>{signedMoney(y.gain)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {result.realisedByYear.length > 1 && (
                <TableFooter>
                  <TableRow>
                    <TableHead scope="row" className="text-foreground">{t("lots_total")}</TableHead>
                    <TableCell className={num}>{money(result.totalProceeds)}</TableCell>
                    <TableCell className={num}>{money(result.totalRealisedCost)}</TableCell>
                    <TableCell className={cn(num, tone(result.totalRealised))}>
                      {signedMoney(result.totalRealised)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          )}
        </section>

        <section className="min-w-0 space-y-2" aria-labelledby={`${baseId}-open`}>
          <h3 id={`${baseId}-open`} className="text-sm font-semibold text-foreground">
            {t("lots_open_title")}
          </h3>
          {result.openLots.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("lots_no_open")}</p>
          ) : (
            <Table className="caption-top">
              <TableCaption className="mt-0 mb-2 text-start text-xs">
                {t("lots_open_caption", { currency })}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t("lots_col_date")}</TableHead>
                  <TableHead scope="col" className="text-end">{t("lots_col_quantity")}</TableHead>
                  <TableHead scope="col" className="text-end">{t("lots_col_unit_cost")}</TableHead>
                  <TableHead scope="col" className="text-end">{t("lots_col_cost")}</TableHead>
                  <TableHead scope="col" className="text-end">{t("lots_col_value")}</TableHead>
                  <TableHead scope="col" className="text-end">{t("lots_unrealised")}</TableHead>
                  <TableHead scope="col" className="text-end">{t("lots_col_held_days")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.openLots.map((lot) => (
                  <TableRow key={lot.buyTradeId} data-testid="lots-open-row">
                    <TableHead scope="row" className={rowHead}>{formatDate(lot.date)}</TableHead>
                    <TableCell className={num}>{quantity(lot.quantity)}</TableCell>
                    <TableCell className={num}>{perShare(lot.unitCost)}</TableCell>
                    <TableCell className={num}>{money(lot.cost)}</TableCell>
                    <TableCell className={num}>{lot.value != null ? money(lot.value) : "—"}</TableCell>
                    <TableCell className={cn(num, tone(lot.unrealisedGain))}>
                      {lot.unrealisedGain != null ? signedMoney(lot.unrealisedGain) : "—"}
                    </TableCell>
                    <TableCell className={num}>
                      <span className="inline-flex items-center justify-end gap-2">
                        {lot.heldOverYear && (
                          <Badge variant="outline" className="font-normal text-muted-foreground">
                            {t("lots_held_12m")}
                          </Badge>
                        )}
                        <span>{qtyFmt.format(lot.heldDays)}</span>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <section className="min-w-0 space-y-2" aria-labelledby={`${baseId}-matches-title`}>
          <h3 id={`${baseId}-matches-title`} className="text-sm font-semibold text-foreground">
            {t("lots_matches_title")}
          </h3>
          {result.matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("lots_no_sales")}</p>
          ) : (
            <>
              <Table className="caption-top" id={matchesTableId}>
                <TableCaption className="mt-0 mb-2 text-start text-xs">
                  {t("lots_matches_caption", { currency })}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{t("lots_col_sell_date")}</TableHead>
                    <TableHead scope="col">{t("lots_col_lot_date")}</TableHead>
                    <TableHead scope="col" className="text-end">{t("lots_col_quantity")}</TableHead>
                    <TableHead scope="col" className="text-end">{t("lots_col_proceeds")}</TableHead>
                    <TableHead scope="col" className="text-end">{t("lots_col_cost")}</TableHead>
                    <TableHead scope="col" className="text-end">{t("lots_col_gain")}</TableHead>
                    <TableHead scope="col" className="text-end">{t("lots_col_held_days")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleMatches.map((m, i) => (
                    <TableRow key={`${m.sellTradeId}-${m.buyTradeId}-${i}`} data-testid="lots-match-row">
                      <TableHead scope="row" className={rowHead}>{formatDate(m.sellDate)}</TableHead>
                      <TableCell>{formatDate(m.lotDate)}</TableCell>
                      <TableCell className={num}>{quantity(m.quantity)}</TableCell>
                      <TableCell className={num}>{money(m.proceeds)}</TableCell>
                      <TableCell className={num}>{money(m.cost)}</TableCell>
                      <TableCell className={cn(num, tone(m.gain))}>{signedMoney(m.gain)}</TableCell>
                      <TableCell className={num}>{qtyFmt.format(m.holdingDays)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {result.matches.length > MATCH_PREVIEW && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-expanded={showAllMatches}
                  aria-controls={matchesTableId}
                  onClick={() => setShowAllMatches((v) => !v)}
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={cn("transition-transform", showAllMatches && "rotate-180")}
                  />
                  {showAllMatches ? t("lots_show_fewer") : t("lots_show_all", { n: result.matches.length })}
                </Button>
              )}
            </>
          )}
        </section>

        {result.warnings.length > 0 && (
          <section className="space-y-2" aria-labelledby={`${baseId}-warnings`} data-testid="lots-warnings">
            <h3 id={`${baseId}-warnings`} className="text-sm font-semibold text-foreground">
              {t("lots_warnings_title")}
            </h3>
            <ul className="space-y-1">
              {result.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>{warningText(w)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-xs text-muted-foreground">{t("lots_disclaimer")}</p>
      </CardContent>
    </Card>
  );
}

function SummaryTile({
  label,
  children,
  hint,
  testId,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  testId: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-lg font-semibold tabular-nums", className)} data-testid={testId}>
        {children}
      </dd>
      {hint && <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}
