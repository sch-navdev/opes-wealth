"use client";

import { useRef, useState, useTransition } from "react";
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
import { RealEstateFields } from "@/components/real-estate-fields";
import { currencies } from "@/lib/currencies";
import {
  EMPTY_REAL_ESTATE_METADATA,
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
};

export function AddAssetDialog({
  categories,
  asset,
}: {
  categories: Category[];
  asset?: AssetForEdit;
}) {
  const isEditMode = !!asset;

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const [categoryId, setCategoryId] = useState(asset?.category_id ?? "");
  const [currency, setCurrency] = useState(asset?.currency ?? "USD");
  const [realEstateMetadata, setRealEstateMetadata] = useState(() =>
    asset ? parseRealEstateMetadata(asset.metadata) : EMPTY_REAL_ESTATE_METADATA,
  );

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isRealEstate = selectedCategory?.name === "Real Estate";

  function resetState() {
    setCategoryId(asset?.category_id ?? "");
    setCurrency(asset?.currency ?? "USD");
    setRealEstateMetadata(
      asset ? parseRealEstateMetadata(asset.metadata) : EMPTY_REAL_ESTATE_METADATA,
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const form = formRef.current;
    if (!form) return;

    const formData = new FormData(form);

    if (isRealEstate) {
      let metadata = realEstateMetadata;

      if (realEstateMetadata.is_offplan) {
        // The "Current Market Valuation" input reuses the generic
        // `current_value` field, but for off-plan assets the DB's
        // `current_value` column should hold net equity instead
        // (market valuation minus what's still owed on the contract), so
        // portfolio totals aren't inflated by debt still outstanding.
        // The raw market valuation is preserved in metadata so it can be
        // re-edited later without double-subtracting.
        const marketValuation = Number(formData.get("current_value"));
        const netEquity = marketValuation - realEstateMetadata.outstanding_balance;

        metadata = { ...realEstateMetadata, market_valuation: marketValuation };
        formData.set("current_value", String(netEquity));
      }

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
        {isEditMode ? (
          <Button variant="outline" size="icon-sm" aria-label="Edit asset">
            <Edit className="size-4" />
          </Button>
        ) : (
          <Button>Add Asset</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-card">
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

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label htmlFor="current_value">
                {isRealEstate && realEstateMetadata.is_offplan
                  ? "Current Market Valuation"
                  : "Value"}
              </Label>
              <Input
                id="current_value"
                name="current_value"
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                defaultValue={
                  asset && realEstateMetadata.is_offplan
                    ? realEstateMetadata.market_valuation ?? asset.current_value
                    : asset?.current_value ?? ""
                }
                required
              />
              {isRealEstate && realEstateMetadata.is_offplan && (
                <p className="text-xs text-muted-foreground">
                  Saved as net equity (this minus the outstanding balance).
                </p>
              )}
            </div>
            <div className="space-y-2">
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
