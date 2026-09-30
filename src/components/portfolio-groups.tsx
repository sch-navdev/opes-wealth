"use client";

import { useState, useTransition } from "react";
import { Briefcase, Building2, Car, ChevronDown, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BrokerageHoldingsTable } from "@/components/brokerage-holdings-table";
import { PortfolioTable } from "@/components/portfolio-table";
import { batchDeleteAssets } from "@/app/dashboard/actions";
import { usePrivacy } from "@/context/privacy-context";
import { useLanguage } from "@/context/language-context";
import { convertAmount } from "@/lib/fx";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";

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

/** Maps the DB-seeded category names (`0001_initial_schema.sql`/`0009_vehicle_private_equity_categories.sql`) to a translated group heading. A category not in this map (e.g. one added later by hand) just falls back to its raw stored name. */
export const CATEGORY_NAME_KEYS: Record<string, TranslationKey> = {
  "Real Estate": "category_real_estate",
  SCPI: "category_scpi",
  Equities: "category_equities",
  Crypto: "category_crypto",
  Cash: "category_cash",
  Liabilities: "category_liabilities",
  Vehicles: "category_vehicles",
  "Private Equity": "category_private_equity",
};

function CategoryIcon({ name }: { name: string }) {
  if (name === "Real Estate") return <Building2 className="size-4" />;
  if (name === "Vehicles") return <Car className="size-4" />;
  if (name === "Private Equity") return <Briefcase className="size-4" />;
  return null;
}

export function PortfolioGroups({
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
  const { t } = useLanguage();
  // Folders start closed — that's the whole point of grouping: a glance at
  // the category/count/subtotal without the full row list until asked for.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteError, setBatchDeleteError] = useState<string | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [isBatchDeleting, startBatchDeleteTransition] = useTransition();

  function toggleAsset(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(ids: string[], checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function handleBatchDelete() {
    setBatchDeleteError(null);

    startBatchDeleteTransition(async () => {
      const result = await batchDeleteAssets(Array.from(selectedIds));

      if (result?.error) {
        setBatchDeleteError(result.error);
        return;
      }

      setSelectedIds(new Set());
      setBatchDeleteOpen(false);
    });
  }

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: displayCurrency,
  });

  if (assets.length === 0) {
    return (
      <PortfolioTable
        assets={[]}
        categories={categories}
        displayCurrency={displayCurrency}
        rates={rates}
      />
    );
  }

  const groups = new Map<string, { name: string; assets: AssetRow[] }>();
  for (const asset of assets) {
    const key = asset.category_id;
    if (!groups.has(key)) {
      groups.set(key, { name: asset.asset_categories?.name ?? "—", assets: [] });
    }
    groups.get(key)!.assets.push(asset);
  }

  // Preserve the category ordering already applied server-side (by name),
  // then append any group whose category_id wasn't in that list (shouldn't
  // normally happen, but a group must never silently disappear).
  const orderedIds = [
    ...categories.map((c) => c.id).filter((id) => groups.has(id)),
    ...Array.from(groups.keys()).filter(
      (id) => !categories.some((c) => c.id === id),
    ),
  ];

  return (
    <div className="space-y-3">
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between border border-border bg-muted/30 px-4 py-2">
          <span className="text-sm text-foreground">
            {t("selected_count", { n: selectedIds.size })}
          </span>
          <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="size-4" />
                {t("batch_delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-border bg-card">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-foreground">
                  {t("batch_delete_confirm_title", { n: selectedIds.size })}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">
                  {t("batch_delete_confirm_desc", { n: selectedIds.size })}
                </AlertDialogDescription>
              </AlertDialogHeader>

              {batchDeleteError && (
                <p className="text-sm text-destructive" role="alert">
                  {batchDeleteError}
                </p>
              )}

              <AlertDialogFooter>
                <AlertDialogCancel disabled={isBatchDeleting}>
                  {t("cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    handleBatchDelete();
                  }}
                  disabled={isBatchDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isBatchDeleting ? t("batch_deleting") : t("delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
      {orderedIds.map((categoryId) => {
        const group = groups.get(categoryId)!;
        const isOpen = expanded[categoryId] ?? false;
        const translationKey = CATEGORY_NAME_KEYS[group.name];
        const label = translationKey ? t(translationKey) : group.name;

        const subtotal = group.assets.reduce((sum, asset) => {
          const converted = convertAmount(
            asset.current_value,
            asset.currency,
            displayCurrency,
            rates,
          );
          return sum + (asset.is_liability ? -converted : converted);
        }, 0);

        return (
          <Collapsible
            key={categoryId}
            open={isOpen}
            onOpenChange={(open) =>
              setExpanded((prev) => ({ ...prev, [categoryId]: open }))
            }
            className="border border-border"
          >
            <CollapsibleTrigger
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <div className="flex min-w-0 items-center gap-2">
                <CategoryIcon name={group.name} />
                <span className="truncate font-medium text-foreground">
                  {label}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  ({group.assets.length})
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={cn(
                    "text-sm font-medium tabular-nums",
                    subtotal < 0 ? "text-destructive" : "text-foreground",
                  )}
                >
                  {subtotal < 0 ? "-" : ""}
                  {maskValue(currencyFormatter.format(Math.abs(subtotal)))}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {group.name === "Equities" ? (
                <BrokerageHoldingsTable
                  assets={group.assets}
                  displayCurrency={displayCurrency}
                  rates={rates}
                  selectedIds={selectedIds}
                  onToggleAsset={toggleAsset}
                  onToggleAll={toggleAll}
                />
              ) : (
                <PortfolioTable
                  assets={group.assets}
                  categories={categories}
                  displayCurrency={displayCurrency}
                  rates={rates}
                  selectedIds={selectedIds}
                  onToggleAsset={toggleAsset}
                  onToggleAll={toggleAll}
                />
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
