"use client";

import { useRef, useState, useTransition } from "react";
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
import { EMPTY_REAL_ESTATE_METADATA } from "@/lib/real-estate";
import { addAsset } from "@/app/dashboard/actions";

type Category = {
  id: string;
  name: string;
};

export function AddAssetDialog({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const [categoryId, setCategoryId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [realEstateMetadata, setRealEstateMetadata] = useState(
    EMPTY_REAL_ESTATE_METADATA,
  );

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isRealEstate = selectedCategory?.name === "Real Estate";

  function resetState() {
    setCategoryId("");
    setCurrency("USD");
    setRealEstateMetadata(EMPTY_REAL_ESTATE_METADATA);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const form = formRef.current;
    if (!form) return;

    const formData = new FormData(form);

    if (isRealEstate) {
      formData.set("metadata", JSON.stringify(realEstateMetadata));
    }

    startTransition(async () => {
      const result = await addAsset(formData);

      if (result?.error) {
        setError(result.error);
        return;
      }

      setOpen(false);
      form.reset();
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
        <Button>Add Asset</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add Asset</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Track a new asset or liability in your portfolio.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g. Apple Inc."
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
                defaultValue={1}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="current_value">Value</Label>
              <Input
                id="current_value"
                name="current_value"
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                required
              />
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
              {isPending ? "Adding…" : "Add Asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
