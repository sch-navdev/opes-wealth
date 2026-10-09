"use client";

import { moneyFormatter } from "@/lib/money-parts";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { AddLiabilityDialog } from "@/components/add-liability-dialog";
import { CategoryIcon } from "@/components/category-icon";
import { DeleteAssetButton } from "@/components/delete-asset-button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { convertAmount } from "@/lib/fx";
import type { TranslationKey } from "@/lib/i18n";
import { assetLiability } from "@/lib/liabilities";
import { parseLiabilityMetadata, type LiabilityType } from "@/lib/liability";
import { parseRealEstateMetadata } from "@/lib/real-estate";
import { cn } from "@/lib/utils";

type LiabilitySource = {
  id: string;
  name: string;
  category_id: string;
  current_value: number;
  currency: string;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  purchase_date: string;
  asset_categories: { name: string } | null;
};

type Line = {
  key: string;
  /** Asset id to open (the liability itself, or the asset that carries the debt). */
  assetId: string;
  name: string;
  typeKey: TranslationKey;
  /** For derived debts: the property / fund it belongs to. */
  source: string | null;
  /** Standalone liability rows can be edited/deleted here; derived ones belong to their asset. */
  standalone: LiabilitySource | null;
  owed: number;
  currency: string;
};

const LIABILITY_TYPE_KEYS: Record<LiabilityType, TranslationKey> = {
  loan: "liability_type_loan",
  mortgage: "liability_type_mortgage",
  credit_card: "liability_type_credit_card",
  other: "liability_type_other",
};

/** Every debt, in one place: standalone liabilities plus the debt that lives inside other assets (property loans, off-plan balances, private-equity capital calls). */
function collectLines(assets: LiabilitySource[]): Line[] {
  const lines: Line[] = [];
  for (const asset of assets) {
    if (asset.is_liability) {
      const meta = parseLiabilityMetadata(asset.metadata);
      lines.push({
        key: asset.id,
        assetId: asset.id,
        name: asset.name,
        typeKey: LIABILITY_TYPE_KEYS[meta.liability_type] ?? "liability_type_other",
        source: meta.lender_name || null,
        standalone: asset,
        owed: asset.current_value,
        currency: asset.currency,
      });
      continue;
    }
    const total = assetLiability(asset);
    if (!(total > 0)) continue;
    if (asset.asset_categories?.name === "Private Equity") {
      lines.push({
        key: `${asset.id}:calls`,
        assetId: asset.id,
        name: asset.name,
        typeKey: "liabilities_type_capital_calls",
        source: asset.name,
        standalone: null,
        owed: total,
        currency: asset.currency,
      });
    } else if (asset.asset_categories?.name === "Real Estate") {
      const meta = parseRealEstateMetadata(asset.metadata);
      const offplan = meta.is_offplan ? meta.outstanding_balance : 0;
      const loan = total - offplan;
      if (loan > 0) {
        lines.push({
          key: `${asset.id}:loan`,
          assetId: asset.id,
          name: asset.name,
          typeKey: "liabilities_type_property_loan",
          source: asset.name,
          standalone: null,
          owed: loan,
          currency: asset.currency,
        });
      }
      if (offplan > 0) {
        lines.push({
          key: `${asset.id}:offplan`,
          assetId: asset.id,
          name: asset.name,
          typeKey: "liabilities_type_offplan",
          source: asset.name,
          standalone: null,
          owed: offplan,
          currency: asset.currency,
        });
      }
    }
  }
  return lines;
}

/**
 * The portfolio's "Liabilities" folder, shown like Brokerage / Private Equity /
 * Real Estate / Vehicles: a collapsible card with a count and a (negative)
 * subtotal that matches the dashboard's Total Liabilities. Always present, with
 * an empty-state hint, so debts are easy to find and add. Replaces the generic
 * category folder for the Liabilities category.
 */
export function LiabilitiesGroup({
  assets,
  displayCurrency,
  rates,
}: {
  assets: LiabilitySource[];
  displayCurrency: string;
  rates: Record<string, number>;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const [isOpen, setIsOpen] = useState(false);
  const money = moneyFormatter(intlLocale, displayCurrency);

  const lines = collectLines(assets)
    .map((line) => ({ line, base: convertAmount(line.owed, line.currency, displayCurrency, rates) }))
    .sort((a, b) => b.base - a.base);
  const total = lines.reduce((sum, l) => sum + l.base, 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border border-border">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 px-4 py-3 text-start hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
        <div className="flex min-w-0 items-center gap-2">
          <CategoryIcon name="Liabilities" />
          <span className="truncate font-medium text-foreground">{t("category_liabilities")}</span>
          <span className="shrink-0 text-xs text-muted-foreground">({lines.length})</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              total > 0 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {total > 0 ? "-" : ""}
            {maskValue(money.format(total))}
          </span>
          <ChevronDown
            className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {lines.length === 0 ? (
          <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">
            {t("liabilities_empty")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("liabilities_col_name")}</TableHead>
                <TableHead>{t("liabilities_col_type")}</TableHead>
                <TableHead>{t("liabilities_col_source")}</TableHead>
                <TableHead className="text-end">{t("liabilities_col_balance")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map(({ line, base }) => {
                const native = moneyFormatter(intlLocale, line.currency);
                return (
                  <TableRow key={line.key}>
                    <TableCell className="font-medium">
                      <Link href={`/dashboard/assets/${line.assetId}`} className="hover:underline">
                        {line.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{t(line.typeKey)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {line.standalone ? (line.source ?? "—") : t("liabilities_auto_note")}
                    </TableCell>
                    <TableCell className="text-end tabular-nums text-destructive">
                      <div className="flex flex-col">
                        <span>-{maskValue(money.format(base))}</span>
                        {line.currency !== displayCurrency && (
                          <span className="text-xs text-muted-foreground">
                            {maskValue(native.format(line.owed))}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-end">
                      {line.standalone && (
                        <div className="flex justify-end gap-2">
                          <AddLiabilityDialog liability={line.standalone} />
                          <DeleteAssetButton id={line.standalone.id} />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
