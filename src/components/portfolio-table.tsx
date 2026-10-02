"use client";

import Link from "next/link";
import { CategoryIcon, categoryIconFor } from "@/components/category-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { photoThumbUrl } from "@/lib/asset-photos";
import { Badge } from "@/components/ui/badge";
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
import { AddAssetDialog, type AssetForEdit } from "@/components/add-asset-dialog";
import { AddLiabilityDialog } from "@/components/add-liability-dialog";
import { DeleteAssetButton } from "@/components/delete-asset-button";
import { usePrivacy } from "@/context/privacy-context";
import { convertAmount } from "@/lib/fx";
import { assetLiability, grossAssetValue } from "@/lib/liabilities";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/language-context";
import {
  calculateTotalCost,
  calculateUnrealizedGain,
  parseRealEstateMetadata,
} from "@/lib/real-estate";

type Category = { id: string; name: string };

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
}) {
  const { maskValue } = usePrivacy();
  const { intlLocale } = useLanguage();

  const currencyFormatter = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: displayCurrency,
  });

  const visibleIds = assets.map((asset) => asset.id);
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
      className="border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <Table>
        <TableCaption className="sr-only">
          Your portfolio holdings, with category, quantity, value and
          performance. Each row links to that asset&apos;s detail page.
        </TableCaption>
        <TableHeader>
          <TableRow>
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
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-end">Quantity</TableHead>
            <TableHead className="text-end">
              Value ({displayCurrency})
            </TableHead>
            <TableHead className="text-end">Performance</TableHead>
            <TableHead className="text-end">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={onToggleAll ? 7 : 6}
                className="text-center text-muted-foreground"
              >
                No assets yet. Add your first one to get started.
              </TableCell>
            </TableRow>
          ) : (
            assets.map((asset, index) => {
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
                  className="cursor-pointer hover:bg-muted/50 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
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
                      {asset.is_liability ? (
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
