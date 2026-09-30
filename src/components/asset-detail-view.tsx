"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Building2, Car, CloudDownload, Download, FileText, Landmark, LineChart, Minus, RefreshCw } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AddAssetDialog } from "@/components/add-asset-dialog";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { TenancyContractDialog } from "@/components/tenancy-contract-dialog";
import { PropertyDocumentDialog } from "@/components/property-document-dialog";
import { DeleteAssetButton } from "@/components/delete-asset-button";
import { PrivacyToggleButton } from "@/components/privacy-toggle-button";
import { usePrivacy } from "@/context/privacy-context";
import { useLanguage } from "@/context/language-context";
import {
  getAdrecLiveValuation,
  getDldCertificate,
  type AdrecLiveValuationResult,
  type DldCertificate,
  refreshAdrecValuation,
  refreshDldValuation,
  refreshVehicleValuation,
  updateAssetValuation,
  addPropertyExpense,
  deletePropertyExpense,
  deleteTenancyContract,
  deleteAssetHistoryPoint,
} from "@/app/dashboard/actions";
import {
  calculateCashInvestedToDate,
  calculateEquity,
  calculateTotalCost,
  calculateUnrealizedGain,
  findActiveTenancyContract,
  parseRealEstateMetadata,
  resolveOutstandingLoanBalance,
  sumPropertyExpenses,
} from "@/lib/real-estate";
import {
  canAmortize,
  getOutstandingPrincipalAt,
  summarizeAmortization,
} from "@/lib/amortization";
import { calculateIrr, type DatedCashFlow } from "@/lib/irr";
import {
  averageAnnualCosts,
  buildProjection,
  cumulativeNetRentAt,
  estimateAnnualGrowth,
  estimateOffplanValueAt,
  type ProjectionPoint,
} from "@/lib/real-estate-analytics";
import {
  calculateVehicleDepreciation,
  calculateVehicleTotalCost,
  parseVehicleMetadata,
} from "@/lib/vehicles";
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

/** Maps `refreshVehicleValuation`'s `VehicleValuationErrorCode` to a localized message key, following the `DLD_ERROR_KEYS` lowercase-snake-case convention. */
const VEHICLE_VALUATION_ERROR_KEYS: Record<string, TranslationKey> = {
  invalid_request: "vehicle_valuation_error_invalid_request",
  not_found: "vehicle_valuation_error_not_found",
  rate_limited: "vehicle_valuation_error_rate_limited",
  provider_not_configured: "vehicle_valuation_error_provider_not_configured",
  invalid_response: "vehicle_valuation_error_invalid_response",
  timeout: "vehicle_valuation_error_timeout",
  network_error: "vehicle_valuation_error_network_error",
  under_development: "vehicle_valuation_under_development",
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
  const [liveValuation, setLiveValuation] = useState<AdrecLiveValuationResult | null>(null);
  const [isLivePending, startLiveTransition] = useTransition();
  const [marketPriceError, setMarketPriceError] = useState<string | null>(null);
  const [marketPriceMessage, setMarketPriceMessage] = useState<string | null>(null);
  const [isMarketPricePending, startMarketPriceTransition] = useTransition();
  const [dldError, setDldError] = useState<string | null>(null);
  const [dldMessage, setDldMessage] = useState<string | null>(null);
  const [isDldPending, startDldTransition] = useTransition();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [vehicleValuationError, setVehicleValuationError] = useState<string | null>(null);
  const [vehicleValuationMessage, setVehicleValuationMessage] = useState<string | null>(null);
  const [isVehicleValuationPending, startVehicleValuationTransition] = useTransition();
  const [tenancyMutationError, setTenancyMutationError] = useState<string | null>(null);
  const [isTenancyMutationPending, startTenancyMutationTransition] = useTransition();
  const [historyMutationError, setHistoryMutationError] = useState<string | null>(null);
  const [isHistoryMutationPending, startHistoryMutationTransition] = useTransition();
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseAmount, setExpenseAmount] = useState("");
  const [chartView, setChartView] = useState<"history" | "forward" | "both">("history");
  const [growthInput, setGrowthInput] = useState("");
  const [certOpen, setCertOpen] = useState(false);
  const [certificate, setCertificate] = useState<DldCertificate | null>(null);
  const [certError, setCertError] = useState<string | null>(null);
  const [isCertPending, startCertTransition] = useTransition();

  const categoryName = asset.asset_categories?.name ?? "—";
  const isRealEstate = categoryName === "Real Estate";
  const isVehicle = categoryName === "Vehicles";
  const isPrivateEquity = categoryName === "Private Equity";
  const isEquity = categoryName === "Equities";
  const isCrypto = categoryName === "Crypto";
  const metadata = parseRealEstateMetadata(asset.metadata);
  const vehicleMetadata = isVehicle ? parseVehicleMetadata(asset.metadata) : null;
  const vehicleTotalCost = vehicleMetadata
    ? calculateVehicleTotalCost(vehicleMetadata, asset.current_value)
    : null;
  const vehicleDepreciation = vehicleMetadata
    ? calculateVehicleDepreciation(asset.current_value, vehicleMetadata.purchase_price)
    : null;
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

  const today = new Date().toISOString().slice(0, 10);
  const loan = metadata.linked_loan;
  const loanIsAmortizable = isRealEstate && canAmortize(loan);

  const marketValuation = isRealEstate
    ? metadata.market_valuation ?? asset.current_value
    : asset.current_value;

  // Equity = current market value − outstanding loan balance. The loan
  // balance prefers the amortization engine's exact point-in-time figure
  // (`lib/amortization.ts`) over a manually-entered snapshot, so Equity
  // stays accurate without the user re-visiting this asset to update it.
  const outstandingLoanBalance = isRealEstate
    ? loanIsAmortizable
      ? getOutstandingPrincipalAt(loan, today)
      : resolveOutstandingLoanBalance(loan)
    : 0;
  const netEquity = isRealEstate
    ? calculateEquity(marketValuation, outstandingLoanBalance)
    : asset.current_value;

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
  const hasLoan = !!(loan.amount || loan.outstanding_principal);
  const amortizationSummary = loanIsAmortizable ? summarizeAmortization(loan, today) : null;

  // --- Tenancy / yield / IRR ---------------------------------------------

  function monthsBetween(from: string, to: string): number {
    const f = new Date(from + "T00:00:00Z");
    const toDate = new Date(to + "T00:00:00Z");
    return Math.max(
      0,
      (toDate.getUTCFullYear() - f.getUTCFullYear()) * 12 +
        (toDate.getUTCMonth() - f.getUTCMonth()),
    );
  }

  // The tenancy contract in effect today (a property is re-let contract
  // after contract — 2025-2026, then 2026-2027, etc. — see
  // `metadata.tenancy_contracts`), used for the rent figures below.
  const activeTenancyContract = isRealEstate
    ? findActiveTenancyContract(metadata.tenancy_contracts, today)
    : null;
  const rentStartDate = activeTenancyContract?.start_date || asset.purchase_date;
  // The monthly loan payment used for net rent prefers the amortization
  // engine's current installment (accurate under a hybrid rate) over the
  // manually-entered `monthly_payment`.
  const currentInstallment = amortizationSummary
    ? amortizationSummary.schedule.find((entry) => entry.date > today)
    : null;
  const monthlyLoanPayment = hasLoan
    ? currentInstallment?.paymentAmount ?? loan.monthly_payment ?? 0
    : 0;
  const monthlyGrossRent = activeTenancyContract?.annual_rent
    ? activeTenancyContract.annual_rent / 12
    : 0;
  // Net rent counts only the loan's INTEREST as a cost, never principal
  // repayments (those build equity, already captured by Unrealized Gain /
  // Equity) — subtracting the whole installment double-counted it and made
  // Net Profit hugely negative. `monthlyCashFlow` (rent minus the full
  // installment) is what actually leaves the bank each month and is what the
  // IRR below needs, since its terminal value is Equity.
  const amortSchedule = amortizationSummary?.schedule ?? [];
  const monthlyInterest = hasLoan
    ? (currentInstallment?.interestAmount ??
      (loan.interest_rate != null
        ? (outstandingLoanBalance * loan.interest_rate) / 100 / 12
        : 0))
    : 0;
  const monthlyNetRent = monthlyGrossRent - monthlyInterest;
  const monthlyCashFlow = monthlyGrossRent - monthlyLoanPayment;
  const monthsOfTenancy = rentStartDate ? monthsBetween(rentStartDate, today) : 0;
  // Logged property expenses (`metadata.property_expenses`) accumulate as a
  // dated ledger rather than one flat "monthly" figure.
  const totalPropertyExpenses = sumPropertyExpenses(metadata.property_expenses);
  // Rent received across EVERY tenancy contract (not just the active one),
  // less loan interest during tenancy months and all logged expenses.
  const rentalToDate = cumulativeNetRentAt({
    contracts: metadata.tenancy_contracts,
    schedule: amortSchedule,
    expenses: metadata.property_expenses,
    date: today,
    flatMonthlyInterest: monthlyInterest,
  });
  const netProfitWithRent =
    unrealizedGain != null ? unrealizedGain.amount + rentalToDate.net : null;

  // Property-level IRR: initial outlay is the full cost basis, cash flows in
  // between are the monthly net rent (already net of loan payments) plus
  // every logged property expense on its actual date, and the terminal cash
  // flow is today's Equity — the appreciation and rental yield combined
  // into a single annualized return.
  const irrCashFlows: DatedCashFlow[] = [];
  if (isRealEstate && totalCost != null && asset.purchase_date) {
    irrCashFlows.push({ date: asset.purchase_date, amount: -totalCost });
    if (rentStartDate && monthlyCashFlow !== 0) {
      for (let m = 1; m <= monthsOfTenancy; m++) {
        const d = new Date(rentStartDate + "T00:00:00Z");
        d.setUTCMonth(d.getUTCMonth() + m);
        irrCashFlows.push({ date: d.toISOString().slice(0, 10), amount: monthlyCashFlow });
      }
    }
    for (const expense of metadata.property_expenses) {
      if (expense.date) irrCashFlows.push({ date: expense.date, amount: -expense.amount });
    }
    irrCashFlows.push({ date: today, amount: netEquity });
  }
  const propertyIrr = irrCashFlows.length > 0 ? calculateIrr(irrCashFlows) : null;
  const sortedTenancyContracts = [...metadata.tenancy_contracts].sort((a, b) =>
    b.start_date.localeCompare(a.start_date),
  );
  const sortedPropertyExpenses = [...metadata.property_expenses].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  function tenancyPeriodLabel(startDate: string, endDate: string): string {
    const startYear = startDate ? startDate.slice(0, 4) : "";
    const endYear = endDate ? endDate.slice(0, 4) : "";
    if (startYear && endYear && startYear !== endYear) return `${startYear} – ${endYear}`;
    return startYear || endYear || t("tenancy_period_unknown");
  }

  const initials = categoryName !== "—" ? categoryName[0].toUpperCase() : "?";

  const sortedHistoryRaw = [...history].sort((a, b) =>
    a.recorded_date.localeCompare(b.recorded_date),
  );

  // Off-plan: the auto-generated milestone points were stored as cash paid
  // (installments + fees), which made the log/graph just mirror payments.
  // Present them as the unit's estimated market value instead (contract
  // price drifting toward today's valuation — see `estimateOffplanValueAt`),
  // with Equity = that value minus what is still owed to the developer.
  // Only auto-generated (`manual`) points on a milestone date are touched;
  // anything else (DLD/ADREC/user valuations) is shown as recorded.
  const offplanMilestoneDates = new Set(
    metadata.payment_schedule.filter((m) => m.due_date).map((m) => m.due_date),
  );
  const offplanStartDate = [...offplanMilestoneDates].sort()[0];
  const sortedHistory =
    isRealEstate && metadata.is_offplan && offplanStartDate
      ? sortedHistoryRaw.map((h) => {
          if (
            h.source !== "manual" ||
            !offplanMilestoneDates.has(h.recorded_date) ||
            h.recorded_date >= today
          ) {
            return h;
          }
          const contractPrice =
            metadata.contract_price ?? metadata.purchasePrice ?? marketValuation;
          const value = estimateOffplanValueAt({
            contractPrice,
            startDate: offplanStartDate,
            currentMarketValue: marketValuation,
            snapshotDate: today,
            date: h.recorded_date,
          });
          const paid = metadata.payment_schedule
            .filter((m) => m.status === "paid" && m.due_date <= h.recorded_date)
            .reduce((sum, m) => sum + m.amount, 0);
          return { ...h, value, net_equity: value - Math.max(0, contractPrice - paid) };
        })
      : sortedHistoryRaw;

  // Newest-first for the deletable "Valuation Log" table below the chart —
  // the point someone wants to erase (a bad refresh) is almost always the
  // most recent one.
  const historyLogEntries = [...sortedHistory].reverse();

  // Real Estate: the curve should never show a valuation predating the
  // purchase — drop anything earlier, and pin whatever lands on the purchase
  // date itself to the actual market value at purchase (not the cost basis —
  // see below), synthesizing that point if none is stored there yet. Only
  // done for standard (non-off-plan) purchases: an off-plan property's
  // earliest point is its down-payment milestone, which is already a more
  // accurate anchor than the full contract price (not yet paid at signing).
  // Falls back to the earliest available history point when `purchase_date`
  // is missing (e.g. an asset saved before it became a mandatory field).
  const purchaseAnchorDate =
    isRealEstate && asset.purchase_date ? asset.purchase_date : null;

  // Day 1's Market Value is the actual purchase/contract price — NOT the
  // all-in cost basis (price + fees). That gap is exactly what the
  // Unrealized Gain / Net Profit card measures, so Day 1 must show that gain
  // as an immediate negative hit (e.g. a 3,400,000 purchase with 226,620 of
  // acquisition fees shows a Day 1 Net Profit of -226,620), not zero.
  const purchaseAnchorValue = metadata.contract_price ?? metadata.purchasePrice ?? marketValuation;

  let displayHistory = sortedHistory;
  if (purchaseAnchorDate) {
    displayHistory = sortedHistory.filter(
      (h) => h.recorded_date >= purchaseAnchorDate,
    );
    if (!metadata.is_offplan) {
      const anchorPoint: AssetHistoryPoint = {
        id: "purchase-anchor",
        recorded_date: purchaseAnchorDate,
        value: purchaseAnchorValue,
        net_equity: null, // recomputed below via the amortization engine
        source: "manual",
      };
      const hasAnchorPoint = displayHistory.some(
        (h) => h.recorded_date === purchaseAnchorDate,
      );
      displayHistory = hasAnchorPoint
        ? displayHistory.map((h) =>
            h.recorded_date === purchaseAnchorDate
              ? { ...h, value: purchaseAnchorValue }
              : h,
          )
        : [anchorPoint, ...displayHistory];
    }
  }

  // Equity per point on the graph = that point's Market Value minus the
  // loan's exact outstanding principal on that date, from the amortization
  // engine (`lib/amortization.ts`) — rather than trusting each history row's
  // stored `net_equity`, which only ever reflected a manually-updated
  // balance snapshot frozen at whichever date it was recorded.
  const chartData = displayHistory.map((h) => {
    const loanBalance = loanIsAmortizable
      ? getOutstandingPrincipalAt(loan, h.recorded_date)
      : null;
    const rentalAtPoint = isRealEstate
      ? cumulativeNetRentAt({
          contracts: metadata.tenancy_contracts,
          schedule: amortSchedule,
          expenses: metadata.property_expenses,
          date: h.recorded_date,
          flatMonthlyInterest: monthlyInterest,
        })
      : null;
    return {
      date: h.recorded_date,
      value: h.value,
      netEquity: loanBalance != null ? calculateEquity(h.value, loanBalance) : h.net_equity ?? h.value,
      // Net Profit at each point = that point's Market Value minus the (fixed)
      // all-in cost basis — so Day 1 immediately shows the negative hit of the
      // acquisition fees, not zero.
      netProfit: totalCost != null ? h.value - totalCost : null,
      // The loan's exact outstanding principal on this date — plotted
      // alongside Equity so the two can be visually cross-checked
      // (Equity = Market Value − Loan Balance at every point).
      loanBalance,
      // Total Return = Unrealized Gain + cumulative net rent up to this
      // point (rent received − loan interest − logged expenses).
      totalReturn:
        totalCost != null && rentalAtPoint
          ? h.value - totalCost + rentalAtPoint.net
          : null,
    };
  });

  // 20-year forward projection (Real Estate) — see `buildProjection`.
  const growthEstimate = estimateAnnualGrowth(
    chartData.map((p) => ({ date: p.date, value: p.value })),
  );
  const growthParsed = growthInput.trim() !== "" ? Number(growthInput) : Number.NaN;
  const growthRate = Number.isFinite(growthParsed) ? growthParsed / 100 : growthEstimate.rate;
  const annualCosts = isRealEstate
    ? averageAnnualCosts(metadata, asset.purchase_date, today)
    : 0;
  const projection: ProjectionPoint[] =
    isRealEstate && totalCost != null
      ? buildProjection({
          today,
          marketValue: marketValuation,
          growthRate,
          totalCost,
          loan,
          schedule: amortSchedule,
          annualRent: activeTenancyContract?.annual_rent ?? 0,
          annualCosts,
          baseCumulativeNetRent: rentalToDate.net,
          hasLoan,
        })
      : [];
  const showHistory = !isRealEstate || chartView !== "forward";
  const showForward = isRealEstate && chartView !== "history";
  const combinedChartData = [
    ...(showHistory
      ? chartData.map((p) => ({ ...p, ts: new Date(p.date).getTime() }))
      : []),
    ...(showForward
      ? projection.map((p) => ({ ...p, ts: new Date(p.date).getTime() }))
      : []),
  ];

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

  function formatChartTimestamp(ts: unknown): string {
    const n = Number(ts);
    return Number.isFinite(n) ? formatChartDate(new Date(n).toISOString().slice(0, 10)) : "";
  }

  function handleViewCertificate() {
    setCertError(null);
    if (!metadata.title_deed_number || !metadata.plot_id) {
      setCertError(t("dld_certificate_missing_ids"));
      return;
    }
    startCertTransition(async () => {
      const result = await getDldCertificate(asset.id);
      if (!result.ok) {
        setCertError(result.error);
        return;
      }
      setCertificate(result.certificate);
      setCertOpen(true);
    });
  }

  function downloadCertificate(c: DldCertificate) {
    const lines = [
      "DUBAI LAND DEPARTMENT — SMART VALUATION CERTIFICATE",
      c.isMock ? "*** SAMPLE DATA — NOT AN OFFICIAL DOCUMENT ***" : "",
      "",
      `Reference:         ${c.reference}`,
      `Property:          ${c.propertyName}`,
      `Title Deed Number: ${c.titleDeedNumber}`,
      `Plot ID:           ${c.plotId}`,
      `Valuation:         ${c.currency} ${c.valuationAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `Valuation date:    ${c.valuationDate}`,
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${c.reference}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function formatChartDate(isoDate: unknown): string {
    if (typeof isoDate !== "string") return String(isoDate ?? "");
    const parsed = new Date(isoDate);
    return Number.isNaN(parsed.getTime())
      ? isoDate
      : axisDateFormatter.format(parsed);
  }

  function handleFetchLiveValuation() {
    startLiveTransition(async () => {
      setLiveValuation(await getAdrecLiveValuation(asset.id));
    });
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

      const persistResult = await refreshMarketPrice(asset.id, result.unitPrice, result.source, {
        currency: result.currency,
        openPrice: result.openPrice,
        previousClose: result.previousClose,
        dayChangePct: result.dayChangePct,
        exchange: result.exchange,
      });
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

  function handleRefreshVehicleValuation() {
    setVehicleValuationError(null);
    setVehicleValuationMessage(null);

    startVehicleValuationTransition(async () => {
      const result = await refreshVehicleValuation(asset.id);

      if (!result.ok) {
        const key =
          VEHICLE_VALUATION_ERROR_KEYS[result.code ?? ""] ??
          "vehicle_valuation_error_network_error";
        setVehicleValuationError(t(key));
        return;
      }

      setVehicleValuationMessage(
        t("vehicle_valuation_updated", {
          value: currencyFormatter.format(result.value),
          provider: t(result.provider === "autobiz" ? "provider_autobiz" : "provider_la_centrale"),
        }),
      );
    });
  }

  function handleDeleteHistoryPoint(historyId: string) {
    setHistoryMutationError(null);
    startHistoryMutationTransition(async () => {
      const result = await deleteAssetHistoryPoint(asset.id, historyId);
      if (result?.error) setHistoryMutationError(result.error);
    });
  }

  function handleDeleteTenancyContract(contractId: string) {
    setTenancyMutationError(null);
    startTenancyMutationTransition(async () => {
      const result = await deleteTenancyContract(asset.id, contractId);
      if (result?.error) setTenancyMutationError(result.error);
    });
  }

  function handleAddPropertyExpense(e: React.FormEvent) {
    e.preventDefault();
    setTenancyMutationError(null);

    const amount = Number(expenseAmount);
    if (!expenseDescription.trim() || !expenseDate || !Number.isFinite(amount)) {
      setTenancyMutationError(t("property_expense_invalid"));
      return;
    }

    startTenancyMutationTransition(async () => {
      const result = await addPropertyExpense(asset.id, {
        description: expenseDescription.trim(),
        date: expenseDate,
        amount,
      });
      if (result?.error) {
        setTenancyMutationError(result.error);
        return;
      }
      setExpenseDescription("");
      setExpenseAmount("");
    });
  }

  function handleDeletePropertyExpense(expenseId: string) {
    setTenancyMutationError(null);
    startTenancyMutationTransition(async () => {
      const result = await deletePropertyExpense(asset.id, expenseId);
      if (result?.error) setTenancyMutationError(result.error);
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
    <div className="w-full px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("back_to_portfolio")}
      </Link>

      <div className="w-full space-y-6">
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
              {isRealEstate && metadata.emirate === "abu_dhabi" && (
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
              {isRealEstate && metadata.emirate !== "abu_dhabi" && (
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
              {isVehicle && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={t("refresh_vehicle_valuation")}
                      disabled={isVehicleValuationPending}
                    >
                      <Car
                        className={cn("size-4", isVehicleValuationPending && "animate-pulse")}
                      />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="border-border bg-card">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-foreground">
                        {t("refresh_vehicle_valuation")}
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-muted-foreground">
                        {t("refresh_vehicle_valuation_notice")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isVehicleValuationPending}>
                        {t("csv_cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        disabled={isVehicleValuationPending}
                        onClick={handleRefreshVehicleValuation}
                      >
                        {isVehicleValuationPending
                          ? t("dld_fetching")
                          : t("refresh_vehicle_valuation")}
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

        {isRealEstate && metadata.emirate === "abu_dhabi" && !metadata.is_offplan && (
          <div className="space-y-2 rounded-md border border-border bg-muted p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">
                {t("adrec_live_valuation")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleFetchLiveValuation}
                disabled={isLivePending}
              >
                <CloudDownload className={cn("size-4", isLivePending && "animate-pulse")} />
                {isLivePending ? t("adrec_fetching") : t("adrec_live_valuation_fetch")}
              </Button>
            </div>
            {liveValuation?.ok === false && (
              <p className="text-sm text-destructive" role="alert">
                {t(
                  ADREC_ERROR_KEYS[liveValuation.code.toUpperCase()] ??
                    "adrec_error_network_error",
                )}
              </p>
            )}
            {liveValuation?.ok === true && (
              <div className="space-y-1">
                <p className="text-2xl font-semibold text-foreground">
                  {maskValue(currencyFormatter.format(liveValuation.data.market_valuation))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("adrec_live_valuation_meta", {
                    date: liveValuation.data.valuation_date,
                    ref: liveValuation.data.certificate_id,
                  })}
                  {liveValuation.isMock && ` · ${t("adrec_live_valuation_mock")}`}
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("adrec_live_valuation_note")}</p>
          </div>
        )}

        {isRealEstate && metadata.emirate !== "abu_dhabi" && !metadata.is_offplan && (
          <div className="space-y-2 rounded-md border border-border bg-muted p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FileText className="size-4 text-muted-foreground" />
                {t("dld_certificate")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleViewCertificate}
                disabled={isCertPending}
              >
                {isCertPending ? t("dld_fetching") : t("dld_certificate_view")}
              </Button>
            </div>
            <p className="text-xs font-medium text-foreground">
              {t("dld_certificate_how_title")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("dld_certificate_how_live")} {t("dld_certificate_how_mock")}
            </p>
            {certError && (
              <p className="text-sm text-destructive" role="alert">
                {certError}
              </p>
            )}
          </div>
        )}

        <Dialog open={certOpen} onOpenChange={setCertOpen}>
          <DialogContent className="border-border bg-background sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground">{t("dld_certificate")}</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {certificate?.isMock
                  ? t("dld_certificate_sample_badge")
                  : t("dld_certificate_how_live")}
              </DialogDescription>
            </DialogHeader>
            {certificate && (
              <div className="space-y-3">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">{t("dld_certificate_reference")}</dt>
                  <dd className="font-mono text-foreground">{certificate.reference}</dd>
                  <dt className="text-muted-foreground">{t("dld_certificate_property")}</dt>
                  <dd className="text-foreground">{certificate.propertyName}</dd>
                  <dt className="text-muted-foreground">{t("dld_certificate_deed")}</dt>
                  <dd className="text-foreground">{certificate.titleDeedNumber}</dd>
                  <dt className="text-muted-foreground">{t("dld_certificate_plot")}</dt>
                  <dd className="text-foreground">{certificate.plotId}</dd>
                  <dt className="text-muted-foreground">{t("dld_certificate_amount")}</dt>
                  <dd className="font-semibold text-foreground">
                    {maskValue(currencyFormatter.format(certificate.valuationAmount))}
                  </dd>
                  <dt className="text-muted-foreground">{t("dld_certificate_date")}</dt>
                  <dd className="text-foreground">{certificate.valuationDate}</dd>
                </dl>
                <p className="text-xs text-muted-foreground">
                  {certificate.isMock
                    ? t("dld_certificate_how_mock")
                    : t("dld_certificate_how_live")}
                </p>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => certificate && downloadCertificate(certificate)}
                disabled={!certificate}
              >
                <Download className="size-4" />
                {t("dld_certificate_download")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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

        {(vehicleValuationError || vehicleValuationMessage) && (
          <p
            className={
              vehicleValuationError ? "text-sm text-destructive" : "text-sm text-success"
            }
            role={vehicleValuationError ? "alert" : undefined}
          >
            {vehicleValuationError ?? vehicleValuationMessage}
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
            {isRealEstate && (
              <TabsTrigger value="tenancy">{t("tab_tenancy")}</TabsTrigger>
            )}
            <TabsTrigger value="settings">{t("tab_settings")}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card className="border-border bg-card">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-foreground">
                  {t("valuation_history")}
                </CardTitle>
                {isRealEstate && (
                  <div className="flex flex-wrap items-center gap-3">
                    {showForward && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor="growth-rate" className="text-xs text-muted-foreground">
                          {t("growth_assumption")}
                        </Label>
                        <Input
                          id="growth-rate"
                          type="number"
                          step="0.1"
                          className="h-8 w-20"
                          placeholder={(growthEstimate.rate * 100).toFixed(1)}
                          value={growthInput}
                          onChange={(e) => setGrowthInput(e.target.value)}
                        />
                      </div>
                    )}
                    <Tabs
                      value={chartView}
                      onValueChange={(next) => setChartView(next as typeof chartView)}
                    >
                      <TabsList>
                        <TabsTrigger value="history">{t("chart_view_history")}</TabsTrigger>
                        <TabsTrigger value="forward">{t("chart_view_forward")}</TabsTrigger>
                        <TabsTrigger value="both">{t("chart_view_both")}</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {combinedChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("no_valuation_history")}
                  </p>
                ) : (
                  <div className={cn("w-full", isRealEstate ? "h-80" : "h-64")}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={combinedChartData}>
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
                          dataKey="ts"
                          type="number"
                          scale="time"
                          domain={["dataMin", "dataMax"]}
                          stroke="var(--color-muted-foreground)"
                          fontSize={12}
                          tickFormatter={formatChartTimestamp}
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
                          labelFormatter={formatChartTimestamp}
                          formatter={(value) =>
                            maskValue(currencyFormatter.format(Number(value)))
                          }
                        />
                        {isRealEstate && <Legend wrapperStyle={{ fontSize: 12 }} />}
                        {showHistory && (
                          <>
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
                              name={t("equity")}
                              stroke="var(--color-success)"
                              fill="transparent"
                              strokeWidth={2}
                            />
                            {isRealEstate && (
                              <Area
                                type="monotone"
                                dataKey="netProfit"
                                name={t("unrealized_gain")}
                                stroke="var(--color-destructive)"
                                fill="transparent"
                                strokeWidth={2}
                                strokeDasharray="4 4"
                              />
                            )}
                            {loanIsAmortizable && (
                              <Area
                                type="monotone"
                                dataKey="loanBalance"
                                name={t("outstanding_loan_balance")}
                                stroke="var(--color-chart-4)"
                                fill="transparent"
                                strokeWidth={2}
                                strokeDasharray="2 3"
                              />
                            )}
                            {isRealEstate && (
                              <Area
                                type="monotone"
                                dataKey="totalReturn"
                                name={t("total_return")}
                                stroke="var(--color-chart-5)"
                                fill="transparent"
                                strokeWidth={2}
                                strokeDasharray="8 2 2 2"
                              />
                            )}
                          </>
                        )}
                        {showForward && (
                          <>
                            <Area
                              type="monotone"
                              dataKey="pValue"
                              name={`Market Value ${t("projected_suffix")}`}
                              stroke="var(--color-primary)"
                              strokeOpacity={0.7}
                              fill="transparent"
                              strokeWidth={2}
                              strokeDasharray="10 6"
                            />
                            <Area
                              type="monotone"
                              dataKey="pNetEquity"
                              name={`${t("equity")} ${t("projected_suffix")}`}
                              stroke="var(--color-success)"
                              strokeOpacity={0.7}
                              fill="transparent"
                              strokeWidth={2}
                              strokeDasharray="10 6"
                            />
                            <Area
                              type="monotone"
                              dataKey="pNetProfit"
                              name={`${t("unrealized_gain")} ${t("projected_suffix")}`}
                              stroke="var(--color-destructive)"
                              strokeOpacity={0.7}
                              fill="transparent"
                              strokeWidth={2}
                              strokeDasharray="10 6"
                            />
                            {hasLoan && (
                              <Area
                                type="monotone"
                                dataKey="pLoanBalance"
                                name={`${t("outstanding_loan_balance")} ${t("projected_suffix")}`}
                                stroke="var(--color-chart-4)"
                                strokeOpacity={0.7}
                                fill="transparent"
                                strokeWidth={2}
                                strokeDasharray="10 6"
                              />
                            )}
                            <Area
                              type="monotone"
                              dataKey="pTotalReturn"
                              name={`${t("total_return")} ${t("projected_suffix")}`}
                              stroke="var(--color-chart-5)"
                              strokeOpacity={0.7}
                              fill="transparent"
                              strokeWidth={2}
                              strokeDasharray="10 6"
                            />
                          </>
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {showForward && (
                  <p className="text-xs text-muted-foreground">
                    {t("projection_note", {
                      rate: (growthRate * 100).toFixed(1),
                      source:
                        Number.isFinite(growthParsed)
                          ? t("growth_assumption")
                          : growthEstimate.source === "history"
                            ? t("growth_source_history")
                            : t("growth_source_assumed"),
                      costs: currencyFormatter.format(annualCosts),
                    })}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">{t("valuation_log")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("valuation_log_notice")}
                </p>
                {historyMutationError && (
                  <p className="text-sm text-destructive" role="alert">
                    {historyMutationError}
                  </p>
                )}
                {historyLogEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("no_valuation_log_entries")}
                  </p>
                ) : (
                  <div className="border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("date")}</TableHead>
                          <TableHead>{t("source")}</TableHead>
                          <TableHead className="text-right">{t("amount")}</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyLogEntries.map((point) => (
                          <TableRow key={point.id}>
                            <TableCell className="text-muted-foreground">
                              {point.recorded_date}
                            </TableCell>
                            <TableCell className="text-foreground">{point.source}</TableCell>
                            <TableCell className="text-right text-foreground">
                              {maskValue(currencyFormatter.format(point.value))}
                            </TableCell>
                            <TableCell>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    aria-label={t("delete")}
                                    disabled={isHistoryMutationPending}
                                  >
                                    <Minus className="size-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="border-border bg-card">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="text-foreground">
                                      {t("delete_valuation_point_title")}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription className="text-muted-foreground">
                                      {t("delete_valuation_point_desc")}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t("csv_cancel")}</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteHistoryPoint(point.id)}
                                    >
                                      {t("delete")}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {isRealEstate && (
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
            )}

            {isVehicle && vehicleMetadata && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="border-border bg-card">
                  <CardContent className="space-y-1 py-4">
                    <p className="text-xs text-muted-foreground">
                      {t("total_cost_of_ownership")}
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {vehicleTotalCost != null
                        ? maskValue(currencyFormatter.format(vehicleTotalCost))
                        : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("all_in_cost_basis")}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardContent className="space-y-1 py-4">
                    <p className="text-xs text-muted-foreground">{t("mileage")}</p>
                    <p className="text-lg font-semibold text-foreground">
                      {vehicleMetadata.mileage != null
                        ? maskValue(`${vehicleMetadata.mileage.toLocaleString()} km`)
                        : "—"}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardContent className="space-y-1 py-4">
                    <p className="text-xs text-muted-foreground">
                      {t("depreciation_vs_purchase")}
                    </p>
                    <div className="flex w-full flex-wrap items-center gap-2">
                      <p
                        className={
                          vehicleDepreciation != null
                            ? vehicleDepreciation.amount <= 0
                              ? "text-lg font-semibold text-success"
                              : "text-lg font-semibold text-destructive"
                            : "text-lg font-semibold text-foreground"
                        }
                      >
                        {vehicleDepreciation != null
                          ? maskValue(currencyFormatter.format(vehicleDepreciation.amount))
                          : "—"}
                      </p>
                      {vehicleDepreciation?.percent != null && (
                        <Badge
                          variant="secondary"
                          className={
                            vehicleDepreciation.amount <= 0
                              ? "whitespace-nowrap bg-success px-2 py-0.5 text-success-foreground"
                              : "whitespace-nowrap bg-destructive px-2 py-0.5 text-destructive-foreground"
                          }
                        >
                          {vehicleDepreciation.percent.toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
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

                {metadata.is_offplan && metadata.emirate !== "abu_dhabi" && (
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

                {metadata.is_offplan && metadata.emirate === "abu_dhabi" && (
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

          {isRealEstate && (
            <TabsContent value="tenancy" className="space-y-6">
              {tenancyMutationError && (
                <p className="text-sm text-destructive" role="alert">
                  {tenancyMutationError}
                </p>
              )}

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">{t("tenancy_contracts")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sortedTenancyContracts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("no_tenancy_contracts")}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {sortedTenancyContracts.map((contract) => (
                        <div
                          key={contract.id}
                          className="w-full min-w-0 space-y-3 border border-border p-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="secondary">
                              {tenancyPeriodLabel(contract.start_date, contract.end_date)}
                            </Badge>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon-sm"
                                  aria-label={t("delete")}
                                  disabled={isTenancyMutationPending}
                                >
                                  <Minus className="size-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="border-border bg-card">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-foreground">
                                    {t("delete_tenancy_contract_title")}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-muted-foreground">
                                    {t("delete_tenancy_contract_desc")}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("csv_cancel")}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteTenancyContract(contract.id)}
                                  >
                                    {t("delete")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <DetailField label={t("tenant_name")} value={contract.tenant_name} />
                            <DetailField
                              label={t("tenancy_start_date")}
                              value={contract.start_date}
                            />
                            <DetailField
                              label={t("tenancy_end_date")}
                              value={contract.end_date}
                            />
                            <DetailField
                              label={t("annual_rent")}
                              value={
                                contract.annual_rent != null
                                  ? maskValue(currencyFormatter.format(contract.annual_rent))
                                  : null
                              }
                            />
                            <DetailField
                              label={t("tenancy_contract_value")}
                              value={
                                contract.contract_value != null
                                  ? maskValue(
                                      currencyFormatter.format(contract.contract_value),
                                    )
                                  : null
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <TenancyContractDialog assetId={asset.id} />
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">{t("property_expenses")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sortedPropertyExpenses.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("no_property_expenses")}
                    </p>
                  ) : (
                    <div className="border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("description")}</TableHead>
                            <TableHead>{t("date")}</TableHead>
                            <TableHead className="text-right">{t("amount")}</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedPropertyExpenses.map((expense) => (
                            <TableRow key={expense.id}>
                              <TableCell className="text-foreground">
                                {expense.description}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {expense.date}
                              </TableCell>
                              <TableCell className="text-right text-foreground">
                                {maskValue(currencyFormatter.format(expense.amount))}
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon-sm"
                                  aria-label={t("delete")}
                                  disabled={isTenancyMutationPending}
                                  onClick={() => handleDeletePropertyExpense(expense.id)}
                                >
                                  <Minus className="size-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {t("total_property_expenses")}:{" "}
                    <span className="font-medium text-foreground">
                      {maskValue(currencyFormatter.format(totalPropertyExpenses))}
                    </span>
                  </p>

                  <form
                    onSubmit={handleAddPropertyExpense}
                    className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-4 sm:items-end"
                  >
                    <div className="min-w-0 space-y-1 sm:col-span-2">
                      <Label className="text-xs">{t("description")}</Label>
                      <Input
                        value={expenseDescription}
                        onChange={(e) => setExpenseDescription(e.target.value)}
                        placeholder={t("property_expense_description_placeholder")}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <Label className="text-xs">{t("date")}</Label>
                      <Input
                        type="date"
                        value={expenseDate}
                        onChange={(e) => setExpenseDate(e.target.value)}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <Label className="text-xs">{t("amount")}</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={expenseAmount}
                        onChange={(e) => setExpenseAmount(e.target.value)}
                      />
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      className="sm:col-span-4 sm:w-fit"
                      disabled={isTenancyMutationPending}
                    >
                      {t("add_property_expense")}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">{t("rental_yield")}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <DetailField
                    label={t("monthly_gross_rent")}
                    value={maskValue(currencyFormatter.format(monthlyGrossRent))}
                  />
                  <DetailField
                    label={t("monthly_net_rent")}
                    value={maskValue(currencyFormatter.format(monthlyNetRent))}
                  />
                  <DetailField
                    label={t("net_profit_with_rent")}
                    value={
                      netProfitWithRent != null
                        ? maskValue(currencyFormatter.format(netProfitWithRent))
                        : "—"
                    }
                  />
                  <DetailField
                    label={t("property_irr")}
                    value={propertyIrr != null ? `${(propertyIrr * 100).toFixed(2)}%` : "—"}
                  />
                  <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
                    {t("net_rent_hint")}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          )}

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
                {isRealEstate && <PropertyDocumentDialog assetId={asset.id} />}
                {!isRealEstate && !isVehicle && (
                  <CsvImportDialog
                    assetId={asset.id}
                    currentValue={asset.current_value}
                    currency={asset.currency}
                  />
                )}
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
                  <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

                {metadata.emirate !== "abu_dhabi" && (
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {t("dld_identifiers")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                )}

                {metadata.emirate === "abu_dhabi" && (
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {t("adrec_identifiers")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                )}

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {t("material_condition_ratings")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                  <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

                        {amortizationSummary && (
                          <div className="space-y-4 border-t border-border pt-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                              <div className="h-40 w-full min-w-0">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={[
                                        {
                                          name: t("principal_paid"),
                                          value: amortizationSummary.principalPaidToDate,
                                        },
                                        {
                                          name: t("interest_paid"),
                                          value: amortizationSummary.interestPaidToDate,
                                        },
                                      ]}
                                      dataKey="value"
                                      nameKey="name"
                                      innerRadius={35}
                                      outerRadius={60}
                                    >
                                      <Cell fill="var(--color-success)" />
                                      <Cell fill="var(--color-destructive)" />
                                    </Pie>
                                    <Tooltip
                                      contentStyle={{
                                        background: "var(--color-card)",
                                        border: "1px solid var(--color-border)",
                                        color: "var(--color-foreground)",
                                      }}
                                      formatter={(value) =>
                                        maskValue(currencyFormatter.format(Number(value)))
                                      }
                                    />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                              <div className="flex flex-col justify-center gap-3">
                                <DetailField
                                  label={t("principal_paid")}
                                  value={maskValue(
                                    currencyFormatter.format(
                                      amortizationSummary.principalPaidToDate,
                                    ),
                                  )}
                                />
                                <DetailField
                                  label={t("interest_paid")}
                                  value={maskValue(
                                    currencyFormatter.format(
                                      amortizationSummary.interestPaidToDate,
                                    ),
                                  )}
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{t("loan_percent_paid")}</span>
                                <span>{amortizationSummary.percentPaid.toFixed(1)}%</span>
                              </div>
                              <ProgressBar
                                percent={amortizationSummary.percentPaid}
                                colorClassName="bg-success"
                              />
                            </div>
                            <Collapsible open={scheduleOpen} onOpenChange={setScheduleOpen}>
                              <CollapsibleTrigger asChild>
                                <Button type="button" variant="outline" size="sm">
                                  {scheduleOpen
                                    ? t("hide_amortization_schedule")
                                    : t("show_amortization_schedule")}
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="mt-3 max-h-80 overflow-y-auto border border-border">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>{t("payment_number")}</TableHead>
                                        <TableHead>{t("due_date")}</TableHead>
                                        <TableHead className="text-right">
                                          {t("interest_rate")}
                                        </TableHead>
                                        <TableHead className="text-right">
                                          {t("principal")}
                                        </TableHead>
                                        <TableHead className="text-right">
                                          {t("interest_paid")}
                                        </TableHead>
                                        <TableHead className="text-right">
                                          {t("outstanding_loan_balance")}
                                        </TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {amortizationSummary.schedule.map((entry) => (
                                        <TableRow key={entry.paymentNumber}>
                                          <TableCell>{entry.paymentNumber}</TableCell>
                                          <TableCell className="text-muted-foreground">
                                            {entry.date}
                                          </TableCell>
                                          <TableCell className="text-right text-muted-foreground">
                                            {entry.rateUsed.toFixed(2)}%
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {maskValue(
                                              currencyFormatter.format(entry.principalAmount),
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {maskValue(
                                              currencyFormatter.format(entry.interestAmount),
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {maskValue(
                                              currencyFormatter.format(entry.remainingBalance),
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          </div>
                        )}
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
              <>
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {t("vehicle_details")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <DetailField label={t("make")} value={vehicleMetadata.make} />
                    <DetailField label={t("model")} value={vehicleMetadata.model} />
                    <DetailField
                      label={t("vehicle_year")}
                      value={vehicleMetadata.year}
                    />
                    <DetailField label={t("vin")} value={vehicleMetadata.vin} />
                    <DetailField
                      label={t("license_plate")}
                      value={vehicleMetadata.license_plate}
                    />
                    <DetailField
                      label={t("mileage")}
                      value={
                        vehicleMetadata.mileage != null
                          ? `${vehicleMetadata.mileage.toLocaleString()} km`
                          : null
                      }
                    />
                    {vehicleMetadata.last_valuation_date && (
                      <DetailField
                        label={t("last_valuation")}
                        value={`${maskValue(
                          currencyFormatter.format(vehicleMetadata.market_valuation ?? 0),
                        )} (${
                          vehicleMetadata.last_valuation_source === "autobiz"
                            ? t("provider_autobiz")
                            : t("provider_la_centrale")
                        }, ${vehicleMetadata.last_valuation_date})`}
                      />
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {t("cost_fees_basis")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <DetailField
                      label={t("purchase_price")}
                      value={
                        vehicleMetadata.purchase_price != null
                          ? maskValue(
                              currencyFormatter.format(vehicleMetadata.purchase_price),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("maintenance_costs")}
                      value={
                        vehicleMetadata.maintenance_costs != null
                          ? maskValue(
                              currencyFormatter.format(vehicleMetadata.maintenance_costs),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("modifications")}
                      value={
                        vehicleMetadata.modifications != null
                          ? maskValue(
                              currencyFormatter.format(vehicleMetadata.modifications),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("insurance_registration")}
                      value={
                        vehicleMetadata.insurance_registration != null
                          ? maskValue(
                              currencyFormatter.format(
                                vehicleMetadata.insurance_registration,
                              ),
                            )
                          : null
                      }
                    />
                    <DetailField
                      label={t("total_cost_of_ownership")}
                      value={
                        vehicleTotalCost != null
                          ? maskValue(currencyFormatter.format(vehicleTotalCost))
                          : null
                      }
                    />
                  </CardContent>
                </Card>
              </>
            )}

            {isPrivateEquity && privateEquityMetadata && (
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">
                    {t("private_equity_details")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
