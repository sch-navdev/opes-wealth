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
import { getCurrencySymbol } from "@/lib/currencies";
import {
  CONDITION_RATINGS,
  CONSTRUCTION_YEARS,
  EPC_RATINGS,
  PROPERTY_TYPES,
  nextMilestoneId,
  type ConditionRatings,
  type LinkedLoan,
  type PaymentMilestone,
  type RealEstateMetadata,
} from "@/lib/real-estate";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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
    <div className="w-full min-w-0 space-y-2">
      <Label>{label}</Label>
      <div className="flex w-full min-w-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <Minus className="size-4" />
        </Button>
        <span className="w-8 shrink-0 text-center text-sm text-foreground">
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
  currency,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  currency?: string;
}) {
  const symbol = currency ? getCurrencySymbol(currency) : null;
  return (
    <div className="w-full min-w-0 space-y-2">
      <Label>{label}</Label>
      <div className="relative w-full min-w-0">
        {symbol && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {symbol}
          </span>
        )}
        <Input
          type="number"
          step="any"
          min="0"
          className={symbol ? "pl-12" : undefined}
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
        />
      </div>
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
  currency,
}: {
  value: RealEstateMetadata;
  onChange: (next: RealEstateMetadata) => void;
  currency: string;
}) {
  const currencySymbol = getCurrencySymbol(currency);
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

  function setLoan(patch: Partial<LinkedLoan>) {
    set("linked_loan", { ...value.linked_loan, ...patch });
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

  // --- Off-plan: contract price / ADM fee -------------------------------

  function applySchedule(nextSchedule: PaymentMilestone[]) {
    const paidToDate = round2(
      nextSchedule.reduce(
        (sum, m) => sum + (m.status === "paid" ? m.amount || 0 : 0),
        0,
      ),
    );
    const outstanding = round2((value.contract_price ?? 0) - paidToDate);

    onChange({
      ...value,
      payment_schedule: nextSchedule,
      paid_to_date: paidToDate,
      outstanding_balance: outstanding,
    });
  }

  function setContractPrice(next: number | null) {
    const outstanding = round2((next ?? 0) - value.paid_to_date);
    const admAmount =
      next != null && value.adm_fee_percent != null
        ? round2((next * value.adm_fee_percent) / 100)
        : value.adm_fee_amount;

    onChange({
      ...value,
      contract_price: next,
      outstanding_balance: outstanding,
      adm_fee_amount: admAmount,
    });
  }

  function setAdmFeePercent(percent: number | null) {
    const amount =
      percent != null && value.contract_price != null
        ? round2((value.contract_price * percent) / 100)
        : value.adm_fee_amount;

    onChange({ ...value, adm_fee_percent: percent, adm_fee_amount: amount });
  }

  function setAdmFeeAmount(amount: number | null) {
    onChange({ ...value, adm_fee_amount: amount });
  }

  function addMilestone() {
    applySchedule([
      ...value.payment_schedule,
      {
        id: nextMilestoneId(),
        milestone: "",
        due_date: "",
        amount: 0,
        percentage: 0,
        status: "pending",
      },
    ]);
  }

  function updateMilestone(index: number, patch: Partial<PaymentMilestone>) {
    applySchedule(
      value.payment_schedule.map((m, i) =>
        i === index ? { ...m, ...patch } : m,
      ),
    );
  }

  function removeMilestone(index: number) {
    applySchedule(value.payment_schedule.filter((_, i) => i !== index));
  }

  return (
    <div className="w-full min-w-0 space-y-6 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-foreground">
        Real Estate Details
      </h3>

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2 sm:col-span-2">
          <Label htmlFor="re_address">Address</Label>
          <Input
            id="re_address"
            value={value.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
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

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">
          Characteristics
        </h4>
        <div className="grid w-full min-w-0 grid-cols-2 gap-4 sm:grid-cols-4">
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
          <ToggleField
            label="Off-Plan Property"
            checked={value.is_offplan}
            onChange={(next) => set("is_offplan", next)}
          />
        </div>
      </div>

      {value.is_offplan && (
        <div className="w-full min-w-0 space-y-4 border border-border p-4">
          <h4 className="text-sm font-medium text-foreground">
            Off-Plan Payment Tracking
          </h4>

          <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
            <NumberField
              label="Contract Price (SPA)"
              value={value.contract_price}
              onChange={setContractPrice}
              currency={currency}
            />
            <div className="min-w-0 space-y-2">
              <Label>Municipal / ADM Fee (%)</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={value.adm_fee_percent ?? ""}
                onChange={(e) =>
                  setAdmFeePercent(
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label>Municipal / ADM Fee (Amount)</Label>
              <div className="relative w-full min-w-0">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {currencySymbol}
                </span>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  className="w-full pl-12"
                  value={value.adm_fee_amount ?? ""}
                  onChange={(e) =>
                    setAdmFeeAmount(
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                />
              </div>
            </div>
          </div>

          <div className="w-full min-w-0 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Payment Schedule</Label>
            </div>

            <div className="w-full min-w-0 space-y-3">
              {value.payment_schedule.map((milestone, index) => (
                <div
                  key={milestone.id}
                  className="grid w-full min-w-0 grid-cols-2 gap-2 border border-border p-3 sm:grid-cols-6 sm:items-end"
                >
                  <div className="min-w-0 space-y-1 sm:col-span-2">
                    <Label className="text-xs">Milestone</Label>
                    <Input
                      placeholder="e.g. Down Payment"
                      value={milestone.milestone}
                      onChange={(e) =>
                        updateMilestone(index, { milestone: e.target.value })
                      }
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label className="text-xs">Due Date</Label>
                    <Input
                      type="date"
                      className="w-full min-w-0"
                      value={milestone.due_date}
                      onChange={(e) =>
                        updateMilestone(index, { due_date: e.target.value })
                      }
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label className="text-xs">Amount</Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={milestone.amount}
                      onChange={(e) =>
                        updateMilestone(index, {
                          amount: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label className="text-xs">Percentage</Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      value={milestone.percentage}
                      onChange={(e) =>
                        updateMilestone(index, {
                          percentage: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="flex min-w-0 items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label className="text-xs">Status</Label>
                      <Select
                        value={milestone.status}
                        onValueChange={(next) =>
                          updateMilestone(index, {
                            status: next as "paid" | "pending",
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="shrink-0"
                      onClick={() => removeMilestone(index)}
                      aria-label="Remove milestone"
                    >
                      <Minus className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addMilestone}
            >
              + Add Milestone
            </Button>
          </div>

          <div className="grid w-full min-w-0 grid-cols-2 gap-4 border-t border-border pt-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Total Paid to Date
              </p>
              <p className="text-sm font-medium text-success">
                {value.paid_to_date.toLocaleString()}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Outstanding Balance
              </p>
              <p className="text-sm font-medium text-destructive">
                {value.outstanding_balance.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="w-full min-w-0 space-y-4 border border-border p-4">
        <h4 className="text-sm font-medium text-foreground">Linked Loan</h4>
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-4">
          <NumberField
            label="Total Loan Amount"
            value={value.linked_loan.amount}
            onChange={(next) => setLoan({ amount: next })}
            currency={currency}
          />
          <NumberField
            label="Interest Rate (%)"
            value={value.linked_loan.interest_rate}
            onChange={(next) => setLoan({ interest_rate: next })}
          />
          <NumberField
            label="Duration (months)"
            value={value.linked_loan.duration_months}
            onChange={(next) => setLoan({ duration_months: next })}
          />
          <div className="min-w-0 space-y-2">
            <Label>Start Date</Label>
            <Input
              type="date"
              className="w-full min-w-0"
              value={value.linked_loan.start_date}
              onChange={(e) => setLoan({ start_date: e.target.value })}
            />
          </div>
        </div>
        {value.linked_loan.amount ? (
          <p className="text-xs text-muted-foreground">
            The outstanding loan principal is subtracted from this
            property&apos;s Net Equity.
          </p>
        ) : null}
      </div>

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label="Purchase Price"
          value={value.purchasePrice}
          onChange={(next) => set("purchasePrice", next)}
          currency={currency}
        />
        <NumberField
          label="Agency Fees"
          value={value.agencyFees}
          onChange={(next) => set("agencyFees", next)}
          currency={currency}
        />
        <NumberField
          label="Notary Fees"
          value={value.notaryFees}
          onChange={(next) => set("notaryFees", next)}
          currency={currency}
        />
        <NumberField
          label="Renovation Fees"
          value={value.renovationFees}
          onChange={(next) => set("renovationFees", next)}
          currency={currency}
        />
        <NumberField
          label="Furnishing Fees"
          value={value.furnishingFees}
          onChange={(next) => set("furnishingFees", next)}
          currency={currency}
        />
      </div>

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
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

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
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

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
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
        <div className="min-w-0 space-y-2">
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
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          {(
            [
              ["kitchen", "Kitchen"],
              ["bathrooms", "Bathrooms"],
              ["flooring", "Flooring"],
              ["windows", "Windows"],
              ["general", "General"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="min-w-0 space-y-2">
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

      <div className="w-full min-w-0 space-y-3">
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

        <div className="w-full min-w-0 space-y-3">
          {value.ownership.map((owner, index) => (
            <div key={index} className="flex w-full min-w-0 items-center gap-2">
              <Input
                placeholder="Owner name"
                value={owner.name}
                onChange={(e) =>
                  updateOwner(index, { name: e.target.value })
                }
                className="min-w-0 flex-1"
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
                className="w-20 shrink-0"
              />
              <span className="shrink-0 text-sm text-muted-foreground">%</span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="shrink-0"
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
