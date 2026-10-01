"use client";

import Link from "next/link";
import { Landmark, Upload } from "lucide-react";
import { AddAssetDialog } from "@/components/add-asset-dialog";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";

export type CashAccount = {
  id: string;
  name: string;
  currency: string;
  /** Balance in the account's own currency (what the CSV import reconciles against). */
  nativeValue: number;
  /** Balance in the dashboard Base Currency. */
  baseValue: number;
  /** Date of the newest balance on record, if any. */
  lastDate: string | null;
};

/**
 * Dashboard entry point for Cash / bank accounts: a quick summary (accounts,
 * total in the Base Currency) with a per-account "Import CSV" action that
 * opens the same dropzone → column-mapper flow as the asset page's Settings
 * tab. With no accounts yet it offers to create one (Add Asset, Cash preselected).
 */
export function CashBankCard({
  accounts,
  categories,
  baseCurrency,
}: {
  accounts: CashAccount[];
  categories: { id: string; name: string }[];
  baseCurrency: string;
}) {
  const { t } = useLanguage();
  const { maskValue } = usePrivacy();
  const baseFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: baseCurrency });
  const total = accounts.reduce((sum, a) => sum + a.baseValue, 0);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <span className="text-primary">
            <Landmark className="size-4" />
          </span>
          {t("cash_bank_title")}
          {accounts.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              ({accounts.length}) · {maskValue(baseFormatter.format(total))}
            </span>
          )}
        </CardTitle>
        <AddAssetDialog
          categories={categories}
          defaultCategoryName="Cash"
          trigger={
            <Button type="button" variant="outline" size="sm">
              {t("cash_bank_add")}
            </Button>
          }
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("cash_bank_empty")}</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {accounts.map((account) => {
              const native = new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: account.currency,
              });
              return (
                <li
                  key={account.id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/assets/${account.id}`}
                      className="truncate text-sm font-medium text-foreground hover:underline"
                    >
                      {account.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {account.lastDate
                        ? t("cash_bank_last_balance", { date: account.lastDate })
                        : t("cash_bank_no_history")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-medium tabular-nums text-foreground">
                        {maskValue(native.format(account.nativeValue))}
                      </p>
                      {account.currency !== baseCurrency && (
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {maskValue(baseFormatter.format(account.baseValue))}
                        </p>
                      )}
                    </div>
                    <CsvImportDialog
                      assetId={account.id}
                      currentValue={account.nativeValue}
                      currency={account.currency}
                      trigger={
                        <Button type="button" variant="outline" size="sm">
                          <Upload className="size-4" />
                          {t("cash_bank_import_csv")}
                        </Button>
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
