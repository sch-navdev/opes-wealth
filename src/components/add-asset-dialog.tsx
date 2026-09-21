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
import { currencies, getCurrencySymbol } from "@/lib/currencies";
import { resizeImageToBase64 } from "@/lib/crop-image";
import {
  EMPTY_REAL_ESTATE_METADATA,
  MAX_ASSET_IMAGES,
  parseRealEstateMetadata,
} from "@/lib/real-estate";
import { addAsset, updateAsset } from "@/app/dashboard/actions";

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
};

export function AddAssetDialog({
  categories,
  asset,
  trigger,
}: {
  categories: Category[];
  asset?: AssetForEdit;
  /** Custom trigger element (e.g. a "+ Add Loan" button elsewhere on the page). Falls back to the default Edit/Add Asset button. */
  trigger?: React.ReactNode;
}) {
  const isEditMode = !!asset;

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [categoryId, setCategoryId] = useState(asset?.category_id ?? "");
  const [currency, setCurrency] = useState(asset?.currency ?? "USD");
  const [images, setImages] = useState<string[]>(asset?.images ?? []);
  const [realEstateMetadata, setRealEstateMetadata] = useState(() =>
    asset ? parseRealEstateMetadata(asset.metadata) : EMPTY_REAL_ESTATE_METADATA,
  );

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isRealEstate = selectedCategory?.name === "Real Estate";

  function resetState() {
    setCategoryId(asset?.category_id ?? "");
    setCurrency(asset?.currency ?? "USD");
    setImages(asset?.images ?? []);
    setRealEstateMetadata(
      asset ? parseRealEstateMetadata(asset.metadata) : EMPTY_REAL_ESTATE_METADATA,
    );
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

    if (isRealEstate) {
      // The "Current Market Valuation" input reuses the generic
      // `current_value` field, but the DB's `current_value` column should
      // hold net equity instead (market valuation minus any linked loan
      // principal, and minus what's still owed on an off-plan contract),
      // so portfolio totals aren't inflated by debt still outstanding.
      // The raw market valuation is preserved in metadata so it can be
      // re-edited later without double-subtracting.
      const marketValuation = Number(formData.get("current_value"));
      const loanPrincipal = realEstateMetadata.linked_loan.amount ?? 0;
      const outstandingOffplan = realEstateMetadata.is_offplan
        ? realEstateMetadata.outstanding_balance
        : 0;
      const netEquity = marketValuation - outstandingOffplan - loanPrincipal;

      const metadata = { ...realEstateMetadata, market_valuation: marketValuation };
      formData.set("current_value", String(netEquity));
      formData.set("metadata", JSON.stringify(metadata));
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
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                step="any"
                min="0"
                defaultValue={asset?.quantity ?? 1}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="current_value">
                {isRealEstate ? "Current Market Valuation" : "Value"}
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
                      : asset?.current_value ?? ""
                  }
                  required
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
