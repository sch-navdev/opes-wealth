"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Building2, CloudDownload, Landmark, LineChart, RefreshCw } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddAssetDialog } from "@/components/add-asset-dialog";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { DeleteAssetButton } from "@/components/delete-asset-button";
import { PrivacyToggleButton } from "@/components/privacy-toggle-button";
import { usePrivacy } from "@/context/privacy-context";
import { useLanguage } from "@/context/language-context";
import {
  refreshAdrecValuation,
  refreshDldValuation,
  updateAssetValuation,
} from "@/app/dashboard/actions";
import {
  calculateCashInvestedToDate,
  calculateTotalCost,
  calculateUnrealizedGain,
  parseRealEstateMetadata,
  resolveOutstandingLoanBalance,
} from "@/lib/real-estate";
import { parseVehicleMetadata } from "@/lib/vehicles";
import { parsePrivateEquityMetadata } from "@/lib/private-equity";
import { estimateCostBasisUnitPrice, parseEquityMetadata } from "@/lib/equities";
import { parseCryptoMetadata } from "@/lib/crypto";
import { currencies, getCurrencySymbol } from "@/lib/currencies";
import { convertAmount } from "@/lib/fx";
import { fetchMarketPrice } from "@/lib/market-data/market-price";
import { refreshMarketPrice } from "@/app/dashboard/actions";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";

export type AssetDetail = {
  id: string;
  name: string;
  category_id: string;
  quantity: number;
  current_value: number;
  currency: string;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  images: string[] | null;
  ticker_symbol: string | null;
  purchase_date: string;
  asset_categories: { name: string } | null;
};

export type AssetHistoryPoint = {
  id: string;
  recorded_date: string;
  value: number;
  net_equity: number | null;
  source: string;
};

type Category = { id: string; name: string };

/** Maps `refresh-market-price`'s error `code` to a localized message key, so the UI never shows the Edge Function's raw (English-only) message text. */
const MARKET_PRICE_ERROR_KEYS: Record<string, TranslationKey> = {
  invalid_request: "market_price_error_invalid_request",
  invalid_symbol: "market_price_error_invalid_symbol",
  unsupported_currency: "market_price_error_unsupported_currency",
  provider_not_configured: "market_price_error_provider_not_configured",
  timeout: "market_price_error_timeout",
  rate_limited: "market_price_error_rate_limited",
  invalid_response: "market_price_error_invalid_response",
  network_error: "market_price_error_network_error",
};

/** Maps `refreshDldValuation`'s `DldErrorCode` to a localized message key, following the `MARKET_PRICE_ERROR_KEYS` pattern rather than the old DARI stub's flat raw-string errors (that stub has since been superseded by the ADREC/DARI integration below). */
const DLD_ERROR_KEYS: Record<string, TranslationKey> = {
  invalid_request: "dld_error_invalid_request",
  invalid_deed_number: "dld_error_invalid_deed_number",
  invalid_project_number: "dld_error_invalid_project_number",
  inactive_project: "dld_error_inactive_project",
  not_found: "dld_error_not_found",
  rate_limited: "dld_error_rate_limited",
  provider_not_configured: "dld_error_provider_not_configured",
  invalid_response: "dld_error_invalid_response",
  timeout: "dld_error_timeout",
  network_error: "dld_error_network_error",
};

/** Maps `refreshAdrecValuation`'s `AdrecErrorCode` (SCREAMING_SNAKE_CASE, per that module's own convention) to a localized message key. */
const ADREC_ERROR_KEYS: Record<string, TranslationKey> = {
  INVALID_REQUEST: "adrec_error_invalid_request",
  INVALID_PLOT_NUMBER: "adrec_error_invalid_plot_number",
  INVALID_TITLE_DEED: "adrec_error_invalid_title_deed",
  PROJECT_NOT_FOUND: "adrec_error_project_not_found",
  DEVELOPER_BLOCKED: "adrec_error_developer_blocked",
  NOT_FOUND: "adrec_error_not_found",
  RATE_LIMITED: "adrec_error_rate_limited",
  PROVIDER_NOT_CONFIGURED: "adrec_error_provider_not_configured",
  INVALID_RESPONSE: "adrec_error_invalid_response",
  TIMEOUT: "adrec_error_timeout",
  NETWORK_ERROR: "adrec_error_network_error",
};

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

function ProgressBar({
  percent,
  colorClassName,
}: {
  percent: number;
  colorClassName: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 w-full min-w-0 overflow-hidden bg-muted">
      <div
        className={`h-full ${colorClassName}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function AssetDetailView({
  asset,
  history,
  categories,
  ratesFromUsd,
}: {
  asset: AssetDetail;
  history: AssetHistoryPoint[];
  categories: Category[];
  ratesFromUsd: Record<string, number>;
}) {
  const router = useRouter();
  const { maskValue } = usePrivacy();
  const { t } = useLanguage();
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [refreshValue, setRefreshValue] = useState("");
  const [refreshCurrency, setRefreshCurrency] = useState(asset.currency);
  const [refreshSource, setRefreshSource] = useState<
    "manual" | "dari" | "dubailand"
  >("manual");
  const [valuationDate, setValuationDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [adrecError, setAdrecError] = useState<string | null>(null);
  const [adrecMessage, setAdrecMessage] = useState<string | null>(null);
  const [isAdrecPending, startAdrecTransition] = useTransition();
  const [marketPriceError, setMarketPriceError] = useState<string | null>(null);
  const [marketPriceMessage, setMarketPriceMessage] = useState<string | null>(null);
  const [isMarketPricePending, startMarketPriceTransition] = useTransition();
  const [dldError, setDldError] = useState<string | null>(null);
  const [dldMessage, setDldMessage] = useState<string | null>(null);
  const [isDldPending, startDldTransition] = useTransition();

  const categoryName = asset.asset_categories?.name ?? "—";
  const isRealEstate = categoryName === "Real Estate";
  const isVehicle = categoryName === "Vehicles";
  const isPrivateEquity = categoryName === "Private Equity";
  const isEquity = categoryName === "Equities";
  const isCrypto = categoryName === "Crypto";
  const metadata = parseRealEstateMetadata(asset.metadata);
  const vehicleMetadata = isVehicle ? parseVehicleMetadata(asset.metadata) : null;
  const privateEquityMetadata = isPrivateEquity
    ? parsePrivateEquityMetadata(asset.metadata)
    : null;
  const equityMetadata = isEquity ? parseEquityMetadata(asset.metadata) : null;
  const cryptoMetadata = isCrypto ? parseCryptoMetadata(asset.metadata) : null;
  const avgCostBasis = equityMetadata
    ? estimateCostBasisUnitPrice(equityMetadata.trades)
    : null;
  const images = asset.images ?? [];

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: asset.currency,
  });

  const marketValuation = isRealEstate
    ? metadata.market_valuation ?? asset.current_value
    : asset.current_value;
  const netEquity = asset.current_value;

  const totalCost = isRealEstate
    ? calculateTotalCost(metadata, marketValuation)
    : null;
  const cashInvestedToDate =
    isRealEstate && metadata.is_offplan
      ? calculateCashInvestedToDate(metadata)
      : null;
  const unrealizedGain =
    isRealEstate && totalCost != null
      ? calculateUnrealizedGain(marketValuation, totalCost)
      : null;
  const valuePerSqm =
    isRealEstate && metadata.surfaceArea
      ? marketValuation / metadata.surfaceArea
      : null;

  const confidenceLevel = metadata.automaticEstimation
    ? t("confidence_high")
    : t("confidence_manual");
  const netROI =
    unrealizedGain != null && totalCost
      ? (unrealizedGain.amount / totalCost) * 100
      : null;
  const primaryOwnership =
    metadata.ownership.find((o) => o.name) ?? metadata.ownership[0];
  const ownershipPercent = primaryOwnership?.percentage ?? 100;
  const grossShare = (ownershipPercent / 100) * marketValuation;
  const netShare = (ownershipPercent / 100) * netEquity;
  const equityRatio = marketValuation !== 0 ? (netEquity / marketValuation) * 100 : 0;
  const outstandingLoanBalance = resolveOutstandingLoanBalance(metadata.linked_loan);
  const hasLoan = !!(metadata.linked_loan.amount || metadata.linked_loan.outstanding_principal);

  const initials = categoryName !== "—" ? categoryName[0].toUpperCase() : "?";

  const sortedHistory = [...history].sort((a, b) =>
    a.recorded_date.localeCompare(b.recorded_date),
  );

  // Real Estate: the curve should never show a valuation predating the
  // purchase — drop anything earlier, and pin whatever lands on the purchase
  // date itself to the all-in cost basis (purchase/contract price +
  // acquisition fees), synthesizing that point if none is stored there yet.
  // Only done for standard (non-off-plan) purchases: an off-plan property's
  // earliest point is its down-payment milestone, which is already a more
  // accurate anchor than the full contract price (not yet paid at signing).
  // Falls back to the earliest available history point when `purchase_date`
  // is missing (e.g. an asset saved before it became a mandatory field).
  const purchaseAnchorDate =
    isRealEstate && asset.purchase_date ? asset.purchase_date : null;

  let displayHistory = sortedHistory;
  if (purchaseAnchorDate) {
    displayHistory = sortedHistory.filter(
      (h) => h.recorded_date >= purchaseAnchorDate,
    );
    if (!metadata.is_offplan && totalCost != null) {
      const anchorPoint: AssetHistoryPoint = {
        id: "purchase-anchor",
        recorded_date: purchaseAnchorDate,
        value: totalCost,
        net_equity: totalCost,
        source: "manual",
      };
      const hasAnchorPoint = displayHistory.some(
        (h) => h.recorded_date === purchaseAnchorDate,
      );
      displayHistory = hasAnchorPoint
        ? displayHistory.map((h) =>
            h.recorded_date === purchaseAnchorDate ? anchorPoint : h,
          )
        : [anchorPoint, ...displayHistory];
    }
  }

  const chartData = displayHistory.map((h) => ({
    date: h.recorded_date,
    value: h.value,
    netEquity: h.net_equity ?? h.value,
  }));

  const axisDateFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const lastPricedAtFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  function formatLastPricedAt(iso: string | null): string | null {
    if (!iso) return null;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : lastPricedAtFormatter.format(parsed);
  }

  function formatChartDate(isoDate: unknown): string {
    if (typeof isoDate !== "string") return String(isoDate ?? "");
    const parsed = new Date(isoDate);
    return Number.isNaN(parsed.getTime())
      ? isoDate
      : axisDateFormatter.format(parsed);
  }

  function handleRefreshFromAdrec() {
    setAdrecError(null);
    setAdrecMessage(null);

    startAdrecTransition(async () => {
      const result = await refreshAdrecValuation(asset.id);

      if (!result.ok) {
        const key = ADREC_ERROR_KEYS[result.code ?? ""] ?? "adrec_error_network_error";
        setAdrecError(t(key));
        return;
      }

      if (result.kind === "project_status") {
        setAdrecMessage(
          t("adrec_project_status_updated", { percent: result.completionRate }),
        );
        return;
      }

      setAdrecMessage(
        t("adrec_valuation_updated", {
          value: currencyFormatter.format(result.value),
          ref: result.certificateId,
        }),
      );
    });
  }

  function handleRefreshMarketPrice() {
    setMarketPriceError(null);
    setMarketPriceMessage(null);

    startMarketPriceTransition(async () => {
      const result = await fetchMarketPrice(
        isCrypto
          ? {
              assetId: asset.id,
              category: "crypto",
              coingeckoId: cryptoMetadata?.coingecko_id,
              currency: asset.currency,
            }
          : {
              assetId: asset.id,
              category: "equities",
              symbol: asset.ticker_symbol ?? undefined,
              currency: asset.currency,
            },
      );

      if (!result.ok) {
        const key = MARKET_PRICE_ERROR_KEYS[result.code] ?? "market_price_error_network_error";
        setMarketPriceError(t(key));
        return;
      }

      const persistResult = await refreshMarketPrice(asset.id, result.unitPrice, result.source);
      if (persistResult?.error) {
        setMarketPriceError(persistResult.error);
        return;
      }

      setMarketPriceMessage(
        t("market_price_updated", { price: currencyFormatter.format(result.unitPrice) }),
      );
    });
  }

  function handleRefreshFromDld() {
    setDldError(null);
    setDldMessage(null);

    startDldTransition(async () => {
      const result = await refreshDldValuation(asset.id);

      if (!result.ok) {
        const key = DLD_ERROR_KEYS[result.code ?? ""] ?? "dld_error_network_error";
        setDldError(t(key));
        return;
      }

      if (result.kind === "project_status") {
        setDldMessage(
          t("dld_project_status_updated", { percent: result.completionPercentage }),
        );
        return;
      }

      setDldMessage(
        t("dld_valuation_updated", {
          value: currencyFormatter.format(result.value),
          ref: result.certificateReference,
        }),
      );
    });
  }

  function handleRefreshSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRefreshError(null);
    const enteredValue = Number(refreshValue);
    if (!Number.isFinite(enteredValue)) {
      setRefreshError("Enter a valid number.");
      return;
    }

    // The dialog lets the user enter the new value in any currency, but
    // the asset (and its history) is always stored in its own currency —
    // convert before saving.
    const valueInAssetCurrency = convertAmount(
      enteredValue,
      refreshCurrency,
      asset.currency,
      ratesFromUsd,
    );

    startTransition(async () => {
      const result = await updateAssetValuation(
        asset.id,
        valueInAssetCurrency,
        refreshSource,
        valuationDate,
      );
      if (result?.error) {
        setRefreshError(result.error);
        return;
      }
      setRefreshOpen(false);
      setRefreshValue("");
      setValuationDate(new Date().toISOString().slice(0, 10));
    });
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-8">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("back_to_portfolio")}
      </Link>

      <div className="mx-auto max-w-3xl space-y-6">
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Dialog>
                <DialogTrigger asChild disabled={images.length === 0}>
                  <button
                    type="button"
                    className={
                      images.length > 0
                        ? "cursor-pointer"
                        : "cursor-default"
                    }
                    aria-label="View images"
                  >
                    <Avatar size="lg" className="rounded-md">
                      <AvatarImage src={images[0] || undefined} alt="" />
                      <AvatarFallback className="rounded-md">
                        {isRealEstate ? (
                          <Building2 className="size-5" />
                        ) : (
                          initials
                        )}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DialogTrigger>
                <DialogContent className="border-border bg-card sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">
                      {asset.name}
                    </DialogTitle>
                  </DialogHeader>
                  <Carousel>
                    <CarouselContent>
                      {images.map((src, index) => (
                        <CarouselItem key={index}>
                          <div className="relative aspect-square w-full overflow-hidden rounded-md">
                            {/* `unoptimized`: these are already client-resized
                                base64 data URIs (see `resizeImageToBase64` in
                                `lib/crop-image.ts`) — there's no remote asset
                                for Next's image optimizer to fetch/transform. */}
                            <Image
                              src={src}
                              alt={`${asset.name} ${index + 1}`}
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          </div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    {images.length > 1 && (
                      <>
                        <CarouselPrevious />
                        <CarouselNext />
                      </>
                    )}
                  </Carousel>
                </DialogContent>
              </Dialog>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-foreground">
                    {asset.name}
                  </h1>
                  {metadata.is_offplan && isRealEstate && (
                    <Badge variant="secondary">{t("off_plan")}</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {categoryName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-left sm:text-right">
                <p className="text-xs text-muted-foreground">
                  {isRealEstate ? t("net_equity") : t("value")}
                </p>
                <p
                  className={
                    asset.is_liability
                      ? "text-lg font-semibold text-destructive"
                      : "text-lg font-semibold text-foreground"
                  }
                >
                  {asset.is_liability ? "-" : ""}
                  {maskValue(currencyFormatter.format(netEquity))}
                </p>
              </div>
              <PrivacyToggleButton />
              {isRealEstate && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={t("refresh_from_adrec")}
                      disabled={isAdrecPending}
                    >
                      <CloudDownload
                        className={cn("size-4", isAdrecPending && "animate-pulse")}
                      />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="border-border bg-card">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-foreground">
                        {t("refresh_from_adrec")}
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-muted-foreground">
                        {t("refresh_from_adrec_notice")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isAdrecPending}>
                        {t("csv_cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        disabled={isAdrecPending}
                        onClick={handleRefreshFromAdrec}
                      >
                        {isAdrecPending ? t("adrec_fetching") : t("refresh_from_adrec")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {isRealEstate && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={t("refresh_from_dld")}
                      disabled={isDldPending}
                    >
                      <Landmark
                        className={cn("size-4", isDldPending && "animate-pulse")}
                      />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="border-border bg-card">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-foreground">
                        {t("refresh_from_dld")}
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-muted-foreground">
                        {t("refresh_from_dld_notice")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDldPending}>
                        {t("csv_cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        disabled={isDldPending}
                        onClick={handleRefreshFromDld}
                      >
                        {isDldPending ? t("dld_fetching") : t("refresh_from_dld")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {(isEquity || isCrypto) && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t(isEquity ? "refresh_from_finnhub" : "refresh_from_coingecko")}
                  title={t(isEquity ? "refresh_from_finnhub" : "refresh_from_coingecko")}
                  onClick={handleRefreshMarketPrice}
                  disabled={isMarketPricePending}
                >
                  <LineChart
                    className={cn("size-4", isMarketPricePending && "animate-pulse")}
                  />
                </Button>
              )}
              <Dialog open={refreshOpen} onOpenChange={setRefreshOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Refresh valuation"
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="border-border bg-card">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">
                      {t("refresh_valuation")}
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      {t("refresh_valuation_desc")}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleRefreshSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new_value">{t("new_market_value")}</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            {getCurrencySymbol(refreshCurrency)}
                          </span>
                          <Input
                            id="new_value"
                            type="number"
                            step="any"
                            min="0"
                            className="pl-12"
                            value={refreshValue}
                            onChange={(e) => setRefreshValue(e.target.value)}
                            required
                          />
                        </div>
                        <Select
                          value={refreshCurrency}
                          onValueChange={setRefreshCurrency}
                        >
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
                      {refreshCurrency !== asset.currency && (
                        <p className="text-xs text-muted-foreground">
                          {t("converted_note", { currency: asset.currency })}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="valuation_date">{t("valuation_date")}</Label>
                      <Input
                        id="valuation_date"
                        type="date"
                        max={new Date().toISOString().slice(0, 10)}
                        value={valuationDate}
                        onChange={(e) => setValuationDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("source")}</Label>
                      <Select
                        value={refreshSource}
                        onValueChange={(next) =>
                          setRefreshSource(next as typeof refreshSource)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">
                            {t("manual_entry")}
                          </SelectItem>
                          <SelectItem value="dari">DARI</SelectItem>
                          <SelectItem value="dubailand">
                            Dubai Land Department
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {refreshSource !== "manual" && (
                        <p className="text-xs text-muted-foreground">
                          {t("no_live_integration_note")}
                        </p>
                      )}
                    </div>
                    {refreshError && (
                      <p className="text-sm text-destructive" role="alert">
                        {refreshError}
                      </p>
                    )}
                    <DialogFooter>
                      <Button type="submit" disabled={isPending}>
                        {isPending ? t("saving") : t("save_valuation")}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {(adrecError || adrecMessage) && (
          <p
            className={
              adrecError
                ? "text-sm text-destructive"
                : "text-sm text-success"
            }
            role={adrecError ? "alert" : undefined}
          >
            {adrecError ?? adrecMessage}
          </p>
        )}

        {(dldError || dldMessage) && (
          <p
            className={
              dldError ? "text-sm text-destructive" : "text-sm text-success"
            }
            role={dldError ? "alert" : undefined}
          >
            {dldError ?? dldMessage}
          </p>
        )}

        {(isEquity || isCrypto) && (
          <div className="space-y-1">
            {(() => {
              const lastPrice = (equityMetadata ?? cryptoMetadata)?.last_unit_price ?? null;
              const lastPricedAt = formatLastPricedAt(
                (equityMetadata ?? cryptoMetadata)?.last_priced_at ?? null,
              );
              if (lastPrice == null) {
                return (
                  <p className="text-xs text-muted-foreground">
                    {t("no_market_price_yet")}
                  </p>
                );
              }
              return (
                <p className="text-xs text-muted-foreground">
                  {t("unit_price")}: {maskValue(currencyFormatter.format(lastPrice))}
                  {lastPricedAt && ` · ${t("last_updated")}: ${lastPricedAt}`}
                </p>
              );
            })()}
            {(marketPriceError || marketPriceMessage) && (
              <p
                className={
                  marketPriceError ? "text-sm text-destructive" : "text-sm text-success"
                }
                role={marketPriceError ? "alert" : undefined}
              >
                {marketPriceError ?? marketPriceMessage}
              </p>
            )}
          </div>
        )}

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">{t("tab_overview")}</TabsTrigger>
            <TabsTrigger value="analysis">{t("tab_analysis")}</TabsTrigger>
            <TabsTrigger value="settings">{t("tab_settings")}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">
                  {t("valuation_history")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("no_valuation_history")}
                  </p>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient
                            id="valueGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="var(--color-primary)"
                              stopOpacity={0.4}
                            />
                            <stop
                              offset="95%"
                              stopColor="var(--color-primary)"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--color-border)"
                        />
                        <XAxis
                          dataKey="date"
                          stroke="var(--color-muted-foreground)"
                          fontSize={12}
                          tickFormatter={formatChartDate}
                        />
                        <YAxis
                          stroke="var(--color-muted-foreground)"
                          fontSize={12}
                          tickFormatter={(v) =>
                            maskValue(currencyFormatter.format(v))
                          }
                          width={90}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--color-card)",
                            border: "1px solid var(--color-border)",
                            color: "var(--color-foreground)",
                          }}
                          labelFormatter={formatChartDate}
                          formatter={(value) =>
                            maskValue(currencyFormatter.format(Number(value)))
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          name="Market Value"
                          stroke="var(--color-primary)"
                          fill="url(#valueGradient)"
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="netEquity"
                          name="Net Equity"
                          stroke="var(--color-success)"
                          fill="transparent"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-border bg-card">
                <CardContent className="space-y-1 py-4">
                  <p className="text-xs text-muted-foreground">
                    {t("total_property_cost")}
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {totalCost != null
                      ? maskValue(currencyFormatter.format(totalCost))
                      : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("all_in_cost_basis")}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="space-y-1 py-4">
                  <p className="text-xs text-muted-foreground">
                    {t("unrealized_gain")}
                  </p>
                  <div className="flex w-full flex-wrap items-center gap-2">
                    <p
                      className={
                        unrealizedGain != null
                          ? unrealizedGain.amount >= 0
                            ? "text-lg font-semibold text-success"
                            : "text-lg font-semibold text-destructive"
                          : "text-lg font-semibold text-foreground"
                      }
                    >
                      {unrealizedGain != null
                        ? maskValue(
                            currencyFormatter.format(unrealizedGain.amount),
                          )
                        : "—"}
                    </p>
                    {unrealizedGain?.percent != null && (
                      <Badge
                        variant="secondary"
                        className={
                          unrealizedGain.amount >= 0
                            ? "whitespace-nowrap bg-success px-2 py-0.5 text-success-foreground"
                            : "whitespace-nowrap bg-destructive px-2 py-0.5 text-destructive-foreground"
                        }
                      >
                        {unrealizedGain.amount >= 0 ? "+" : ""}
                        {unrealizedGain.percent.toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("net_gain_vs_cost")}
                  </p>
                </CardContent>
              </Card>

              {cashInvestedToDate != null ? (
                <Card className="border-border bg-card">
                  <CardContent className="space-y-1 py-4">
                    <p className="text-xs text-muted-foreground">
                      {t("cash_invested_to_date")}
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {maskValue(currencyFormatter.format(cashInvestedToDate))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("paid_milestones_fees")}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-border bg-card">
                  <CardContent className="space-y-1 py-4">
                    <p className="text-xs text-muted-foreground">
                      {t("value_per_sqm")}
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {valuePerSqm != null
                        ? maskValue(currencyFormatter.format(valuePerSqm))
                        : "—"}
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card className="border-border bg-card">
                <CardContent className="space-y-1 py-4">
                  <p className="text-xs text-muted-foreground">{t("net_roi")}</p>
                  <p
                    className={
                      netROI != null
                        ? netROI >= 0
                          ? "text-lg font-semibold text-success"
                          : "text-lg font-semibold text-destructive"
                        : "text-lg font-semibold text-foreground"
                    }
                  >
                    {netROI != null
                      ? maskValue(`${netROI.toFixed(2)}%`)
                      : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("unrealized_gain_over_cost")}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-6">
            {!isRealEstate ? (
              <Card className="border-border bg-card">
                <CardContent className="py-6 text-sm text-muted-foreground">
                  {t("analysis_unavailable")}
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {t("market_performance")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <DetailField
                      label={t("price_per_sqm")}
                      value={
                        valuePerSqm != null
                          ? maskValue(currencyFormatter.format(valuePerSqm))
                          : null
                      }
                    />
                    <DetailField
                      label={t("estimated_market_value")}
                      value={maskValue(currencyFormatter.format(marketValuation))}
                    />
                    <DetailField
                      label={t("confidence_level")}
                      value={confidenceLevel}
                    />
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {t("gross_share")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-end justify-between gap-4">
                      <DetailField
                        label={t("ownership")}
                        value={maskValue(`${ownershipPercent}%`)}
                      />
                      <p className="text-lg font-semibold text-foreground">
                        {maskValue(currencyFormatter.format(grossShare))}
                      </p>
                    </div>
                    <ProgressBar
                      percent={ownershipPercent}
                      colorClassName="bg-primary"
                    />
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {t("net_share")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-end justify-between gap-4">
                      <DetailField
                        label={t("net_equity_share", {
                          percent: maskValue(`${equityRatio.toFixed(1)}%`),
                        })}
                        value={maskValue(currencyFormatter.format(netShare))}
                      />
                      {hasLoan ? (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {t("active_loan_balance")}
                          </p>
                          <p className="text-sm font-medium text-destructive">
                            {maskValue(
                              currencyFormatter.format(outstandingLoanBalance),
                            )}
                          </p>
                        </div>
                      ) : (
                        <AddAssetDialog
                          categories={categories}
                          asset={{
                            id: asset.id,
                            name: asset.name,
                            category_id: asset.category_id,
                            quantity: asset.quantity,
                            current_value: asset.current_value,
                            currency: asset.currency,
                            metadata: asset.metadata,
                            images: asset.images,
                            ticker_symbol: asset.ticker_symbol,
                            purchase_date: asset.purchase_date,
                          }}
                          trigger={
                            <Button type="button" variant="outline" size="sm">
                              {t("add_loan")}
                            </Button>
                          }
                        />
                      )}
                    </div>
                    <ProgressBar
                      percent={equityRatio}
                      colorClassName="bg-success"
                    />
                  </CardContent>
                </Card>

                {metadata.is_offplan && (
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-foreground">
                        {t("dld_project_status")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <DetailField
                        label={t("completion_percentage")}
                        value={
                          metadata.completion_percentage != null
                            ? `${metadata.completion_percentage}%`
                            : null
                        }
                      />
                      <DetailField
                        label={t("escrow_balance_status")}
                        value={metadata.escrow_balance_status}
                      />
                      <DetailField
                        label={t("latest_inspection_date")}
                        value={metadata.latest_inspection_date}
                      />
                    </CardContent>
                  </Card>
                )}

                {metadata.is_offplan && (
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-foreground">
                        {t("adrec_project_status")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                      <DetailField
                        label={t("completion_percentage")}
                        value={
                          metadata.adrec_completion_rate != null
                            ? `${metadata.adrec_completion_rate}%`
                            : null
                        }
                      />
                      <DetailField
                        label={t("escrow_balance_status")}
                        value={metadata.adrec_escrow_status}
                      />
                      <DetailField
                        label={t("adrec_construction_stage")}
                        value={metadata.adrec_construction_stage}
                      />
                      <DetailField
                        label={t("latest_inspection_date")}
                        value={metadata.adrec_inspection_date}
                      />
                    </CardContent>
                  </Card>
                )}

                {metadata.is_offplan && (
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-foreground">
                        {t("payment_milestones")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("milestone")}</TableHead>
                              <TableHead>{t("due_date")}</TableHead>
                              <TableHead className="text-right">
                                {t("amount")}
                              </TableHead>
                              <TableHead className="text-right">%</TableHead>
                              <TableHead className="text-right">
                                {t("status")}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {metadata.payment_schedule.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={5}
                                  className="text-center text-muted-foreground"
                                >
                                  {t("no_payment_milestones")}
                                </TableCell>
                              </TableRow>
                            ) : (
                              metadata.payment_schedule.map((milestone) => (
                                <TableRow key={milestone.id}>
                                  <TableCell className="text-foreground">
                                    {milestone.milestone || "—"}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {milestone.due_date || "—"}
                                  </TableCell>
                                  <TableCell className="text-right text-foreground">
                                    {maskValue(
                                      currencyFormatter.format(
                                        milestone.amount,
                                      ),
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground">
                                    {milestone.percentage}%
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Badge
                                      variant={
                                        milestone.status === "paid"
                                          ? "default"
                                          : "secondary"
                                      }
                                      className={
                                        milestone.status === "paid"
                                          ? "bg-success text-success-foreground"
                                          : undefined
                                      }
                                    >
                                      {milestone.status === "paid"
                                        ? t("paid")
                                        : t("pending")}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">
                  {t("asset_settings")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <AddAssetDialog
                  categories={categories}
                  asset={{
                    id: asset.id,
                    name: asset.name,
                    category_id: asset.category_id,
                    quantity: asset.quantity,
                    current_value: asset.current_value,
                    currency: asset.currency,
                    metadata: asset.metadata,
                    images: asset.images,
                    ticker_symbol: asset.ticker_symbol,
                    purchase_date: asset.purchase_date,
                  }}
                />
                <CsvImportDialog
                  assetId={asset.id}
                  currentValue={asset.current_value}
                  currency={asset.currency}
                />
                <DeleteAssetButton
                  id={asset.id}
                  onSuccess={() => router.push("/dashboard")}
                />
              </CardContent>
            </Card>

            {isRealEstate && (
              <>
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {t("core_property_details")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DetailField label={t("address")} value={metadata.address} />
                    <DetailField label={t("type")} value={metadata.propertyType} />
                    <DetailField
                      label={t("internal_area")}
                      value={
                        metadata.internal_area != null
                          ? `${metadata.internal_area} m²`
                          : null
                      }
                    />
                    <DetailField
                      label={t("terrace_area")}
                      value={
                        metadata.terrace_area != null
                          ? `${metadata.terrace_area} m²`
                          : null
                      }
                    />
                    <DetailField
                      label={t("total_area")}
                      value={
                        metadata.surfaceArea != null
                          ? `${metadata.surfaceArea} m²`
                          : null
                      }
                    />
                    <DetailField
                      label={t("year_of_construction")}
                      value={metadata.yearOfConstruction}
                    />
                    <DetailField
                      label={t("epc_rating")}
                      value={metadata.epcRating}
                    />
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {t("dld_identifiers")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {metadata.is_offplan ? (
                      <>
                        <DetailField
                          label={t("oqood_number")}
                          value={metadata.oqood_number}
                        />
                        <DetailField
                          label={t("project_number")}
                          value={metadata.project_number}
                        />
                        <DetailField
                          label={t("escrow_id")}
                          value={metadata.escrow_id}
                        />
                      </>
                    ) : (
                      <>
                        <DetailField
                          label={t("title_deed_number")}
                          value={metadata.title_deed_number}
                        />
                        <DetailField label={t("plot_id")} value={metadata.plot_id} />
                      </>
                    )}
                    <DetailField
                      label={t("community_id")}
                      value={metadata.community_id}
                    />
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {t("adrec_identifiers")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {metadata.is_offplan ? (
                      <>
                        <DetailField
                          label={t("adrec_project_id")}
                          value={metadata.adrec_project_id}
                        />
                        <DetailField
                          label={t("adrec_developer_id")}
                          value={metadata.adrec_developer_id}
                        />
                      </>
                    ) : (
                      <>
                        <DetailField
                          label={t("adrec_plot_number")}
                          value={metadata.adrec_plot_number}
                        />
                        <DetailField
                          label={t("adrec_unit_id")}
                          value={metadata.adrec_unit_id}
                        />
                        <DetailField
                          label={t("adrec_title_deed")}
                          value={metadata.adrec_title_deed}
                        />
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {t("material_condition_ratings")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DetailField
                      label={t("kitchen")}
                      value={metadata.condition.kitchen}
                    />
                    <DetailField
                      label={t("bathrooms")}
                      value={metadata.condition.bathrooms}
                    />
                    <DetailField
                      label={t("flooring")}
                      value={metadata.condition.flooring}
                    />
                    <DetailField
                      label={t("windows")}
                      value={metadata.condition.windows}
                    />
                    <DetailField
                      label={t("general")}
                      value={metadata.condition.general}
                    />
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {t("cost_fees_basis")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DetailField
                      label={
                        metadata.contract_price != null
                          ? t("contract_price")
                          : t("purchase_price")
                      }
                      value={
                        metadata.contract_price ?? metadata.purchasePrice
                          ? maskValue(
                              currencyFormatter.format(
                                (metadata.contract_price ??
                                  metadata.purchasePrice) as number,
                              ),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("registration_fee", {
                        type: metadata.registration_fee_type,
                      })}
                      value={
                        metadata.registration_fee_amount
                          ? maskValue(
                              currencyFormatter.format(
                                metadata.registration_fee_amount,
                              ),
                            )
                          : "—"
                      }
                    />
                    <DetailField
                      label={t("agency_fees")}
                      value={
                        metadata.agencyFees != null
                          ? maskValue(currencyFormatter.format(metadata.agencyFees))
                          : null
                      }
                    />
                    <DetailField
                      label={t("renovation_fees")}
                      value={
                        metadata.renovationFees != null
                          ? maskValue(
                              currencyFormatter.format(metadata.renovationFees),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("furnishing_fees")}
                      value={
                        metadata.furnishingFees != null
                          ? maskValue(
                              currencyFormatter.format(metadata.furnishingFees),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("transfer_trustee_fees")}
                      value={
                        metadata.transfer_trustee_fees != null
                          ? maskValue(
                              currencyFormatter.format(metadata.transfer_trustee_fees),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("agent_sales_progression_fees")}
                      value={
                        metadata.agent_sales_progression_fees != null
                          ? maskValue(
                              currencyFormatter.format(
                                metadata.agent_sales_progression_fees,
                              ),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("rera_title_deed_processing_fees")}
                      value={
                        metadata.rera_title_deed_processing_fees != null
                          ? maskValue(
                              currencyFormatter.format(
                                metadata.rera_title_deed_processing_fees,
                              ),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("rera_mortgage_registration_fees")}
                      value={
                        metadata.rera_mortgage_registration_fees != null
                          ? maskValue(
                              currencyFormatter.format(
                                metadata.rera_mortgage_registration_fees,
                              ),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("rera_knowledge_fee")}
                      value={
                        metadata.rera_knowledge_fee != null
                          ? maskValue(
                              currencyFormatter.format(metadata.rera_knowledge_fee),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("in_principle_bank_approval_fee")}
                      value={
                        metadata.in_principle_bank_approval_fee != null
                          ? maskValue(
                              currencyFormatter.format(
                                metadata.in_principle_bank_approval_fee,
                              ),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("property_valuation_fee")}
                      value={
                        metadata.property_valuation_fee != null
                          ? maskValue(
                              currencyFormatter.format(metadata.property_valuation_fee),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("bank_processing_fees")}
                      value={
                        metadata.bank_processing_fees != null
                          ? maskValue(
                              currencyFormatter.format(metadata.bank_processing_fees),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("yearly_insurance_fee")}
                      value={
                        metadata.yearly_insurance_fee != null
                          ? maskValue(
                              currencyFormatter.format(metadata.yearly_insurance_fee),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("total_property_cost")}
                      value={
                        totalCost != null
                          ? maskValue(currencyFormatter.format(totalCost))
                          : null
                      }
                    />
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {t("financing")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {hasLoan ? (
                      <div className="space-y-4">
                        <div className="flex items-end justify-between gap-4 border-b border-border pb-4">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">
                              {t("outstanding_loan_balance")}
                            </p>
                            <p className="text-lg font-semibold text-destructive">
                              {maskValue(
                                currencyFormatter.format(outstandingLoanBalance),
                              )}
                            </p>
                          </div>
                          {metadata.linked_loan.lender_name && (
                            <DetailField
                              label={t("lender_name")}
                              value={metadata.linked_loan.lender_name}
                            />
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                          <DetailField
                            label={t("principal")}
                            value={maskValue(
                              currencyFormatter.format(
                                metadata.linked_loan.amount ?? 0,
                              ),
                            )}
                          />
                          <DetailField
                            label={t("monthly_payment")}
                            value={
                              metadata.linked_loan.monthly_payment != null
                                ? maskValue(
                                    currencyFormatter.format(
                                      metadata.linked_loan.monthly_payment,
                                    ),
                                  )
                                : null
                            }
                          />
                          <DetailField
                            label={t("interest_rate")}
                            value={
                              metadata.linked_loan.interest_rate != null
                                ? `${metadata.linked_loan.interest_rate}%`
                                : null
                            }
                          />
                          <DetailField
                            label={t("duration")}
                            value={
                              metadata.linked_loan.duration_months != null
                                ? t("duration_months", {
                                    n: metadata.linked_loan.duration_months,
                                  })
                                : null
                            }
                          />
                          <DetailField
                            label={t("start_date")}
                            value={metadata.linked_loan.start_date}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("no_loan_attached")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {isVehicle && vehicleMetadata && (
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">
                    {t("vehicle_details")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DetailField label={t("make")} value={vehicleMetadata.make} />
                  <DetailField label={t("model")} value={vehicleMetadata.model} />
                  <DetailField
                    label={t("vehicle_year")}
                    value={vehicleMetadata.year}
                  />
                  <DetailField label={t("vin")} value={vehicleMetadata.vin} />
                </CardContent>
              </Card>
            )}

            {isPrivateEquity && privateEquityMetadata && (
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">
                    {t("private_equity_details")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DetailField
                    label={t("entity_name")}
                    value={privateEquityMetadata.entity_name}
                  />
                  <DetailField
                    label={t("share_class")}
                    value={privateEquityMetadata.share_class}
                  />
                  <DetailField
                    label={t("ownership_percentage")}
                    value={
                      privateEquityMetadata.ownership_percentage != null
                        ? maskValue(`${privateEquityMetadata.ownership_percentage}%`)
                        : null
                    }
                  />
                </CardContent>
              </Card>
            )}

            {isEquity && equityMetadata && (
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">
                    {t("equity_details")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <DetailField label={t("ticker_symbol")} value={asset.ticker_symbol} />
                  <DetailField label={t("exchange")} value={equityMetadata.exchange} />
                  <DetailField
                    label={t("shares_owned")}
                    value={maskValue(asset.quantity.toLocaleString())}
                  />
                  <DetailField
                    label={t("average_cost_basis")}
                    value={
                      avgCostBasis != null
                        ? maskValue(currencyFormatter.format(avgCostBasis))
                        : null
                    }
                  />
                  <DetailField
                    label={t("current_price")}
                    value={
                      equityMetadata.last_unit_price != null
                        ? maskValue(currencyFormatter.format(equityMetadata.last_unit_price))
                        : null
                    }
                  />
                  <DetailField
                    label={t("total_value")}
                    value={maskValue(currencyFormatter.format(asset.current_value))}
                  />
                  <DetailField
                    label={t("last_updated")}
                    value={formatLastPricedAt(equityMetadata.last_priced_at)}
                  />
                </CardContent>
              </Card>
            )}

            {isCrypto && cryptoMetadata && (
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">
                    {t("crypto_details")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DetailField label={t("ticker_symbol")} value={asset.ticker_symbol} />
                  <DetailField label={t("coingecko_id")} value={cryptoMetadata.coingecko_id} />
                  <DetailField
                    label={t("unit_price")}
                    value={
                      cryptoMetadata.last_unit_price != null
                        ? maskValue(currencyFormatter.format(cryptoMetadata.last_unit_price))
                        : null
                    }
                  />
                  <DetailField
                    label={t("last_updated")}
                    value={formatLastPricedAt(cryptoMetadata.last_priced_at)}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
