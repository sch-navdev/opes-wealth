"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isVehicleExpenseCategory,
  nextVehicleExpenseId,
  parseVehicleMetadata,
  type VehicleExpense,
} from "@/lib/vehicles";

type Loaded =
  | { ok: true; supabase: SupabaseClient; userId: string; metadata: Record<string, unknown>; expenses: VehicleExpense[] }
  | { ok: false; error: string };

/** Authenticates, then loads the vehicle's metadata — scoped to the caller's own asset and to the Vehicles category. */
async function loadVehicleForMutation(assetId: string): Promise<Loaded> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in to update this vehicle." };

  const { data: asset } = await supabase
    .from("assets")
    .select("id, metadata, asset_categories(name)")
    .eq("id", assetId)
    .eq("profile_id", user.id)
    .single<{ id: string; metadata: Record<string, unknown> | null; asset_categories: { name: string } | null }>();
  if (!asset) return { ok: false, error: "Asset not found." };
  if (asset.asset_categories?.name !== "Vehicles") {
    return { ok: false, error: "This action is only available for vehicles." };
  }

  const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  return { ok: true, supabase, userId: user.id, metadata, expenses: parseVehicleMetadata(metadata).expenses };
}

async function saveExpenses(loaded: Extract<Loaded, { ok: true }>, assetId: string, expenses: VehicleExpense[]) {
  const { error } = await loaded.supabase
    .from("assets")
    .update({ metadata: { ...loaded.metadata, expenses } })
    .eq("id", assetId)
    .eq("profile_id", loaded.userId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${assetId}`);
}

function validate(expense: { date: string; category: string; description: string; amount: number }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expense.date)) return "Enter a valid date.";
  if (!isVehicleExpenseCategory(expense.category)) return "Choose a category.";
  if (!Number.isFinite(expense.amount) || expense.amount < 0) return "Enter an amount of zero or more.";
  return null;
}

export async function addVehicleExpense(
  assetId: string,
  input: { date: string; category: string; description: string; amount: number },
) {
  const invalid = validate(input);
  if (invalid) return { error: invalid };
  const loaded = await loadVehicleForMutation(assetId);
  if (!loaded.ok) return { error: loaded.error };

  const expense: VehicleExpense = {
    id: nextVehicleExpenseId(),
    date: input.date,
    category: input.category as VehicleExpense["category"],
    description: input.description.trim().slice(0, 200),
    amount: input.amount,
  };
  return saveExpenses(loaded, assetId, [...loaded.expenses, expense]);
}

export async function updateVehicleExpense(
  assetId: string,
  expenseId: string,
  input: { date: string; category: string; description: string; amount: number },
) {
  const invalid = validate(input);
  if (invalid) return { error: invalid };
  const loaded = await loadVehicleForMutation(assetId);
  if (!loaded.ok) return { error: loaded.error };
  if (!loaded.expenses.some((e) => e.id === expenseId)) return { error: "Expense not found." };

  return saveExpenses(
    loaded,
    assetId,
    loaded.expenses.map((e) =>
      e.id === expenseId
        ? {
            ...e,
            date: input.date,
            category: input.category as VehicleExpense["category"],
            description: input.description.trim().slice(0, 200),
            amount: input.amount,
          }
        : e,
    ),
  );
}

export async function deleteVehicleExpense(assetId: string, expenseId: string) {
  const loaded = await loadVehicleForMutation(assetId);
  if (!loaded.ok) return { error: loaded.error };
  return saveExpenses(
    loaded,
    assetId,
    loaded.expenses.filter((e) => e.id !== expenseId),
  );
}
