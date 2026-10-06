"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  addVehicleExpense,
  deleteVehicleExpense,
  updateVehicleExpense,
} from "@/app/dashboard/vehicle-expense-actions";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { OwnerShareNote } from "@/components/owner-share-note";
import { scaleHistoryValue } from "@/lib/ownership";
import type { TranslationKey } from "@/lib/i18n";
import {
  isVehicleExpenseCategory,
  sumVehicleExpenses,
  VEHICLE_EXPENSE_CATEGORIES,
  vehicleExpensesByCategory,
  type VehicleExpense,
  type VehicleExpenseCategory,
} from "@/lib/vehicles";

const CATEGORY_KEYS: Record<VehicleExpenseCategory, TranslationKey> = {
  maintenance: "vehicle_expense_cat_maintenance",
  fuel: "vehicle_expense_cat_fuel",
  insurance: "vehicle_expense_cat_insurance",
  registration: "vehicle_expense_cat_registration",
  tires: "vehicle_expense_cat_tires",
  parking: "vehicle_expense_cat_parking",
  modifications: "vehicle_expense_cat_modifications",
  other: "vehicle_expense_cat_other",
};

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * The "Expenses" tab of a vehicle: totals, a per-category breakdown and a dated
 * history log, with a form to add, edit and delete entries. Entries live in the
 * vehicle's `metadata.expenses` (see `VehicleExpense` in `lib/vehicles.ts`) in
 * the asset's own currency, and count toward its Total Cost of Ownership.
 */
export function VehicleExpenses({
  assetId,
  currency,
  expenses,
  shareFactor = 1,
}: {
  assetId: string;
  currency: string;
  /** The RAW whole-vehicle ledger: the edit form prefills from it, so it must never be pre-scaled. */
  expenses: VehicleExpense[];
  /** Viewer's 0-1 share of a co-owned vehicle: totals, breakdown and amounts are displayed scaled; writes stay whole-asset. */
  shareFactor?: number;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso);
  const [category, setCategory] = useState<VehicleExpenseCategory>("maintenance");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const money = new Intl.NumberFormat(intlLocale, { style: "currency", currency });
  const categoryLabel = (value: string) =>
    isVehicleExpenseCategory(value) ? t(CATEGORY_KEYS[value]) : value;

  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
  // Read-only figures use the viewer's share; `expenses` itself (edit prefill) stays raw.
  const shown = (n: number) => scaleHistoryValue(n, shareFactor);
  const sharedExpenses = expenses.map((e) => ({ ...e, amount: shown(e.amount) }));
  const total = sumVehicleExpenses(sharedExpenses);
  const thisYear = String(new Date().getFullYear());
  const totalThisYear = sumVehicleExpenses(sharedExpenses.filter((e) => e.date.startsWith(thisYear)));
  const breakdown = vehicleExpensesByCategory(sharedExpenses);

  function resetForm() {
    setEditingId(null);
    setDate(todayIso());
    setCategory("maintenance");
    setDescription("");
    setAmount("");
  }

  function startEdit(expense: VehicleExpense) {
    setError(null);
    setEditingId(expense.id);
    setDate(expense.date);
    setCategory(isVehicleExpenseCategory(expense.category) ? expense.category : "other");
    setDescription(expense.description);
    setAmount(String(expense.amount));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!date || amount.trim() === "" || !Number.isFinite(value) || value < 0) {
      setError(t("vehicle_expense_invalid"));
      return;
    }
    const input = { date, category, description, amount: value };
    startTransition(async () => {
      const result = editingId
        ? await updateVehicleExpense(assetId, editingId, input)
        : await addVehicleExpense(assetId, input);
      if (result?.error) {
        setError(result.error);
        return;
      }
      resetForm();
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteVehicleExpense(assetId, id);
      if (result?.error) setError(result.error);
      else if (editingId === id) resetForm();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border bg-card">
          <CardContent className="space-y-1 py-4">
            <p className="text-xs text-muted-foreground">{t("vehicle_expense_total")}</p>
            <p className="text-lg font-semibold text-foreground">{maskValue(money.format(total))}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="space-y-1 py-4">
            <p className="text-xs text-muted-foreground">
              {t("vehicle_expense_this_year")} ({thisYear})
            </p>
            <p className="text-lg font-semibold text-foreground">{maskValue(money.format(totalThisYear))}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="space-y-1 py-4">
            <p className="text-xs text-muted-foreground">{t("vehicle_expense_count")}</p>
            <p className="text-lg font-semibold text-foreground">{expenses.length}</p>
          </CardContent>
        </Card>
      </div>

      {breakdown.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">{t("vehicle_expense_breakdown")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {breakdown.map((row) => {
              const share = total > 0 ? (row.total / total) * 100 : 0;
              return (
                <div key={row.category} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground">
                      {categoryLabel(row.category)}
                      <span className="ms-2 text-xs text-muted-foreground">({row.count})</span>
                    </span>
                    <span className="tabular-nums text-foreground">
                      {maskValue(money.format(row.total))}
                      <span className="ms-2 text-xs text-muted-foreground">{share.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">{t("vehicle_expense_history")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("vehicle_expenses_empty")}</p>
          ) : (
            <div className="border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("date")}</TableHead>
                    <TableHead>{t("vehicle_expense_category")}</TableHead>
                    <TableHead>{t("description")}</TableHead>
                    <TableHead className="text-end">{t("amount")}</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((expense) => (
                    <TableRow key={expense.id} className={editingId === expense.id ? "bg-muted/40" : undefined}>
                      <TableCell className="text-muted-foreground">{expense.date}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{categoryLabel(expense.category)}</Badge>
                      </TableCell>
                      <TableCell className="text-foreground">{expense.description || "—"}</TableCell>
                      <TableCell className="text-end tabular-nums text-foreground">
                        {maskValue(money.format(shown(expense.amount)))}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            aria-label={t("vehicle_expense_edit")}
                            disabled={isPending}
                            onClick={() => startEdit(expense)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            aria-label={t("delete")}
                            disabled={isPending}
                            onClick={() => handleDelete(expense.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-4 sm:items-end"
          >
            <OwnerShareNote factor={shareFactor} variant="edit" className="sm:col-span-4" />
            <div className="min-w-0 space-y-1">
              <Label className="text-xs" htmlFor="vexp_date">
                {t("date")}
              </Label>
              <Input id="vexp_date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs" htmlFor="vexp_category">
                {t("vehicle_expense_category")}
              </Label>
              <Select value={category} onValueChange={(v) => setCategory(v as VehicleExpenseCategory)}>
                <SelectTrigger id="vexp_category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_EXPENSE_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(CATEGORY_KEYS[value])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1 sm:col-span-2">
              <Label className="text-xs" htmlFor="vexp_description">
                {t("description")}
              </Label>
              <Input
                id="vexp_description"
                value={description}
                maxLength={200}
                placeholder={t("vehicle_expense_note_placeholder")}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs" htmlFor="vexp_amount">
                {t("amount")} ({currency})
              </Label>
              <Input
                id="vexp_amount"
                type="number"
                step="any"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? t("saving") : editingId ? t("vehicle_expense_save") : t("add_vehicle_expense")}
              </Button>
              {editingId && (
                <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={resetForm}>
                  {t("cancel")}
                </Button>
              )}
            </div>
          </form>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t("vehicle_expense_tco_note")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
