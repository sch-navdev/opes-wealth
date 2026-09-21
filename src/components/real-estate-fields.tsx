"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  CONDITION_RATINGS,
  CONSTRUCTION_YEARS,
  EPC_RATINGS,
  PROPERTY_TYPES,
  type ConditionRatings,
  type RealEstateMetadata,
} from "@/lib/real-estate";

function Stepper({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <Minus className="size-4" />
        </Button>
        <span className="w-8 text-center text-sm text-foreground">
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => onChange(value + 1)}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        step="any"
        min="0"
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
      />
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onChange} />
      <Label className="cursor-pointer font-normal">{label}</Label>
    </div>
  );
}

export function RealEstateFields({
  value,
  onChange,
}: {
  value: RealEstateMetadata;
  onChange: (next: RealEstateMetadata) => void;
}) {
  function set<K extends keyof RealEstateMetadata>(
    key: K,
    next: RealEstateMetadata[K],
  ) {
    onChange({ ...value, [key]: next });
  }

  function setCondition<K extends keyof ConditionRatings>(
    key: K,
    next: string,
  ) {
    onChange({ ...value, condition: { ...value.condition, [key]: next } });
  }

  function updateOwner(index: number, patch: Partial<{ name: string; percentage: number }>) {
    const next = value.ownership.map((owner, i) =>
      i === index ? { ...owner, ...patch } : owner,
    );
    set("ownership", next);
  }

  function addOwner() {
    set("ownership", [...value.ownership, { name: "", percentage: 0 }]);
  }

  function removeOwner(index: number) {
    set(
      "ownership",
      value.ownership.filter((_, i) => i !== index),
    );
  }

  const ownershipTotal = value.ownership.reduce(
    (sum, owner) => sum + (owner.percentage || 0),
    0,
  );

  return (
    <div className="space-y-6 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-foreground">
        Real Estate Details
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="re_address">Address</Label>
          <Input
            id="re_address"
            value={value.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={value.propertyType}
            onValueChange={(next) => set("propertyType", next)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a type" />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <ToggleField
          label="Automatic Estimation"
          checked={value.automaticEstimation}
          onChange={(next) => set("automaticEstimation", next)}
        />
        <ToggleField
          label="Elevator"
          checked={value.elevator}
          onChange={(next) => set("elevator", next)}
        />
        <ToggleField
          label="New Construction"
          checked={value.newConstruction}
          onChange={(next) => set("newConstruction", next)}
        />
        <ToggleField
          label="Furnished"
          checked={value.furnished}
          onChange={(next) => set("furnished", next)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label="Purchase Price"
          value={value.purchasePrice}
          onChange={(next) => set("purchasePrice", next)}
        />
        <NumberField
          label="Agency Fees"
          value={value.agencyFees}
          onChange={(next) => set("agencyFees", next)}
        />
        <NumberField
          label="Notary Fees"
          value={value.notaryFees}
          onChange={(next) => set("notaryFees", next)}
        />
        <NumberField
          label="Renovation Fees"
          value={value.renovationFees}
          onChange={(next) => set("renovationFees", next)}
        />
        <NumberField
          label="Furnishing Fees"
          value={value.furnishingFees}
          onChange={(next) => set("furnishingFees", next)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NumberField
          label="Surface Area (m²)"
          value={value.surfaceArea}
          onChange={(next) => set("surfaceArea", next)}
        />
        <NumberField
          label="Garden Area (m²)"
          value={value.gardenArea}
          onChange={(next) => set("gardenArea", next)}
        />
        <NumberField
          label="Balcony Area (m²)"
          value={value.balconyArea}
          onChange={(next) => set("balconyArea", next)}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stepper
          label="Floors"
          value={value.floors}
          onChange={(next) => set("floors", next)}
          min={1}
        />
        <Stepper
          label="Rooms"
          value={value.rooms}
          onChange={(next) => set("rooms", next)}
          min={1}
        />
        <Stepper
          label="Garage / Parking"
          value={value.garageCount}
          onChange={(next) => set("garageCount", next)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Year of Construction</Label>
          <Select
            value={value.yearOfConstruction}
            onValueChange={(next) => set("yearOfConstruction", next)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a year" />
            </SelectTrigger>
            <SelectContent>
              {CONSTRUCTION_YEARS.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>EPC Rating</Label>
          <Select
            value={value.epcRating}
            onValueChange={(next) => set("epcRating", next)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a rating" />
            </SelectTrigger>
            <SelectContent>
              {EPC_RATINGS.map((rating) => (
                <SelectItem key={rating} value={rating}>
                  {rating}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-medium text-foreground">Condition</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(
            [
              ["kitchen", "Kitchen"],
              ["bathrooms", "Bathrooms"],
              ["flooring", "Flooring"],
              ["windows", "Windows"],
              ["general", "General"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-2">
              <Label>{label}</Label>
              <Select
                value={value.condition[key]}
                onValueChange={(next) => setCondition(key, next)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a condition" />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_RATINGS.map((rating) => (
                    <SelectItem key={rating} value={rating}>
                      {rating}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground">Ownership</h4>
          <p
            className={
              ownershipTotal === 100
                ? "text-xs text-success"
                : "text-xs text-destructive"
            }
          >
            Total: {ownershipTotal}%
          </p>
        </div>

        <div className="space-y-3">
          {value.ownership.map((owner, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                placeholder="Owner name"
                value={owner.name}
                onChange={(e) =>
                  updateOwner(index, { name: e.target.value })
                }
                className="flex-1"
              />
              <Input
                type="number"
                min="0"
                max="100"
                value={owner.percentage}
                onChange={(e) =>
                  updateOwner(index, {
                    percentage: Number(e.target.value),
                  })
                }
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={value.ownership.length <= 1}
                onClick={() => removeOwner(index)}
              >
                <Minus className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={addOwner}>
          Add Owner
        </Button>
      </div>
    </div>
  );
}
