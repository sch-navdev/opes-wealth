"use client";

import Link from "next/link";
import { Briefcase, Building2, Car } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddAssetDialog, type AssetForEdit } from "@/components/add-asset-dialog";
import { DeleteAssetButton } from "@/components/delete-asset-button";
import { usePrivacy } from "@/context/privacy-context";
import { convertAmount } from "@/lib/fx";
import { cn } from "@/lib/utils";
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
  asset_categories: { name: string } | null;
};

export function PortfolioTable({
  assets,
  categories,
  displayCurrency,
  rates,
}: {
  assets: AssetRow[];
  categories: Category[];
  displayCurrency: string;
  rates: Record<string, number>;
}) {
  const { maskValue } = usePrivacy();

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: displayCurrency,
  });

  return (
    <div className="border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">
              Value ({displayCurrency})
            </TableHead>
            <TableHead className="text-right">Performance</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center text-muted-foreground"
              >
                No assets yet. Add your first one to get started.
              </TableCell>
            </TableRow>
          ) : (
            assets.map((asset) => {
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

              // Performance column — total cost basis (contract/purchase
              // price + registration fee + agency/renovation/furnishing
              // fees) vs. market valuation. Only meaningful for Real
              // Estate assets, which are the only category with a cost
              // basis on file; other categories show "—".
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
                  : null;
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
              };

              return (
                <TableRow
                  key={asset.id}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell className="font-medium text-foreground">
                    <Link
                      href={`/dashboard/assets/${asset.id}`}
                      className="flex items-center gap-2"
                    >
                      <Avatar size="sm" className="rounded-md">
                        <AvatarImage
                          src={asset.images?.[0] || undefined}
                          alt=""
                        />
                        <AvatarFallback className="rounded-md">
                          {asset.asset_categories?.name === "Real Estate" ? (
                            <Building2 className="size-3.5" />
                          ) : asset.asset_categories?.name === "Vehicles" ? (
                            <Car className="size-3.5" />
                          ) : asset.asset_categories?.name === "Private Equity" ? (
                            <Briefcase className="size-3.5" />
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
                  <TableCell className="text-right text-muted-foreground">
                    {asset.quantity}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      asset.is_liability
                        ? "text-destructive"
                        : "text-foreground",
                    )}
                  >
                    {asset.is_liability ? "-" : ""}
                    {maskValue(currencyFormatter.format(convertedValue))}
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
                  </TableCell>
                  <TableCell className="text-right">
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
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <AddAssetDialog categories={categories} asset={assetForEdit} />
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
