"use client";

import { useState, useTransition } from "react";
import { Edit } from "lucide-react";
import { updateAsset } from "@/app/dashboard/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InstitutionLogo } from "@/components/institution-logo";
import { OwnerShareNote } from "@/components/owner-share-note";
import { useEditBankText } from "@/components/edit-bank-account-text";
import { useLanguage } from "@/context/language-context";
import { accountCountry, countryOptions, institutionOfMetadata } from "@/lib/banking/account-country";
import { countryFlag, countryLabel } from "@/lib/banking/bank-picker";
import { logoBankByName } from "@/lib/banking/institutions";
import { currencies, getCurrencySymbol } from "@/lib/currencies";

export type BankAccountForEdit = {
  id: string;
  name: string;
  category_id: string;
  quantity: number;
  current_value: number;
  currency: string;
  metadata: Record<string, unknown> | null;
  images: string[] | null;
  ticker_symbol?: string | null;
  purchase_date: string;
};

const NO_COUNTRY = "__none__";

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

/** The bank's logo (from the registry) or, for a bank we have no logo for, its initials. */
function BankLogo({ name }: { name: string }) {
  const bank = name.trim() ? logoBankByName(name.trim()) : undefined;
  if (bank) return <InstitutionLogo kind="bank" id={bank.key} name={name} size="lg" />;
  return (
    <Avatar size="lg" className="rounded-md bg-background ring-1 ring-border">
      <AvatarFallback className="rounded-md text-xs font-semibold" data-testid="ebk-logo-initials">
        {name.trim() ? initials(name) : "?"}
      </AvatarFallback>
    </Avatar>
  );
}

const textOf = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Dedicated "Edit Bank Account" modal for Cash accounts (the Specifications tab's Edit button). Compared
 * with the generic asset dialog: bank logo instead of the image upload, no Category and no
 * ownership section, a Country field, and Quantity / Balance / Currency locked for IMPORTED accounts
 * (their numbers come from statements). The save goes through the same `updateAsset` action
 * (and so `routeAssetEdit`); every metadata key this form does not own (`bank_profile`,
 * `purpose`, ...) is carried over untouched.
 */
export function EditBankAccountDialog({
  asset,
  imported,
  trigger,
  ownerShareFactor = 1,
}: {
  asset: BankAccountForEdit;
  /** Computed by the caller (`isImportedBankAccount`): locks Quantity, Balance and Currency. */
  imported: boolean;
  trigger?: React.ReactNode;
  ownerShareFactor?: number;
}) {
  const { t, intlLocale } = useLanguage();
  const tx = useEditBankText();
  const meta = asset.metadata ?? {};

  const initial = () => ({
    institution: institutionOfMetadata(meta),
    name: asset.name,
    accountRef: textOf(meta.account_ref),
    country: accountCountry(meta) || NO_COUNTRY,
    notes: textOf(meta.notes),
    quantity: String(asset.quantity),
    value: String(asset.current_value),
    currency: asset.currency,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof ReturnType<typeof initial>>(key: K, value: ReturnType<typeof initial>[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function reset() {
    setForm(initial());
    setError(null);
    setNotice(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const name = form.name.trim();
    if (!name) {
      setError(tx("ebk_error_name"));
      return;
    }
    // Imported accounts keep the stored numbers exactly as they are.
    const quantity = imported ? asset.quantity : Number(form.quantity);
    const value = imported ? asset.current_value : Number(form.value);
    const currency = imported ? asset.currency : form.currency;
    if (!imported && (form.value.trim() === "" || !Number.isFinite(value))) {
      setError(tx("ebk_error_value"));
      return;
    }

    // Start from the stored metadata so unknown keys survive; only the keys this form owns change.
    const metadata: Record<string, unknown> = { ...meta };
    const setOrDrop = (key: string, v: string) => {
      if (v) metadata[key] = v;
      else delete metadata[key];
    };
    const institution = form.institution.trim();
    if (institution !== institutionOfMetadata(meta)) {
      setOrDrop("institution_name", institution);
      const bank = institution ? logoBankByName(institution) : undefined;
      setOrDrop("bank_key", bank?.key ?? "");
    }
    setOrDrop("account_ref", form.accountRef.trim());
    setOrDrop("country", form.country === NO_COUNTRY ? "" : form.country);
    setOrDrop("notes", form.notes.trim());

    const formData = new FormData();
    formData.set("name", name);
    formData.set("category_id", asset.category_id);
    formData.set("quantity", String(quantity));
    formData.set("current_value", String(value));
    formData.set("currency", currency);
    formData.set("purchase_date", asset.purchase_date);
    formData.set("images", JSON.stringify(asset.images ?? []));
    formData.set("ticker_symbol", asset.ticker_symbol ?? "");
    formData.set("metadata", JSON.stringify(metadata));

    startTransition(async () => {
      const result = await updateAsset(asset.id, formData);
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      if (result && "pending" in result && result.pending) {
        // A registered co-owner must approve first: nothing changed yet.
        setNotice(t("change_pending_notice") + " " + t("change_pending_see_status"));
        return;
      }
      setOpen(false);
    });
  }

  const countries = countryOptions(form.country !== NO_COUNTRY ? form.country : undefined);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("asset_dialog_edit_aria")}
            onClick={(e) => e.stopPropagation()}
          >
            <Edit className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[95vw] overflow-y-auto overflow-x-hidden border-border bg-card p-6 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">{tx("ebk_title")}</DialogTitle>
          <DialogDescription className="text-muted-foreground">{tx("ebk_desc")}</DialogDescription>
          <OwnerShareNote factor={ownerShareFactor} variant="edit" />
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3">
            <BankLogo name={form.institution} />
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="ebk_bank">{tx("ebk_bank")}</Label>
              <Input
                id="ebk_bank"
                value={form.institution}
                maxLength={100}
                placeholder={tx("ebk_bank_ph")}
                onChange={(e) => set("institution", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ebk_name">{tx("ebk_name")}</Label>
            <Input
              id="ebk_name"
              value={form.name}
              maxLength={120}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ebk_ref">{tx("ebk_account_ref")}</Label>
              <Input
                id="ebk_ref"
                value={form.accountRef}
                maxLength={40}
                autoComplete="off"
                onChange={(e) => set("accountRef", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{tx("ebk_account_ref_hint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ebk_country">{tx("ebk_country")}</Label>
              <Select value={form.country} onValueChange={(v) => set("country", v)}>
                <SelectTrigger id="ebk_country" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_COUNTRY}>{tx("ebk_country_none")}</SelectItem>
                  {countries.map((c) => (
                    <SelectItem key={c} value={c}>
                      {countryFlag(c)} {countryLabel(c, intlLocale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{tx("ebk_country_hint")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="ebk_quantity">{tx("ebk_quantity")}</Label>
              <Input
                id="ebk_quantity"
                type="number"
                step="any"
                min="0"
                value={imported ? String(asset.quantity) : form.quantity}
                disabled={imported}
                onChange={(e) => set("quantity", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ebk_value">{tx("ebk_value")}</Label>
              <div className="relative">
                <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {getCurrencySymbol(imported ? asset.currency : form.currency)}
                </span>
                <Input
                  id="ebk_value"
                  type="number"
                  step="any"
                  className="ps-12"
                  value={imported ? String(asset.current_value) : form.value}
                  disabled={imported}
                  onChange={(e) => set("value", e.target.value)}
                  required={!imported}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ebk_currency">{tx("ebk_currency")}</Label>
              <Select
                value={imported ? asset.currency : form.currency}
                onValueChange={(v) => set("currency", v)}
                disabled={imported}
              >
                <SelectTrigger id="ebk_currency" className="w-full">
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
          </div>
          {imported && (
            <p className="text-xs text-muted-foreground" data-testid="ebk-locked-note">
              {tx("ebk_locked")}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="ebk_notes">{tx("ebk_notes")}</Label>
            <Input
              id="ebk_notes"
              value={form.notes}
              maxLength={500}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          {notice && (
            <p className="border border-primary bg-primary/5 p-3 text-sm text-foreground" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("saving") : t("asset_dialog_save_changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
