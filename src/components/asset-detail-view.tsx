"use client";

import { formatDecimal } from "@/lib/money-parts";
import { formatPercentPoints } from "@/lib/money-parts";
import { moneyFormatter } from "@/lib/money-parts";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Car,
  CloudDownload,
  Coins,
  Download,
  FileText,
  Landmark,
  LineChart,
  Minus,
  RefreshCw,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
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
import { historySourceLabel, useBatchText } from "@/components/batch-import-text";
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
import { VehicleExpenses } from "@/components/vehicle-expenses";

import { AddAssetDialog } from "@/components/add-asset-dialog";
import { EditBankAccountDialog } from "@/components/edit-bank-account-dialog";
import { isImportedBankAccount } from "@/lib/banking/account-country";
import { AddLiabilityDialog } from "@/components/add-liability-dialog";

import { PeCashFlowChart } from "@/components/pe-cash-flow-chart";

import { parseAssuranceVieMetadata } from "@/lib/assurance-vie";
import { DetailField, ProgressBar } from "@/components/asset-detail/shared";
import { AssuranceVieDetailCards } from "@/components/assurance-vie-cards";
import { fundReturns } from "@/lib/private-equity";
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
  refreshMetalPrice,
  refreshVehicleValuation,
  syncCryptoWallet,
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
import { canAmortize, getOutstandingPrincipalAt, summarizeAmortization } from "@/lib/amortization";
import { calculateIrr, type DatedCashFlow } from "@/lib/irr";
import {
  averageAnnualCosts,
  addDays,
  buildProjection,
  cumulativeNetRentAt,
  densifyHistory,
  estimateAnnualGrowth,
  estimateOffplanValueAt,
  type OffplanPlan,
  type ProjectionPoint,
} from "@/lib/real-estate-analytics";
import {
  calculateVehicleTotalCost,
  buildVehicleComparisonSeries,
  parseVehicleMetadata,
  resolveVehicleValuation,
} from "@/lib/vehicles";

import { parsePrivateEquityMetadata } from "@/lib/private-equity";
import {
  buildInvestedCapitalSeries,
  estimateCostBasisUnitPrice,
  parseEquityMetadata,
} from "@/lib/equities";
import { parseCryptoMetadata } from "@/lib/crypto";
import { parsePreciousMetalMetadata } from "@/lib/precious-metals";

import { ExoticAssetCard } from "@/components/exotic-asset-card";
import { StartupCard } from "@/components/startup-card";
import { photoThumbUrl } from "@/lib/asset-photos";
import { OwnershipSummary, type OwnerFormRow } from "@/components/ownership-fields";
import { OwnershipStatusPanel } from "@/components/ownership-status";
import type { OwnershipStatus } from "@/lib/shared-assets/server";
import { currencies, getCurrencySymbol } from "@/lib/currencies";
import { convertAmount } from "@/lib/fx";
import { fetchMarketPrice } from "@/lib/market-data/market-price";
import { refreshMarketPrice } from "@/app/dashboard/actions";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";
import {
  buildDetailDisplay,
  realEstateShareFigures,
  toEditPayload,
} from "@/lib/asset-detail-scaling";
import { OwnerShareNote } from "@/components/owner-share-note";
import { TransactionsList } from "@/components/transactions-list";
import { TimeRangeSelector } from "@/components/time-range-selector";
import { filterByRange, type TimeRange } from "@/lib/time-range";
import { useBankingText } from "@/components/banking-text";
import { AttributionCard } from "@/components/attribution-card";
import type { AssetAttributionView } from "@/lib/asset-attribution-view";
import type { StoredTransactionRow } from "@/lib/transaction-detail";
import {
  CompanySettings,
  CryptoSettings,
  EquitySettings,
  PreciousMetalSettings,
  PrivateEquityCommitmentSettings,
  PrivateEquityDetailsSettings,
  PrivateEquityLedgerEditor,
  RealEstateSettings,
  ScpiSettings,
  VaultDocuments,
  VehicleSettings,
} from "@/components/asset-detail/lazy";
import { useUiTier } from "@/components/tier-gate";
import { useVaultText } from "@/components/vault/vault-text";
import { tierRank } from "@/stores/useUiTierStore";
import { VehicleOverviewCosts } from "@/components/asset-detail/vehicle-overview-costs";
import { ScpiOverviewCard } from "@/components/asset-detail/scpi-overview-card";
import { AssetAnalysis } from "@/components/asset-detail/analysis";
import { VehicleValuationChart } from "@/components/vehicle-valuation-chart";
import type { AnalysisPortfolio } from "@/lib/asset-analysis/common";

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
  /** File name of the import this row came from (migration 0041); absent before it is applied. */
  source_ref?: string | null;
};

type Category = { id: string; name: string };

/** Maps `refresh-market-price`'s error `code` to a localized message key, so the UI never shows the Edge Function's raw (English-only) message text. */
const MARKET_PRICE_ERROR_KEYS: Record<string, TranslationKey> = {
  invalid_request: "market_price_error_invalid_request",
  invalid_symbol: "market_price_error_invalid_symbol",
  unsupported_currency: "market_price_error_unsupported_currency",
  provider_not_configured: "market_price_error_provider_not_configured",
  invalid_api_key: "market_price_error_invalid_api_key",
  no_data: "market_price_error_no_data",
  timeout: "market_price_error_timeout",
  rate_limited: "market_price_error_rate_limited",
  invalid_response: "market_price_error_invalid_response",
  network_error: "market_price_error_network_error",
  invalid_address: "wallet_error_invalid_address",
  not_a_wallet: "wallet_error_not_a_wallet",
  missing_weight: "metal_weight_required",
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

export function AssetDetailView({
  asset,
  history,
  categories,
  ratesFromUsd,
  owners = [],
  ownershipStatus = null,
  ownerFactor = 1,
  transactions = [],
  attribution = null,
  analysisPortfolio = null,
}: {
  /** The RAW whole-asset record (100% values). Forms, dialogs and server actions use this one. */
  asset: AssetDetail;
  history: AssetHistoryPoint[];
  /** The viewer's 0-1 share of a co-owned asset (1 = sole owner). Only read-only display is scaled. */
  ownerFactor?: number;
  categories: Category[];
  ratesFromUsd: Record<string, number>;
  /** Owner rows when the asset is shared (empty = a single owner). */
  owners?: OwnerFormRow[];
  /** Who was emailed and what awaits approval (shared assets only). */
  ownershipStatus?: OwnershipStatus | null;
  /** Stored bank transactions of this asset (newest first); only rendered for Cash accounts. */
  transactions?: StoredTransactionRow[];
  /** FX-vs-capital attribution (multi-currency holdings only), already scaled to the viewer's share. */
  attribution?: AssetAttributionView | null;
  /** Portfolio figures for the Analysis tab (share of portfolio, linked accounts); null when not loaded. */
  analysisPortfolio?: AnalysisPortfolio | null;
}) {
  const router = useRouter();
  const { maskValue } = usePrivacy();
  const { t, intlLocale } = useLanguage();
  const bt = useBatchText();
  const bankText = useBankingText();
  // Governance Vault "Documents" tab: Professional tier and up (a UI preference; access is enforced server-side).
  const vt = useVaultText();
  const showVault = tierRank(useUiTier()) >= tierRank("professional");
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
  const [timeRange, setTimeRange] = useState<TimeRange>({ preset: "all" });
  const [growthInput, setGrowthInput] = useState("");
  const [certOpen, setCertOpen] = useState(false);
  const [certificate, setCertificate] = useState<DldCertificate | null>(null);
  const [certError, setCertError] = useState<string | null>(null);
  const [isCertPending, startCertTransition] = useTransition();

  // asset detail: owner share. `asset` / `history` stay RAW (whole asset) for every form,
  // dialog and server action; everything below that merely DISPLAYS reads the viewer's share.
  const { displayAsset, displayHistory: shareHistory } = buildDetailDisplay({
    asset,
    history,
    factor: ownerFactor,
  });

  const categoryName = asset.asset_categories?.name ?? "—";
  const isRealEstate = categoryName === "Real Estate";
  const isVehicle = categoryName === "Vehicles";
  const isPrivateEquity = categoryName === "Private Equity";
  const isCompany = categoryName === "Companies";
  const isScpi = categoryName === "SCPI";
  const isAssuranceVie = categoryName === "Assurance-Vie";
  const isEquity = categoryName === "Equities";
  const isCrypto = categoryName === "Crypto";
  const isPreciousMetal = categoryName === "Precious Metals";
  const isExotic = categoryName === "Exotic Assets";
  const isStartup = categoryName === "Startups";
  const isCash = categoryName === "Cash";
  const metadata = parseRealEstateMetadata(displayAsset.metadata);
  const vehicleMetadata = isVehicle ? parseVehicleMetadata(displayAsset.metadata) : null;
  // Baseline = purchase price, else the earliest valuation entry; current =
  // the latest valuation entry (see `resolveVehicleValuation`).
  const vehicleValuation = vehicleMetadata
    ? resolveVehicleValuation(
        vehicleMetadata,
        shareHistory.filter((h) => !asset.purchase_date || h.recorded_date >= asset.purchase_date),
        displayAsset.current_value,
      )
    : null;
  const vehicleTotalCost = vehicleMetadata
    ? calculateVehicleTotalCost(
        vehicleMetadata,
        vehicleValuation?.baselineCost ?? displayAsset.current_value,
      )
    : null;
  const vehicleChange = vehicleValuation?.change ?? null;
  const privateEquityMetadata = isPrivateEquity
    ? parsePrivateEquityMetadata(displayAsset.metadata)
    : null;
  const equityMetadata = isEquity ? parseEquityMetadata(displayAsset.metadata) : null;
  const cryptoMetadata = isCrypto ? parseCryptoMetadata(displayAsset.metadata) : null;
  const metalMetadata = isPreciousMetal ? parsePreciousMetalMetadata(displayAsset.metadata) : null;
  const isWalletHolding = cryptoMetadata?.holding_source === "wallet";
  const avgCostBasis = equityMetadata
    ? estimateCostBasisUnitPrice(equityMetadata.trades)
    : null;
  const images = asset.images ?? [];

  const currencyFormatter = moneyFormatter(intlLocale, asset.currency);

  const today = new Date().toISOString().slice(0, 10);
  const loan = metadata.linked_loan;
  const loanIsAmortizable = isRealEstate && canAmortize(loan);

  const marketValuation = isRealEstate
    ? metadata.market_valuation ?? displayAsset.current_value
    : displayAsset.current_value;

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
    : displayAsset.current_value;

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

  const confidenceLevel = metadata.automaticEstimation
    ? t("confidence_high")
    : t("confidence_manual");
  const netROI =
    unrealizedGain != null && totalCost
      ? (unrealizedGain.amount / totalCost) * 100
      : null;
  const primaryOwnership =
    metadata.ownership.find((o) => o.name) ?? metadata.ownership[0];
  // Co-owned: the share comes from the viewer's factor and the amounts are already scaled (no
  // second multiplication by the legacy per-property percentage); price per m2 is whole-property.
  const { ownershipPercent, grossShare, netShare, valuePerSqm: sqmValue } = realEstateShareFigures({
    factor: ownerFactor,
    legacyPercent: primaryOwnership?.percentage ?? 100,
    marketValuation,
    netEquity,
    surfaceArea: metadata.surfaceArea,
  });
  const valuePerSqm = isRealEstate ? sqmValue : null;
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

  const sortedHistoryRaw = [...shareHistory].sort((a, b) =>
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

  // Cash accounts: the stored transactions booked on each valuation date, shown under that log row
  // so the imported descriptions are visible where the balance history is.
  const logTransactionsByDate = new Map<string, StoredTransactionRow[]>();
  for (const tr of transactions) {
    const list = logTransactionsByDate.get(tr.booked_date);
    if (list) list.push(tr);
    else logTransactionsByDate.set(tr.booked_date, [tr]);
  }

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
  if (isVehicle && vehicleMetadata) {
    // Vehicles: the curve starts strictly on the recorded purchase date (at
    // the purchase price when known) and runs to today — never at "today"
    // just because that is the only row, nor before the purchase. Equity is
    // the value itself (no loan netting for vehicles).
    // The market curve is the recorded valuations ONLY. The purchase price is a separate
    // flat curve and the Blue Book another (see `buildVehicleComparisonSeries`), so a
    // market value entered on the purchase date no longer overwrites the purchase price.
    const marketOnly = sortedHistory.filter((h) => !asset.purchase_date || h.recorded_date >= asset.purchase_date);
    displayHistory = (
      marketOnly.length > 0
        ? marketOnly
        : [
            {
              id: "vehicle-now",
              recorded_date: today,
              value: displayAsset.current_value,
              net_equity: displayAsset.current_value,
              source: "manual",
            } as AssetHistoryPoint,
          ]
    ).map((h) => ({ ...h, net_equity: h.value }));
  } else if (purchaseAnchorDate) {
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
  const offplanSchedule = metadata.payment_schedule.filter((m) => m.due_date);
  // Equities: what was actually invested (cost basis of the open position),
  // as a step function of date — plotted beside the true daily market value so
  // the gap between them is the unrealized gain/loss.
  const equityCostSeries =
    isEquity && equityMetadata ? buildInvestedCapitalSeries(equityMetadata.trades) : [];
  const equityCostAt = (date: string): number | null => {
    if (equityCostSeries.length === 0) return null;
    let cost = 0;
    for (const p of equityCostSeries) {
      if (p.date <= date) cost = p.value;
      else break;
    }
    return cost;
  };
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
    // Off-plan: until handover, Equity on the chart is the cash paid in by that
    // date (same rule the projection uses), so history and projection share
    // one definition and meet without a jump. Falls back to the stored
    // figure when no payment schedule is on file.
    const offplanPaidAtPoint =
      isRealEstate && metadata.is_offplan && offplanSchedule.length > 0
        ? offplanSchedule
            .filter((m) => m.status === "paid" && m.due_date <= h.recorded_date)
            .reduce((sum, m) => sum + m.amount, 0)
        : null;
    return {
      date: h.recorded_date,
      value: h.value,
      netEquity:
        offplanPaidAtPoint != null
          ? offplanPaidAtPoint
          : loanBalance != null
            ? calculateEquity(h.value, loanBalance)
            : h.net_equity ?? h.value,
      costBasis: equityCostAt(h.recorded_date),
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
  // Anchored on the real current date (`today`, from `new Date()` at render),
  // never a stored/static date — so the forward series always starts at
  // "now", and the bridge below joins it to the last recorded point.
  const offplanPlan: OffplanPlan | undefined =
    isRealEstate && metadata.is_offplan
      ? {
          paidNow:
            offplanSchedule.length > 0
              ? offplanSchedule
                  .filter((m) => m.status === "paid")
                  .reduce((sum, m) => sum + m.amount, 0)
              : metadata.paid_to_date,
          futureInstallments: offplanSchedule.filter(
            (m) => m.status !== "paid" && m.due_date > today,
          ),
          handoverDate:
            offplanSchedule.length > 0
              ? offplanSchedule.map((m) => m.due_date).sort().at(-1) ?? null
              : null,
        }
      : undefined;
  const projection: ProjectionPoint[] =
    isRealEstate && totalCost != null
      ? buildProjection({
          offplan: offplanPlan,
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
  // Bridge: start the forward series at the last KNOWN historical point so
  // the dashed projection leaves exactly where the solid history ends — even
  // if the newest manual valuation was deleted, or history stops before today
  // (the projection itself starts from today's market valuation).
  const lastHistoryPoint = chartData[chartData.length - 1];
  const projectionBridge: ProjectionPoint[] =
    projection.length > 0 &&
    lastHistoryPoint &&
    lastHistoryPoint.netProfit != null &&
    lastHistoryPoint.totalReturn != null
      ? [
          {
            date: lastHistoryPoint.date,
            pValue: lastHistoryPoint.value,
            pNetEquity: lastHistoryPoint.netEquity,
            pNetProfit: lastHistoryPoint.netProfit,
            pLoanBalance: lastHistoryPoint.loanBalance,
            pTotalReturn: lastHistoryPoint.totalReturn,
          },
        ]
      : [];
  // Dense history for the tooltip: daily points between the recorded
  // valuations (value interpolated; equity/loan/profit/total return recomputed
  // per date; off-plan installment due dates injected so equity steps on the
  // exact day) — see `densifyHistory`. The recorded points themselves are
  // unchanged, and the projection bridge / growth estimate still use them.
  const historySeries = isRealEstate
    ? densifyHistory(chartData, {
        extraDates: metadata.is_offplan
          ? offplanSchedule.flatMap((m) => [m.due_date, addDays(m.due_date, -1)])
          : [],
        equityAt:
          metadata.is_offplan && offplanSchedule.length > 0
            ? (date) =>
                offplanSchedule
                  .filter((m) => m.status === "paid" && m.due_date <= date)
                  .reduce((sum, m) => sum + m.amount, 0)
            : loanIsAmortizable
              ? (date, value) => calculateEquity(value, getOutstandingPrincipalAt(loan, date))
              : undefined,
        loanBalanceAt: loanIsAmortizable
          ? (date) => getOutstandingPrincipalAt(loan, date)
          : undefined,
        netProfitAt: totalCost != null ? (value) => value - totalCost : undefined,
        totalReturnAt:
          totalCost != null
            ? (date, value) =>
                value -
                totalCost +
                cumulativeNetRentAt({
                  contracts: metadata.tenancy_contracts,
                  schedule: amortSchedule,
                  expenses: metadata.property_expenses,
                  date,
                  flatMonthlyInterest: monthlyInterest,
                }).net
            : undefined,
      })
    : chartData;
  const vehicleRows =
    isVehicle && vehicleMetadata
      ? buildVehicleComparisonSeries({
          market: displayHistory,
          purchaseDate: asset.purchase_date,
          purchasePrice: vehicleMetadata.purchase_price,
          guide: vehicleMetadata.blue_book_log.map((e) => ({
            date: e.date,
            value: convertAmount(e.amount, e.currency || asset.currency, asset.currency, ratesFromUsd),
          })),
          today,
        })
      : null;
  // The chosen time range limits the recorded history; the forward projection is never cut.
  const rangedHistory = (vehicleRows ?? historySeries) as { date: string }[];
  const combinedChartData = [
    ...(showHistory
      ? filterByRange(rangedHistory, timeRange, today).map((p) => ({ ...p, ts: new Date(p.date).getTime() }))
      : []),
    ...(showForward
      ? [...projectionBridge, ...projection].map((p) => ({
          ...p,
          ts: new Date(p.date).getTime(),
        }))
      : []),
  ];

  const axisDateFormatter = new Intl.DateTimeFormat(intlLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const lastPricedAtFormatter = new Intl.DateTimeFormat(intlLocale, {
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
          t(result.persisted ? "adrec_project_status_updated" : "sample_project_status_not_saved", {
            percent: result.completionRate,
          }),
        );
        return;
      }

      setAdrecMessage(
        t(result.persisted ? "adrec_valuation_updated" : "sample_valuation_not_saved", {
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
              exchange: equityMetadata?.exchange_mic || equityMetadata?.exchange || undefined,
              isin: equityMetadata?.isin,
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

  function handleRefreshMetalPrice() {
    setMarketPriceError(null);
    setMarketPriceMessage(null);

    startMarketPriceTransition(async () => {
      const result = await refreshMetalPrice(asset.id);
      if (!result.ok) {
        const key = MARKET_PRICE_ERROR_KEYS[result.code];
        setMarketPriceError(key ? t(key) : result.error);
        return;
      }
      setMarketPriceMessage(
        t("metal_price_updated", {
          price: currencyFormatter.format(result.spotPrice),
          value: currencyFormatter.format(result.totalValue),
        }),
      );
    });
  }

  function handleSyncWallet() {
    setMarketPriceError(null);
    setMarketPriceMessage(null);

    startMarketPriceTransition(async () => {
      const result = await syncCryptoWallet(asset.id);
      if (!result.ok) {
        const key = MARKET_PRICE_ERROR_KEYS[result.code];
        setMarketPriceError(key ? t(key) : result.error);
        return;
      }
      setMarketPriceMessage(
        t(result.priced ? "wallet_synced" : "wallet_synced_unpriced", {
          balance: result.balance.toLocaleString(intlLocale, { maximumFractionDigits: 8 }),
          ticker: asset.ticker_symbol ?? "",
        }),
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
          t(result.persisted ? "dld_project_status_updated" : "sample_project_status_not_saved", {
            percent: result.completionPercentage,
          }),
        );
        return;
      }

      setDldMessage(
        t(result.persisted ? "dld_valuation_updated" : "sample_valuation_not_saved", {
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

  /** The deletable Valuation Log: on Overview for most classes, under Specifications for a bank account (whose Overview shows its transactions). */
  const renderValuationLog = () => (
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
                  <TableHead className="text-end">{t("amount")}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyLogEntries.map((point) => (
                  <TableRow key={point.id}>
                    <TableCell className="text-muted-foreground">
                      {point.recorded_date}
                    </TableCell>
                    <TableCell className="text-foreground">
                      {historySourceLabel(point.source, bt)}
                      {point.source_ref && (
                        <span className="block max-w-56 truncate text-xs text-muted-foreground" dir="auto" title={point.source_ref}>
                          {bt("hist_file_name", { name: point.source_ref })}
                        </span>
                      )}
                      {(logTransactionsByDate.get(point.recorded_date) ?? []).length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {(logTransactionsByDate.get(point.recorded_date) ?? []).slice(0, 5).map((tr, i) => (
                            <li key={`${tr.fingerprint ?? i}-${i}`} className="flex max-w-96 justify-between gap-3">
                              <span className="truncate" dir="auto" title={tr.description || undefined}>
                                {tr.description || t("txd_no_description")}
                              </span>
                              <span className="shrink-0 tabular-nums">{maskValue(currencyFormatter.format(Number(tr.amount)))}</span>
                            </li>
                          ))}
                          {(logTransactionsByDate.get(point.recorded_date) ?? []).length > 5 && (
                            <li>+{(logTransactionsByDate.get(point.recorded_date) ?? []).length - 5}</li>
                          )}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell className="text-end text-foreground">
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
  );

  return (
    <div className="w-full px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href={isCash && !asset.is_liability ? "/dashboard/banking" : "/dashboard"}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {isCash && !asset.is_liability ? bankText("back_to_banking") : t("back_to_portfolio")}
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
                      <AvatarImage src={photoThumbUrl(images[0])} alt="" className="object-contain" />
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
                          <div className="relative h-[65vh] w-full overflow-hidden rounded-md bg-muted">
                            {/* `unoptimized`: these are already client-resized
                                base64 data URIs (see `resizeImageToBase64` in
                                `lib/crop-image.ts`) — there's no remote asset
                                for Next's image optimizer to fetch/transform. */}
                            <Image
                              src={src}
                              alt={`${asset.name} ${index + 1}`}
                              fill
                              unoptimized
                              className="object-contain"
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
              <div className="text-start sm:text-end">
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
                <OwnerShareNote factor={ownerFactor} className="mt-0.5" />
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
              {isPreciousMetal && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("refresh_metal_spot")}
                  title={t("refresh_metal_spot")}
                  onClick={handleRefreshMetalPrice}
                  disabled={isMarketPricePending}
                >
                  <Coins className={cn("size-4", isMarketPricePending && "animate-pulse")} />
                </Button>
              )}
              {isCrypto && isWalletHolding && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("sync_wallet")}
                  title={t("sync_wallet")}
                  onClick={handleSyncWallet}
                  disabled={isMarketPricePending}
                >
                  <Wallet className={cn("size-4", isMarketPricePending && "animate-pulse")} />
                </Button>
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
                    <OwnerShareNote factor={ownerFactor} variant="edit" />
                  </DialogHeader>
                  <form onSubmit={handleRefreshSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new_value">{t("new_market_value")}</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            {getCurrencySymbol(refreshCurrency)}
                          </span>
                          <Input
                            id="new_value"
                            type="number"
                            step="any"
                            min="0"
                            className="ps-12"
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

        {(isEquity || isCrypto || isPreciousMetal) && (
          <div className="space-y-1">
            {(() => {
              const lastPrice = isPreciousMetal
                ? (metalMetadata?.last_spot_price ?? null)
                : ((equityMetadata ?? cryptoMetadata)?.last_unit_price ?? null);
              const lastPricedAt = formatLastPricedAt(
                (isPreciousMetal ? metalMetadata : (equityMetadata ?? cryptoMetadata))
                  ?.last_priced_at ?? null,
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
                  {isPreciousMetal ? t("metal_spot_per_oz") : t("unit_price")}:{" "}
                  {maskValue(currencyFormatter.format(lastPrice))}
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
            {isVehicle && (
              <TabsTrigger value="expenses">{t("tab_vehicle_expenses")}</TabsTrigger>
            )}
            {showVault && <TabsTrigger value="documents">{vt("vault_tab")}</TabsTrigger>}
            <TabsTrigger value="settings">{t("tab_settings")}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card className="border-border bg-card">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-foreground">
                  {t("valuation_history")}
                </CardTitle>
                <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
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
                ) : isVehicle && vehicleRows ? (
                  <VehicleValuationChart rows={filterByRange(vehicleRows, timeRange, today)} currency={asset.currency} heightClassName="h-64" />
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
                        {(isRealEstate || isEquity || isVehicle) && <Legend wrapperStyle={{ fontSize: 12 }} />}
                        {showHistory && (
                          <>
                            <Area
                              type="monotone"
                              dataKey="value"
                              name="Market Value"
                              stroke="var(--color-primary)"
                              fill="url(#valueGradient)"
                              strokeWidth={2}
                              connectNulls
                            />
                            {isVehicle ? null : (
                              <Area
                                type="monotone"
                                dataKey="netEquity"
                                name={t("equity")}
                                stroke="var(--color-success)"
                                fill="transparent"
                                strokeWidth={2}
                              />
                            )}
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
                            {isEquity && (
                              <Area
                                type="stepAfter"
                                dataKey="costBasis"
                                name={t("invested_cost_basis")}
                                stroke="var(--color-muted-foreground)"
                                fill="transparent"
                                strokeWidth={2}
                                strokeDasharray="6 4"
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
                      rate: formatDecimal(growthRate * 100, intlLocale, 1),
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

            {!isCash && renderValuationLog()}
            {isCash && !asset.is_liability && (
              <TransactionsList transactions={transactions} currency={asset.currency} assetId={asset.id} />
            )}

            <AttributionCard attribution={attribution} />

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
                        {formatPercentPoints(unrealizedGain.percent, intlLocale, { digits: 1, signDisplay: unrealizedGain.amount >= 0 ? "always" : "auto" })}
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
                      ? maskValue(formatPercentPoints(netROI, intlLocale, { digits: 2 }))
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
              <VehicleOverviewCosts
                t={t}
                vehicleTotalCost={vehicleTotalCost}
                maskValue={maskValue}
                currencyFormatter={currencyFormatter}
                vehicleMetadata={vehicleMetadata}
                intlLocale={intlLocale}
                vehicleChange={vehicleChange}
                vehicleValuation={vehicleValuation}
              />
            )}

            {isScpi && (
              <ScpiOverviewCard
                metadata={displayAsset.metadata}
                shares={displayAsset.quantity}
                today={today}
                maskValue={maskValue}
                currencyFormatter={currencyFormatter}
              />
            )}

            {isAssuranceVie && (
              <AssuranceVieDetailCards
                metadata={parseAssuranceVieMetadata(displayAsset.metadata)}
                assetValue={displayAsset.current_value}
                currency={asset.currency}
              />
            )}
          </TabsContent>

          <TabsContent value="analysis" className="space-y-6">
            {!isRealEstate ? (
              <AssetAnalysis
                asset={displayAsset}
                rawAsset={asset}
                history={shareHistory}
                transactions={transactions}
                ratesFromUsd={ratesFromUsd}
                ownerFactor={ownerFactor}
                today={today}
                portfolio={analysisPortfolio}
              />
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
                          percent: maskValue(formatPercentPoints(equityRatio, intlLocale, { digits: 1 })),
                        })}
                        value={maskValue(currencyFormatter.format(netShare))}
                      />
                      {hasLoan ? (
                        <div className="text-end">
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
                          owners={owners}
                          asset={toEditPayload(asset)}
                          ownerShareFactor={ownerFactor}
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
                              <TableHead className="text-end">
                                {t("amount")}
                              </TableHead>
                              <TableHead className="text-end">%</TableHead>
                              <TableHead className="text-end">
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
                                  <TableCell className="text-end text-foreground">
                                    {maskValue(
                                      currencyFormatter.format(
                                        milestone.amount,
                                      ),
                                    )}
                                  </TableCell>
                                  <TableCell className="text-end text-muted-foreground">
                                    {milestone.percentage}%
                                  </TableCell>
                                  <TableCell className="text-end">
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

                <AssetAnalysis
                  asset={displayAsset}
                  rawAsset={asset}
                  history={shareHistory}
                  transactions={transactions}
                  ratesFromUsd={ratesFromUsd}
                  ownerFactor={ownerFactor}
                  today={today}
                  portfolio={analysisPortfolio}
                />
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
                  <TenancyContractDialog assetId={asset.id} ownerShareFactor={ownerFactor} />
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
                            <TableHead className="text-end">{t("amount")}</TableHead>
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
                              <TableCell className="text-end text-foreground">
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
                    <OwnerShareNote factor={ownerFactor} variant="edit" className="sm:col-span-4" />
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
                    value={propertyIrr != null ? formatPercentPoints(propertyIrr * 100, intlLocale, { digits: 2 }) : "—"}
                  />
                  <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
                    {t("net_rent_hint")}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {isVehicle && vehicleMetadata && (
            <TabsContent value="expenses" className="space-y-6">
              <VehicleExpenses
                assetId={asset.id}
                currency={asset.currency}
                expenses={parseVehicleMetadata(asset.metadata).expenses}
                shareFactor={ownerFactor}
              />
            </TabsContent>
          )}

          {showVault && (
            <TabsContent value="documents" className="space-y-6">
              <VaultDocuments assetId={asset.id} />
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
                {asset.is_liability ? (
                  <AddLiabilityDialog
                    ownerShareFactor={ownerFactor}
                    liability={{
                      id: asset.id,
                      name: asset.name,
                      current_value: asset.current_value,
                      currency: asset.currency,
                      metadata: asset.metadata,
                      purchase_date: asset.purchase_date,
                    }}
                  />
                ) : isCash ? (
                  <EditBankAccountDialog
                    asset={toEditPayload(asset)}
                    ownerShareFactor={ownerFactor}
                    imported={isImportedBankAccount({
                      metadata: asset.metadata,
                      historySources: history.map((h) => h.source),
                      transactionSources: transactions.map((tr) => tr.source),
                    })}
                  />
                ) : (
                  <AddAssetDialog
                    categories={categories}
                    owners={owners}
                    asset={toEditPayload(asset)}
                    ownerShareFactor={ownerFactor}
                  />
                )}
                {isRealEstate && <PropertyDocumentDialog assetId={asset.id} />}
                {!isRealEstate && !isVehicle && !asset.is_liability && (
                  <CsvImportDialog
                    assetId={asset.id}
                    currentValue={asset.current_value}
                    currency={asset.currency}
                  />
                )}
                <DeleteAssetButton
                  id={asset.id}
                  onSuccess={() => router.push(isCash && !asset.is_liability ? "/dashboard/banking" : "/dashboard")}
                />
              </CardContent>
            </Card>

            {isRealEstate && (
              <RealEstateSettings
                t={t}
                metadata={metadata}
                maskValue={maskValue}
                currencyFormatter={currencyFormatter}
                totalCost={totalCost}
                hasLoan={hasLoan}
                outstandingLoanBalance={outstandingLoanBalance}
                amortizationSummary={amortizationSummary}
                scheduleOpen={scheduleOpen}
                setScheduleOpen={setScheduleOpen}
              />
            )}

            {isVehicle && vehicleMetadata && (
              <VehicleSettings
                t={t}
                vehicleMetadata={vehicleMetadata}
                intlLocale={intlLocale}
                maskValue={maskValue}
                currencyFormatter={currencyFormatter}
                ownershipStatus={ownershipStatus}
                asset={asset}
                ratesFromUsd={ratesFromUsd}
                vehicleTotalCost={vehicleTotalCost}
              />
            )}

            {isScpi && (
              <ScpiSettings
                t={t}
                displayAsset={displayAsset}
                today={today}
                maskValue={maskValue}
                currencyFormatter={currencyFormatter}
              />
            )}

            {isCompany && (
              <CompanySettings
                t={t}
                asset={asset}
                maskValue={maskValue}
                currencyFormatter={currencyFormatter}
              />
            )}

            {isPrivateEquity && privateEquityMetadata && (
              <PrivateEquityDetailsSettings
                t={t}
                privateEquityMetadata={privateEquityMetadata}
                maskValue={maskValue}
              />
            )}

            {isPrivateEquity && privateEquityMetadata && (
              <PrivateEquityCommitmentSettings
                t={t}
                privateEquityMetadata={privateEquityMetadata}
                maskValue={maskValue}
                currencyFormatter={currencyFormatter}
                today={today}
              />
            )}

            {isPrivateEquity && privateEquityMetadata && (
              <PrivateEquityLedgerEditor asset={toEditPayload(asset)} shareFactor={ownerFactor} />
            )}

            {isPrivateEquity &&
              privateEquityMetadata &&
              (privateEquityMetadata.projected_distributions.length > 0 ||
                privateEquityMetadata.capital_calls.length > 0) && (
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">{t("pe_cash_flows_heading")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(() => {
                      const pe = privateEquityMetadata;
                      const returns = fundReturns(pe);
                      const manual = pe.projection_mode === "manual";
                      const dists = [...pe.projected_distributions].sort((a, b) =>
                        a.due_date.localeCompare(b.due_date),
                      );
                      return (
                        <>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <DetailField
                              label={t("pe_total_projected_distributions")}
                              value={maskValue(currencyFormatter.format(returns.totalDistributions))}
                            />
                            <DetailField
                              label={t("pe_expected_multiple")}
                              value={returns.multiple != null ? `${returns.multiple.toFixed(2)}x` : null}
                            />
                            <DetailField
                              label={t("pe_expected_irr")}
                              value={returns.irr != null ? formatPercentPoints(returns.irr * 100, intlLocale, { digits: 1 }) : null}
                            />
                            <DetailField
                              label={t("pe_projection_source")}
                              value={manual ? t("pe_mode_manual") : t("pe_mode_model")}
                            />
                          </div>
                          <PeCashFlowChart metadata={pe} currency={asset.currency} />
                          {dists.length > 0 && (
                            <div className="overflow-x-auto border border-border">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-muted-foreground">{t("pe_call_date")}</TableHead>
                                    <TableHead className="text-end text-muted-foreground">
                                      {t("pe_projected_distribution")}
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {dists.map((dist) => (
                                    <TableRow key={dist.id}>
                                      <TableCell className="tabular-nums text-foreground">{dist.due_date}</TableCell>
                                      <TableCell className="text-end tabular-nums text-success">
                                        {maskValue(currencyFormatter.format(dist.amount))}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">{t("pe_projection_note")}</p>
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

            {isEquity && equityMetadata && (
              <EquitySettings
                t={t}
                asset={asset}
                equityMetadata={equityMetadata}
                maskValue={maskValue}
                displayAsset={displayAsset}
                intlLocale={intlLocale}
                avgCostBasis={avgCostBasis}
                currencyFormatter={currencyFormatter}
                formatLastPricedAt={formatLastPricedAt}
              />
            )}

            {owners.length > 1 && <OwnershipSummary rows={owners} />}
            {ownershipStatus && <OwnershipStatusPanel assetId={asset.id} status={ownershipStatus} />}

            {isStartup && (
              <StartupCard
                assetId={asset.id}
                metadata={asset.metadata}
                shares={displayAsset.quantity}
                currency={asset.currency}
              />
            )}

            {isExotic && (
              <ExoticAssetCard
                assetId={asset.id}
                metadata={asset.metadata}
                quantity={asset.quantity}
                currentValue={asset.current_value}
                currency={asset.currency}
              />
            )}

            {isPreciousMetal && metalMetadata && (
              <PreciousMetalSettings
                t={t}
                metalMetadata={metalMetadata}
                displayAsset={displayAsset}
                maskValue={maskValue}
                currencyFormatter={currencyFormatter}
                formatLastPricedAt={formatLastPricedAt}
              />
            )}

            {isCash && renderValuationLog()}

            {isCrypto && cryptoMetadata && (
              <CryptoSettings
                t={t}
                asset={asset}
                cryptoMetadata={cryptoMetadata}
                isWalletHolding={isWalletHolding}
                formatLastPricedAt={formatLastPricedAt}
                maskValue={maskValue}
                currencyFormatter={currencyFormatter}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
