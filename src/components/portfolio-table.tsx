"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CategoryIcon, categoryIconFor } from "@/components/category-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { photoThumbUrl } from "@/lib/asset-photos";
import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil, Rows2, Rows3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MicroSparkline } from "@/components/micro-sparkline";
import { AddAssetDialog, type AssetForEdit } from "@/components/add-asset-dialog";
import { AddLiabilityDialog } from "@/components/add-liability-dialog";
import { DeleteAssetButton } from "@/components/delete-asset-button";
import { usePrivacy } from "@/context/privacy-context";
import { convertAmount } from "@/lib/fx";
import { assetLiability, grossAssetValue } from "@/lib/liabilities";
import { cn } from "@/lib/utils";
import { useTierMotion } from "@/components/tier-gate";
import {
  ALL_CATEGORIES,
  buildCategoryPills,
  filterByCategory,
  pillsWithSelection,
} from "@/lib/portfolio-table-filters";
import {
  DEFAULT_TABLE_DENSITY,
  TABLE_DENSITY_CLASSES,
  readStoredTableDensity,
  writeStoredTableDensity,
  type TableDensity,
} from "@/lib/table-density";
import { useLanguage } from "@/context/language-context";
import {
  calculateTotalCost,
  calculateUnrealizedGain,
  parseRealEstateMetadata,
} from "@/lib/real-estate";

type Category = { id: string; name: string };

// Density is a per-browser preference shared by every table on the page. Read through
// useSyncExternalStore so the server render and first client paint use the default
// (no hydration mismatch) and the stored value is applied right after hydration.
const densityListeners = new Set<() => void>();
// Only set when localStorage rejects the write, so the toggle still works for this session.
let sessionDensity: TableDensity | null = null;
const subscribeDensity = (cb: () => void) => {
  densityListeners.add(cb);
  return () => {
    densityListeners.delete(cb);
  };
};
const getDensitySnapshot = (): TableDensity => sessionDensity ?? readStoredTableDensity();
const getServerDensitySnapshot = (): TableDensity => DEFAULT_TABLE_DENSITY;
function setTableDensity(next: TableDensity) {
  sessionDensity = writeStoredTableDensity(next) ? null : next;
  densityListeners.forEach((cb) => cb());
}

type SortKey = "name" | "category" | "quantity" | "value";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

/** One sortable column header: a real <button> inside the <th>, with `aria-sort` on the th. */
function SortHead({
  label,
  sortKey,
  sort,
  onSort,
  align = "start",
  sortLabel,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  align?: "start" | "end";
  sortLabel: string;
}) {
  const active = sort?.key === sortKey ? sort.dir : null;
  const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <TableHead
      aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}
      className={cn(align === "end" && "text-end")}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={sortLabel}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm uppercase tracking-wide outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          align === "end" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5 shrink-0" aria-hidden />
      </button>
    </TableHead>
  );
}

type AssetRow = {
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

export function PortfolioTable({
  assets,
  categories,
  displayCurrency,
  rates,
  performanceByAsset,
  selectedIds,
  onToggleAsset,
  onToggleAll,
  sharedAssetIds,
  sparklines,
}: {
  assets: AssetRow[];
  categories: Category[];
  displayCurrency: string;
  rates: Record<string, number>;
  /** Gain/loss (asset currency) for categories without a cost basis in their metadata — Vehicles, computed server-side from the valuation log. */
  performanceByAsset?: Record<string, { amount: number; percent: number | null }>;
  selectedIds?: Set<string>;
  onToggleAsset?: (id: string, checked: boolean) => void;
  onToggleAll?: (ids: string[], checked: boolean) => void;
  /** Assets owned in shares: shown here at the viewer's share, so they are edited on their own page, never from these scaled rows. */
  sharedAssetIds?: string[];
  /** Per-asset trend values (asset id -> ~24 points). Absent = Trend column hidden. */
  sparklines?: Record<string, number[]>;
}) {
  const { maskValue } = usePrivacy();
  const { t, intlLocale } = useLanguage();

  const currencyFormatter = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: displayCurrency,
  });

  const density = useSyncExternalStore(subscribeDensity, getDensitySnapshot, getServerDensitySnapshot);
  const densityClasses = TABLE_DENSITY_CLASSES[density];
  const motion = useTierMotion();

  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const pills = useMemo(
    () => pillsWithSelection(buildCategoryPills(assets), categoryFilter),
    [assets, categoryFilter],
  );
  const filteredAssets = useMemo(() => filterByCategory(assets, categoryFilter), [assets, categoryFilter]);
  // A single category (the dashboard folders) has nothing to filter between.
  const showPills = pills.length >= 2 || categoryFilter !== ALL_CATEGORIES;

  const [sort, setSort] = useState<SortState>(null);
  // Click cycles asc → desc → original (server) order.
  const onSort = (key: SortKey) =>
    setSort((prev) =>
      prev?.key !== key ? { key, dir: "asc" } : prev.dir === "asc" ? { key, dir: "desc" } : null,
    );

  const sortedAssets = useMemo(() => {
    if (!sort) return filteredAssets;
    // Value sorts by what the row headlines (net equity for mortgaged property), in the display currency.
    const valueOf = (a: AssetRow) => {
      const owed =
        a.asset_categories?.name === "Real Estate" || a.asset_categories?.name === "Private Equity"
          ? assetLiability(a)
          : 0;
      const raw = owed > 0 ? grossAssetValue(a) - owed : a.current_value;
      return convertAmount(raw, a.currency, displayCurrency, rates) * (a.is_liability ? -1 : 1);
    };
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filteredAssets].sort((a, b) => {
      switch (sort.key) {
        case "name":
          return factor * a.name.localeCompare(b.name, intlLocale);
        case "category":
          return factor * (a.asset_categories?.name ?? "").localeCompare(b.asset_categories?.name ?? "", intlLocale);
        case "quantity":
          return factor * (a.quantity - b.quantity);
        case "value":
          return factor * (valueOf(a) - valueOf(b));
      }
    });
  }, [filteredAssets, sort, displayCurrency, rates, intlLocale]);

  const visibleIds = filteredAssets.map((asset) => asset.id);
  const selectedVisibleCount = selectedIds
    ? visibleIds.filter((id) => selectedIds.has(id)).length
    : 0;
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && !allVisibleSelected;

  return (
    <div
      role="region"
      aria-label="Portfolio holdings table"
      tabIndex={0}
      className="overflow-hidden rounded-md border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      {assets.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2 py-1.5">
          {showPills ? (
            <div role="group" aria-label={t("ptable_filter_label")} className="flex flex-wrap items-center gap-1.5">
              {[{ value: ALL_CATEGORIES, count: assets.length, labelKey: "ptable_filter_all" as const }, ...pills].map((pill) => {
                const active = categoryFilter === pill.value;
                const label = pill.labelKey ? t(pill.labelKey) : pill.value;
                return (
                  <button
                    key={pill.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategoryFilter(pill.value)}
                    style={{ transitionDuration: `${motion.durationMs}ms` }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium outline-none transition-[background-color,color,border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {label}
                    <span className="tabular-nums opacity-80">{pill.count}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <span />
          )}
          <div role="group" aria-label={t("ptable_density_label")} className="flex items-center rounded-md border border-border p-0.5">
            {(
              [
                { value: "compact", Icon: Rows3, label: t("ptable_density_compact") },
                { value: "comfortable", Icon: Rows2, label: t("ptable_density_comfortable") },
              ] as const
            ).map(({ value, Icon, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={density === value}
                aria-label={label}
                title={label}
                onClick={() => setTableDensity(value)}
                style={{ transitionDuration: `${motion.durationMs}ms` }}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                  density === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
              </button>
            ))}
          </div>
        </div>
      )}
      <Table>
        <TableCaption className="sr-only">
          Your portfolio holdings, with category, quantity, value and
          performance. Each row links to that asset&apos;s detail page.
        </TableCaption>
        <TableHeader className={cn("bg-muted/40 text-xs", densityClasses.head)}>
          <TableRow className="hover:bg-transparent">
            {onToggleAll && (
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all"
                  checked={
                    allVisibleSelected
                      ? true
                      : someVisibleSelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(checked) =>
                    onToggleAll(visibleIds, checked === true)
                  }
                  disabled={visibleIds.length === 0}
                />
              </TableHead>
            )}
            <SortHead label={t("grid_col_name")} sortKey="name" sort={sort} onSort={onSort} sortLabel={t("grid_sort_by", { col: t("grid_col_name") })} />
            <SortHead label={t("grid_col_category")} sortKey="category" sort={sort} onSort={onSort} sortLabel={t("grid_sort_by", { col: t("grid_col_category") })} />
            <SortHead label={t("grid_col_quantity")} sortKey="quantity" sort={sort} onSort={onSort} align="end" sortLabel={t("grid_sort_by", { col: t("grid_col_quantity") })} />
            <SortHead label={t("grid_col_value", { currency: displayCurrency })} sortKey="value" sort={sort} onSort={onSort} align="end" sortLabel={t("grid_sort_by", { col: t("grid_col_value", { currency: displayCurrency }) })} />
            {sparklines && (
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("grid_col_trend")}</TableHead>
            )}
            <TableHead className="text-end text-xs uppercase tracking-wide text-muted-foreground">{t("grid_col_performance")}</TableHead>
            <TableHead className="text-end text-xs uppercase tracking-wide text-muted-foreground">{t("grid_col_actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredAssets.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={(onToggleAll ? 7 : 6) + (sparklines ? 1 : 0)}
                className="text-center text-muted-foreground"
              >
                {assets.length === 0 ? t("grid_empty") : t("ptable_empty_category")}
              </TableCell>
            </TableRow>
          ) : (
            sortedAssets.map((asset, index) => {
              // Cap the stagger so a long portfolio doesn't take seconds to
              // finish animating in — every row past the first 8 mounts
              // together instead of queuing further and further behind.
              const animationDelayMs = Math.min(index, 8) * 40;

              const convertedValue = convertAmount(
                asset.current_value,
                asset.currency,
                displayCurrency,
                rates,
              );

              const isOffplan = asset.metadata?.is_offplan === true;
              const contractPrice =
                typeof asset.metadata?.contract_price === "number"
                  ? asset.metadata.contract_price
                  : null;
              const outstandingBalance =
                typeof asset.metadata?.outstanding_balance === "number"
                  ? asset.metadata.outstanding_balance
                  : null;

              // Ready-built property with a mortgage: the row's headline figure is
              // Net Equity (value − loan), so show what the bank is still owed
              // beside the full market value — same "Total | Owed" format as
              // off-plan. `assetLiability` is the same figure the dashboard's
              // Total Liabilities card uses (amortized balance), so they agree.
              const mortgageOwed =
                (asset.asset_categories?.name === "Real Estate" && !isOffplan) ||
                asset.asset_categories?.name === "Private Equity"
                  ? assetLiability(asset)
                  : 0;
              const mortgageTotal = mortgageOwed > 0 ? grossAssetValue(asset) : 0;
              // Headline figure for a mortgaged property is Net Equity = Total −
              // Owed, computed from today's amortized balance — the same figure
              // the Net Worth / Total Liabilities cards use. The stored
              // `current_value` is only a snapshot from the last valuation
              // update, which drifts from it as the loan amortizes.
              const displayedValue =
                mortgageOwed > 0
                  ? convertAmount(
                      mortgageTotal - mortgageOwed,
                      asset.currency,
                      displayCurrency,
                      rates,
                    )
                  : convertedValue;

              // Performance column — Real Estate: total cost basis
              // (contract/purchase price + fees) vs. market valuation.
              // Vehicles: latest valuation vs. purchase price (or the
              // earliest valuation), precomputed in `performanceByAsset`.
              // Categories with no cost basis on file show "—".
              const isRealEstate = asset.asset_categories?.name === "Real Estate";
              const reMetadata = isRealEstate
                ? parseRealEstateMetadata(asset.metadata)
                : null;
              const marketValuation = reMetadata
                ? reMetadata.market_valuation ?? asset.current_value
                : asset.current_value;
              const totalCost = reMetadata
                ? calculateTotalCost(reMetadata, marketValuation)
                : null;
              const unrealizedGain =
                totalCost != null
                  ? calculateUnrealizedGain(marketValuation, totalCost)
                  : (performanceByAsset?.[asset.id] ?? null);
              const convertedGain =
                unrealizedGain != null
                  ? convertAmount(
                      unrealizedGain.amount,
                      asset.currency,
                      displayCurrency,
                      rates,
                    )
                  : null;
              const gainPercent = unrealizedGain?.percent ?? null;
              const gainColorClass =
                convertedGain == null || convertedGain === 0
                  ? "text-muted-foreground"
                  : convertedGain > 0
                    ? "text-success"
                    : "text-destructive";
              const gainSign =
                convertedGain != null && convertedGain !== 0
                  ? convertedGain > 0
                    ? "+"
                    : "-"
                  : "";

              const assetForEdit: AssetForEdit = {
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
              };

              return (
                <TableRow
                  key={asset.id}
                  data-density={density}
                  className={cn(
                    "cursor-pointer hover:bg-muted/50 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none",
                    densityClasses.row,
                  )}
                  style={{
                    animationDelay: `${animationDelayMs}ms`,
                    animationFillMode: "backwards",
                  }}
                >
                  {onToggleAsset && (
                    <TableCell className="w-10">
                      <Checkbox
                        aria-label={`Select ${asset.name}`}
                        checked={selectedIds?.has(asset.id) ?? false}
                        onCheckedChange={(checked) =>
                          onToggleAsset(asset.id, checked === true)
                        }
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium text-foreground">
                    <Link
                      href={`/dashboard/assets/${asset.id}`}
                      className="flex items-center gap-2"
                    >
                      <Avatar size="sm" className="rounded-md">
                        <AvatarImage
                          src={photoThumbUrl(asset.images?.[0])}
                          alt=""
                          className="object-contain"
                          loading="lazy"
                          decoding="async"
                        />
                        <AvatarFallback className="rounded-md">
                          {categoryIconFor(asset.asset_categories?.name) ? (
                            <CategoryIcon
                              name={asset.asset_categories?.name}
                              className="size-3.5"
                            />
                          ) : (
                            asset.asset_categories?.name?.[0]?.toUpperCase() ??
                            "?"
                          )}
                        </AvatarFallback>
                      </Avatar>
                      {asset.name}
                      {isOffplan && <Badge variant="secondary">Off-Plan</Badge>}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {asset.asset_categories?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-muted-foreground">
                    {asset.quantity}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-end tabular-nums",
                      asset.is_liability
                        ? "text-destructive"
                        : "text-foreground",
                    )}
                  >
                    {asset.is_liability ? "-" : ""}
                    {maskValue(currencyFormatter.format(displayedValue))}
                    {isOffplan &&
                      contractPrice != null &&
                      outstandingBalance != null && (
                        <p className="text-xs font-normal text-muted-foreground">
                          Total:{" "}
                          {maskValue(
                            currencyFormatter.format(
                              convertAmount(
                                contractPrice,
                                asset.currency,
                                displayCurrency,
                                rates,
                              ),
                            ),
                          )}{" "}
                          | Owed:{" "}
                          {maskValue(
                            currencyFormatter.format(
                              convertAmount(
                                outstandingBalance,
                                asset.currency,
                                displayCurrency,
                                rates,
                              ),
                            ),
                          )}
                        </p>
                      )}
                    {mortgageOwed > 0 && (
                      <p className="text-xs font-normal text-muted-foreground">
                        Total:{" "}
                        {maskValue(
                          currencyFormatter.format(
                            convertAmount(mortgageTotal, asset.currency, displayCurrency, rates),
                          ),
                        )}{" "}
                        | Owed:{" "}
                        {maskValue(
                          currencyFormatter.format(
                            convertAmount(mortgageOwed, asset.currency, displayCurrency, rates),
                          ),
                        )}
                      </p>
                    )}
                  </TableCell>
                  {sparklines && (
                    <TableCell>
                      <MicroSparkline values={sparklines[asset.id] ?? []} label />
                    </TableCell>
                  )}
                  <TableCell className="text-end tabular-nums">
                    {convertedGain == null || gainPercent == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-col">
                        <span className={gainColorClass}>
                          {maskValue(
                            `${gainSign}${currencyFormatter.format(Math.abs(convertedGain))}`,
                          )}
                        </span>
                        <span className={cn("text-sm", gainColorClass)}>
                          {maskValue(
                            `${gainPercent >= 0 ? "+" : "-"}${Math.abs(gainPercent).toFixed(2)}%`,
                          )}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-2">
                      {sharedAssetIds?.includes(asset.id) ? (
                        <Button asChild variant="outline" size="icon-sm" aria-label={t("edit_on_asset_page")} title={t("edit_on_asset_page")}>
                          <Link href={`/dashboard/assets/${asset.id}`}>
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                      ) : asset.is_liability ? (
                        <AddLiabilityDialog liability={assetForEdit} />
                      ) : (
                        <AddAssetDialog categories={categories} asset={assetForEdit} />
                      )}
                      <DeleteAssetButton id={asset.id} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
