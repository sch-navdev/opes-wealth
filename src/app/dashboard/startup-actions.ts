"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import {
  getFundingRoundErrors,
  parseStartupMetadata,
  startupRoundHistory,
  startupValuation,
  type FundingRound,
} from "@/lib/startups";

export type StartupRoundResult = { ok: true; currentValue: number } | { ok: false; error: string };

type StartupRow = {
  id: string;
  quantity: number;
  metadata: Record<string, unknown> | null;
  asset_categories: { name: string } | null;
};

async function loadStartup(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." as const };

  const { data: asset } = await supabase
    .from("assets")
    .select("id, quantity, metadata, asset_categories(name)")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single<StartupRow>();
  if (!asset || asset.asset_categories?.name !== "Startups") {
    return { error: "Startup holding not found." as const };
  }
  return { supabase, user, asset };
}

/**
 * Writes a new funding-round list back: the holding's value becomes
 * shares × the latest round's price (`startupValuation`), and one
 * `asset_history` point per round date is upserted so the valuation chart
 * steps at every round. History rows of a removed round's date are deleted
 * first (only that date, so other points are untouched).
 */
async function saveRounds(
  loaded: Exclude<Awaited<ReturnType<typeof loadStartup>>, { error: string }>,
  rounds: FundingRound[],
  removedDate?: string,
): Promise<StartupRoundResult> {
  const { supabase, user, asset } = loaded;
  const metadata = { ...(asset.metadata ?? {}), funding_rounds: rounds };
  const parsed = parseStartupMetadata(metadata);
  const currentValue = startupValuation(parsed, asset.quantity);

  const { error: updateError } = await supabase
    .from("assets")
    .update({ metadata, current_value: currentValue })
    .eq("id", asset.id)
    .eq("profile_id", user.id);
  if (updateError) return { ok: false, error: updateError.message };

  if (removedDate && !rounds.some((r) => r.date === removedDate)) {
    await supabase.from("asset_history").delete().eq("asset_id", asset.id).eq("recorded_date", removedDate);
  }

  const points = startupRoundHistory(parsed, asset.quantity).map((p) => ({
    asset_id: asset.id,
    recorded_date: p.date,
    value: p.value,
    net_equity: p.value,
    source: "manual",
  }));
  if (points.length > 0) {
    const { error: historyError } = await supabase
      .from("asset_history")
      .upsert(points, { onConflict: "asset_id,recorded_date" });
    if (historyError) return { ok: false, error: historyError.message };
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${asset.id}`);
  return { ok: true, currentValue };
}

export async function addFundingRound(
  assetId: string,
  round: Omit<FundingRound, "id">,
): Promise<StartupRoundResult> {
  const errors = getFundingRoundErrors(round);
  if (errors.length > 0) return { ok: false, error: errors[0] ?? "invalid" };

  const loaded = await loadStartup(assetId);
  if ("error" in loaded) return { ok: false, error: String(loaded.error) };

  const existing = parseStartupMetadata(loaded.asset.metadata).funding_rounds;
  const next: FundingRound = {
    id: `round-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    date: round.date,
    name: round.name.trim(),
    price_per_share: round.price_per_share,
    post_money_valuation: round.post_money_valuation,
  };
  return saveRounds(loaded, [...existing, next]);
}

export async function deleteFundingRound(assetId: string, roundId: string): Promise<StartupRoundResult> {
  const loaded = await loadStartup(assetId);
  if ("error" in loaded) return { ok: false, error: String(loaded.error) };

  const existing = parseStartupMetadata(loaded.asset.metadata).funding_rounds;
  const removed = existing.find((r) => r.id === roundId);
  if (!removed) return { ok: false, error: "Round not found." };
  return saveRounds(
    loaded,
    existing.filter((r) => r.id !== roundId),
    removed.date,
  );
}
