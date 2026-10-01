"use client";

import { useState, useTransition } from "react";
import { Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useLanguage } from "@/context/language-context";
import { currencies, getCurrencySymbol } from "@/lib/currencies";
import {
  EMPTY_LIABILITY_METADATA,
  LIABILITY_TYPES,
  getLiabilityErrors,
  parseLiabilityMetadata,
  type LiabilityMetadata,
  type LiabilityType,
} from "@/lib/liability";
import { addLiability, updateLiability } from "@/app/dashboard/actions";
import type { TranslationKey } from "@/lib/i18n";

const todayIso = new Date().toISOString().slice(0, 10);

const TYPE_LABEL_KEYS: Record<LiabilityType, TranslationKey> = {
  loan: "liability_type_loan",
  mortgage: "liability_type_mortgage",
  credit_card: "liability_type_credit_card",
  other: "liability_type_other",
};

export type LiabilityForEdit = {
  id: string;
  name: string;
  current_value: number;
  currency: string;
  metadata: Record<string, unknown> | null;
  purchase_date: string;
};

function toNumberOrNull(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * The dedicated "Add Liability" flow (loans, mortgages not tied to a tracked
 * property, credit cards) — separate from Add Asset, whose category list no
 * longer offers "Liabilities". Also the editor for an existing liability row.
 */
export function AddLiabilityDialog({
  liability,
  trigger,
}: {
  liability?: LiabilityForEdit;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!liability;
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const initialMetadata = () =>
    liability ? parseLiabilityMetadata(liability.metadata) : EMPTY_LIABILITY_METADATA;
  const [name, setName] = useState(liability?.name ?? "");
  const [balance, setBalance] = useState(liability ? String(liability.current_value) : "");
  const [currency, setCurrency] = useState(liability?.currency ?? "USD");
  const [startDate, setStartDate] = useState(liability?.purchase_date ?? todayIso);
  const [metadata, setMetadata] = useState<LiabilityMetadata>(initialMetadata);

  function reset() {
    setName(liability?.name ?? "");
    setBalance(liability ? String(liability.current_value) : "");
    setCurrency(liability?.currency ?? "USD");
    setStartDate(liability?.purchase_date ?? todayIso);
    setMetadata(initialMetadata());
    setError(null);
  }

  function set<K extends keyof LiabilityMetadata>(key: K, next: LiabilityMetadata[K]) {
    setMetadata((prev) => ({ ...prev, [key]: next }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amount = Number(balance);
    const errors = getLiabilityErrors(name, amount, metadata);
    if (balance.trim() === "") errors.push("liability_balance_invalid");
    if (errors.length > 0) {
      setError(t(errors[0] as TranslationKey));
      return;
    }

    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("current_value", String(amount));
    formData.set("currency", currency);
    formData.set("purchase_date", startDate);
    formData.set("metadata", JSON.stringify(metadata));

    startTransition(async () => {
      const result = isEdit
        ? await updateLiability(liability.id, formData)
        : await addLiability(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if (!isEdit) reset();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ??
          (isEdit ? (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("liability_edit")}
              onClick={(e) => e.stopPropagation()}
            >
              <Edit className="size-4" />
            </Button>
          ) : (
            <Button variant="outline">{t("liability_add")}</Button>
          ))}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[95vw] overflow-y-auto border-border bg-card sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {isEdit ? t("liability_edit") : t("liability_add")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("liability_dialog_desc")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="liability_name">{t("liability_name")}</Label>
            <Input
              id="liability_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("liability_name_placeholder")}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="liability_type">{t("liability_type")}</Label>
              <Select
                value={metadata.liability_type}
                onValueChange={(next) => set("liability_type", next as LiabilityType)}
              >
                <SelectTrigger id="liability_type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIABILITY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(TYPE_LABEL_KEYS[type])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="liability_lender">{t("liability_lender")}</Label>
              <Input
                id="liability_lender"
                value={metadata.lender_name}
                onChange={(e) => set("lender_name", e.target.value)}
              />
            </div>
          </div>

          {metadata.liability_type === "mortgage" && (
            <p className="text-xs text-muted-foreground">{t("liability_mortgage_hint")}</p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="liability_balance">{t("liability_balance")}</Label>
              <div className="relative">
                <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {getCurrencySymbol(currency)}
                </span>
                <Input
                  id="liability_balance"
                  type="number"
                  step="any"
                  min="0"
                  className="ps-12"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="liability_currency">{t("currency_label")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="liability_currency" className="w-full">
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
            <div className="space-y-2">
              <Label htmlFor="liability_start">{t("liability_start_date")}</Label>
              <Input
                id="liability_start"
                type="date"
                max={todayIso}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="liability_rate">{t("liability_rate")}</Label>
              <Input
                id="liability_rate"
                type="number"
                step="0.01"
                min="0"
                value={metadata.interest_rate ?? ""}
                onChange={(e) => set("interest_rate", toNumberOrNull(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="liability_payment">{t("liability_monthly_payment")}</Label>
              <Input
                id="liability_payment"
                type="number"
                step="any"
                min="0"
                value={metadata.monthly_payment ?? ""}
                onChange={(e) => set("monthly_payment", toNumberOrNull(e.target.value))}
              />
            </div>
            {metadata.liability_type === "credit_card" && (
              <div className="space-y-2">
                <Label htmlFor="liability_limit">{t("liability_credit_limit")}</Label>
                <Input
                  id="liability_limit"
                  type="number"
                  step="any"
                  min="0"
                  value={metadata.credit_limit ?? ""}
                  onChange={(e) => set("credit_limit", toNumberOrNull(e.target.value))}
                />
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("liability_saving") : isEdit ? t("liability_save") : t("liability_add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
