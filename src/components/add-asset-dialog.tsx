"use client";

import { useRef, useState, useTransition } from "react";
import { Edit, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { RealEstateFields } from "@/components/real-estate-fields";
import { VehicleFields } from "@/components/vehicle-fields";
import { PrivateEquityFields } from "@/components/private-equity-fields";
import { EquityFields } from "@/components/equity-fields";
import { CryptoFields } from "@/components/crypto-fields";
import { CompanyFields } from "@/components/company-fields";
import { ScpiFields } from "@/components/scpi-fields";
import { PreciousMetalsFields } from "@/components/precious-metals-fields";
import { useLanguage } from "@/context/language-context";
import { currencies, getCurrencySymbol } from "@/lib/currencies";
import { resizeImageToBase64 } from "@/lib/crop-image";
import {
  EMPTY_REAL_ESTATE_METADATA,
  MAX_ASSET_IMAGES,
  parseRealEstateMetadata,
  resolveOutstandingLoanBalance,
} from "@/lib/real-estate";
import {
  EMPTY_VEHICLE_METADATA,
  getVehicleMetadataErrors,
  parseVehicleMetadata,
} from "@/lib/vehicles";
import {
  EMPTY_PRIVATE_EQUITY_METADATA,
  getPrivateEquityMetadataErrors,
  parsePrivateEquityMetadata,
} from "@/lib/private-equity";
import { EMPTY_EQUITY_METADATA, parseEquityMetadata } from "@/lib/equities";
import {
  EMPTY_CRYPTO_METADATA,
  getCryptoMetadataErrors,
  parseCryptoMetadata,
} from "@/lib/crypto";
import {
  DEFAULT_PURITY,
  EMPTY_PRECIOUS_METAL_METADATA,
  getPreciousMetalErrors,
  parsePreciousMetalMetadata,
} from "@/lib/precious-metals";
import {
  EMPTY_COMPANY_METADATA,
  companyStakeValue,
  getCompanyMetadataErrors,
  parseCompanyMetadata,
} from "@/lib/companies";
import {
  EMPTY_SCPI_METADATA,
  getScpiMetadataErrors,
  parseScpiMetadata,
  scpiCurrentValue,
} from "@/lib/scpi";
import { addAsset, updateAsset } from "@/app/dashboard/actions";
import type { TranslationKey } from "@/lib/i18n";

const todayIso = new Date().toISOString().slice(0, 10);

type Category = {
  id: string;
  name: string;
};

export type AssetForEdit = {
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

export function AddAssetDialog({
  categories,
  asset,
  trigger,
  defaultCategoryName,
  companies = [],
}: {
  categories: Category[];
  asset?: AssetForEdit;
  /** Preselects a category when creating (e.g. "Cash" from the dashboard's Cash & Bank card). */
  defaultCategoryName?: string;
  /** Tracked Companies, offered as the holding vehicle when adding/editing a Company held via a holding. */
  companies?: { id: string; name: string }[];
  /** Custom trigger element (e.g. a "+ Add Loan" button elsewhere on the page). Falls back to the default Edit/Add Asset button. */
  trigger?: React.ReactNode;
}) {
  const isEditMode = !!asset;
  const { t } = useLanguage();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [categoryId, setCategoryId] = useState(
    asset?.category_id ?? categories.find((c) => c.name === defaultCategoryName)?.id ?? "",
  );
  const [currency, setCurrency] = useState(asset?.currency ?? "USD");
  const [images, setImages] = useState<string[]>(asset?.images ?? []);
  const [tickerSymbol, setTickerSymbol] = useState(asset?.ticker_symbol ?? "");
  const [realEstateMetadata, setRealEstateMetadata] = useState(() =>
    asset ? parseRealEstateMetadata(asset.metadata) : EMPTY_REAL_ESTATE_METADATA,
  );
  const [vehicleMetadata, setVehicleMetadata] = useState(() =>
    asset ? parseVehicleMetadata(asset.metadata) : EMPTY_VEHICLE_METADATA,
  );
  const [privateEquityMetadata, setPrivateEquityMetadata] = useState(() =>
    asset ? parsePrivateEquityMetadata(asset.metadata) : EMPTY_PRIVATE_EQUITY_METADATA,
  );
  const [equityMetadata, setEquityMetadata] = useState(() =>
    asset ? parseEquityMetadata(asset.metadata) : EMPTY_EQUITY_METADATA,
  );
  const [cryptoMetadata, setCryptoMetadata] = useState(() =>
    asset ? parseCryptoMetadata(asset.metadata) : EMPTY_CRYPTO_METADATA,
  );
  const [metalMetadata, setMetalMetadata] = useState(() =>
    asset
      ? parsePreciousMetalMetadata(asset.metadata)
      : { ...EMPTY_PRECIOUS_METAL_METADATA, purity: DEFAULT_PURITY.gold },
  );
  const [quantityInput, setQuantityInput] = useState(asset?.quantity ?? 1);
  const [scpiMetadata, setScpiMetadata] = useState(() =>
    asset ? parseScpiMetadata(asset.metadata) : EMPTY_SCPI_METADATA,
  );
  const [companyMetadata, setCompanyMetadata] = useState(() =>
    asset ? parseCompanyMetadata(asset.metadata) : EMPTY_COMPANY_METADATA,
  );

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isRealEstate = selectedCategory?.name === "Real Estate";
  const isVehicle = selectedCategory?.name === "Vehicles";
  const isPrivateEquity = selectedCategory?.name === "Private Equity";
  const isEquity = selectedCategory?.name === "Equities";
  const isCrypto = selectedCategory?.name === "Crypto";
  const isPreciousMetal = selectedCategory?.name === "Precious Metals";
  const isCompany = selectedCategory?.name === "Companies";
  const isScpi = selectedCategory?.name === "SCPI";

  function resetState() {
    setCategoryId(
      asset?.category_id ?? categories.find((c) => c.name === defaultCategoryName)?.id ?? "",
    );
    setCurrency(asset?.currency ?? "USD");
    setImages(asset?.images ?? []);
    setTickerSymbol(asset?.ticker_symbol ?? "");
    setRealEstateMetadata(
      asset ? parseRealEstateMetadata(asset.metadata) : EMPTY_REAL_ESTATE_METADATA,
    );
    setVehicleMetadata(
      asset ? parseVehicleMetadata(asset.metadata) : EMPTY_VEHICLE_METADATA,
    );
    setPrivateEquityMetadata(
      asset ? parsePrivateEquityMetadata(asset.metadata) : EMPTY_PRIVATE_EQUITY_METADATA,
    );
    setEquityMetadata(
      asset ? parseEquityMetadata(asset.metadata) : EMPTY_EQUITY_METADATA,
    );
    setCryptoMetadata(
      asset ? parseCryptoMetadata(asset.metadata) : EMPTY_CRYPTO_METADATA,
    );
    setMetalMetadata(
      asset
        ? parsePreciousMetalMetadata(asset.metadata)
        : { ...EMPTY_PRECIOUS_METAL_METADATA, purity: DEFAULT_PURITY.gold },
    );
    setQuantityInput(asset?.quantity ?? 1);
    setCompanyMetadata(asset ? parseCompanyMetadata(asset.metadata) : EMPTY_COMPANY_METADATA);
    setScpiMetadata(asset ? parseScpiMetadata(asset.metadata) : EMPTY_SCPI_METADATA);
  }

  async function handleImageFileSelected(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || images.length >= MAX_ASSET_IMAGES) return;

    const resized = await resizeImageToBase64(file);
    setImages((prev) => [...prev, resized]);
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const form = formRef.current;
    if (!form) return;

    const formData = new FormData(form);
    formData.set("images", JSON.stringify(images));
    formData.set("ticker_symbol", tickerSymbol.trim());

    if ((isEquity || isCrypto) && !tickerSymbol.trim()) {
      setError(t("ticker_symbol_required"));
      return;
    }

    if (isRealEstate) {
      // The "Current Market Valuation" input reuses the generic
      // `current_value` field, but the DB's `current_value` column should
      // hold net equity instead (market valuation minus any linked loan
      // principal, and minus what's still owed on an off-plan contract),
      // so portfolio totals aren't inflated by debt still outstanding.
      // The raw market valuation is preserved in metadata so it can be
      // re-edited later without double-subtracting.
      const marketValuation = Number(formData.get("current_value"));
      const loanPrincipal = resolveOutstandingLoanBalance(
        realEstateMetadata.linked_loan,
      );
      const outstandingOffplan = realEstateMetadata.is_offplan
        ? realEstateMetadata.outstanding_balance
        : 0;
      const netEquity = marketValuation - outstandingOffplan - loanPrincipal;

      const metadata = { ...realEstateMetadata, market_valuation: marketValuation };
      formData.set("current_value", String(netEquity));
      formData.set("metadata", JSON.stringify(metadata));
    } else if (isVehicle) {
      const errors = getVehicleMetadataErrors(vehicleMetadata);
      if (errors.length > 0) {
        setError(t(errors[0] as TranslationKey));
        return;
      }
      formData.set("metadata", JSON.stringify(vehicleMetadata));
    } else if (isPrivateEquity) {
      const errors = getPrivateEquityMetadataErrors(privateEquityMetadata);
      if (errors.length > 0) {
        setError(t(errors[0] as TranslationKey));
        return;
      }
      formData.set("metadata", JSON.stringify(privateEquityMetadata));
    } else if (isEquity) {
      formData.set("metadata", JSON.stringify(equityMetadata));
    } else if (isCrypto) {
      const errors = getCryptoMetadataErrors(cryptoMetadata);
      if (errors.length > 0) {
        setError(t(errors[0] as TranslationKey));
        return;
      }
      formData.set("metadata", JSON.stringify(cryptoMetadata));
    } else if (isScpi) {
      const shares = Number(formData.get("quantity"));
      const errors = getScpiMetadataErrors(scpiMetadata, shares);
      if (errors.length > 0) {
        setError(t(errors[0] as TranslationKey));
        return;
      }
      // Value = shares × withdrawal value (what a sale would return today).
      formData.set("current_value", String(scpiCurrentValue(scpiMetadata, shares) ?? 0));
      formData.set("metadata", JSON.stringify(scpiMetadata));
    } else if (isCompany) {
      const errors = getCompanyMetadataErrors(companyMetadata);
      if (errors.length > 0) {
        setError(t(errors[0] as TranslationKey));
        return;
      }
      // The Value field holds the equity value of 100% of the entity;
      // `current_value` is YOUR stake in it (value × ownership %).
      const equityValue = Number(formData.get("current_value"));
      formData.set(
        "current_value",
        String(companyStakeValue(equityValue, companyMetadata.ownership_percentage)),
      );
      formData.set(
        "metadata",
        JSON.stringify({ ...companyMetadata, company_value: equityValue }),
      );
    } else if (isPreciousMetal) {
      const errors = getPreciousMetalErrors(metalMetadata);
      if (errors.length > 0) {
        setError(t(errors[0] as TranslationKey));
        return;
      }
      formData.set("metadata", JSON.stringify(metalMetadata));
    }

    startTransition(async () => {
      const result = isEditMode
        ? await updateAsset(asset.id, formData)
        : await addAsset(formData);

      if (result?.error) {
        setError(result.error);
        return;
      }

      setOpen(false);
      if (!isEditMode) form.reset();
      resetState();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetState();
      }}
    >
      <DialogTrigger asChild>
        {trigger ??
          (isEditMode ? (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Edit asset"
              onClick={(e) => e.stopPropagation()}
            >
              <Edit className="size-4" />
            </Button>
          ) : (
            <Button>Add Asset</Button>
          ))}
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-2xl border-border bg-card p-6 max-h-[85vh] overflow-y-auto overflow-x-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {isEditMode ? "Edit Asset" : "Add Asset"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEditMode
              ? "Update the details for this asset."
              : "Track a new asset or liability in your portfolio."}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="w-full min-w-0 space-y-2">
            <Label>Images ({images.length}/{MAX_ASSET_IMAGES})</Label>
            <div className="flex w-full min-w-0 flex-wrap items-center gap-3">
              {images.map((src, index) => (
                <div key={index} className="relative">
                  <Avatar size="lg" className="rounded-md">
                    <AvatarImage src={src} alt="" />
                    <AvatarFallback className="rounded-md">?</AvatarFallback>
                  </Avatar>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Remove image"
                    className="absolute -right-2 -top-2 size-5 rounded-full bg-card p-0"
                    onClick={() => removeImage(index)}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ))}
              {images.length === 0 && (
                <Avatar size="lg" className="rounded-md">
                  <AvatarFallback className="rounded-md">
                    {selectedCategory?.name?.[0]?.toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
              )}
              {images.length < MAX_ASSET_IMAGES && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => imageInputRef.current?.click()}
                >
                  {images.length === 0 ? "Upload Image" : "Add Image"}
                </Button>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageFileSelected}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g. Apple Inc."
              defaultValue={asset?.name ?? ""}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category_id">Category</Label>
            <Select
              name="category_id"
              required
              value={categoryId}
              onValueChange={setCategoryId}
            >
              <SelectTrigger id="category_id" className="w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {/* Liabilities have their own flow (Add Liability), so they're not offered here. */}
                {categories
                  .filter((category) => category.name !== "Liabilities" || category.id === asset?.category_id)
                  .map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchase_date">{t("purchase_date")}</Label>
            <Input
              id="purchase_date"
              name="purchase_date"
              type="date"
              max={todayIso}
              defaultValue={asset?.purchase_date ?? todayIso}
              required
            />
          </div>

          {(isEquity || isCrypto) && (
            <div className="space-y-2">
              <Label htmlFor="ticker_symbol">{t("ticker_symbol")}</Label>
              <Input
                id="ticker_symbol"
                placeholder={
                  isCrypto ? t("ticker_symbol_crypto_placeholder") : t("ticker_symbol_equity_placeholder")
                }
                value={tickerSymbol}
                onChange={(e) => setTickerSymbol(e.target.value.toUpperCase())}
                required
              />
            </div>
          )}

          <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="quantity">{isScpi ? t("scpi_shares") : "Quantity"}</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                step="any"
                min="0"
                defaultValue={asset?.quantity ?? 1}
                onChange={(e) => setQuantityInput(Number(e.target.value))}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="current_value">
                {isRealEstate
                  ? "Current Market Valuation"
                  : isCompany
                    ? t("company_equity_value")
                    : isPrivateEquity
                      ? t("pe_nav_label")
                      : isScpi
                        ? t("scpi_value_label")
                        : "Value"}
              </Label>
              <div className="relative w-full min-w-0">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {getCurrencySymbol(currency)}
                </span>
                <Input
                  id="current_value"
                  name="current_value"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  className="pl-12"
                  defaultValue={
                    asset && isRealEstate
                      ? realEstateMetadata.market_valuation ?? asset.current_value
                      : asset && isCompany
                        ? companyMetadata.company_value ?? asset.current_value
                        : asset?.current_value ?? ""
                  }
                  required={!isScpi}
                />
              </div>
              {isRealEstate && (
                <p className="text-xs text-muted-foreground">
                  Saved as net equity (this minus any linked loan
                  {realEstateMetadata.is_offplan
                    ? " and the outstanding contract balance"
                    : ""}
                  ).
                </p>
              )}
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select name="currency" value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency" className="w-full">
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

          {isRealEstate && (
            <RealEstateFields
              value={realEstateMetadata}
              onChange={setRealEstateMetadata}
              currency={currency}
            />
          )}

          {isVehicle && (
            <VehicleFields
              value={vehicleMetadata}
              onChange={setVehicleMetadata}
              currency={currency}
            />
          )}

          {isPrivateEquity && (
            <PrivateEquityFields
              value={privateEquityMetadata}
              onChange={setPrivateEquityMetadata}
              currency={currency}
            />
          )}

          {isScpi && (
            <ScpiFields
              value={scpiMetadata}
              onChange={setScpiMetadata}
              shares={quantityInput}
              currency={currency}
            />
          )}

          {isCompany && (
            <CompanyFields
              value={companyMetadata}
              onChange={setCompanyMetadata}
              holdingOptions={companies.filter((c) => c.id !== asset?.id)}
            />
          )}

          {isEquity && (
            <EquityFields value={equityMetadata} onChange={setEquityMetadata} />
          )}

          {isCrypto && (
            <CryptoFields
              value={cryptoMetadata}
              onChange={setCryptoMetadata}
              onTickerSuggest={setTickerSymbol}
            />
          )}

          {isPreciousMetal && (
            <PreciousMetalsFields
              value={metalMetadata}
              onChange={setMetalMetadata}
              quantity={quantityInput}
            />
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? isEditMode
                  ? "Saving…"
                  : "Adding…"
                : isEditMode
                  ? "Save Changes"
                  : "Add Asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
