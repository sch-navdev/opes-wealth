"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import type { Json } from "@/types/supabase";

/** Generous cap: a full DCC is a few KB; this only stops abuse. */
const MAX_BYTES = 200_000;

/**
 * Saves the user's last Client Knowledge Document entries (migration 0026) so
 * the dialog reopens pre-filled. The wealth tables (`portfolio`) are never
 * stored — they are recomputed from the assets — and neither is any PDF
 * password. One row per user, replaced on every save; protected by RLS.
 */
export async function saveClientKnowledge(
  data: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { portfolio: _portfolio, password: _password, ...rest } = data;
  void _portfolio;
  void _password;
  const json = JSON.stringify(rest);
  if (json.length > MAX_BYTES) return { ok: false, error: "The details are too large to save." };

  const { error } = await supabase
    .from("client_knowledge_documents")
    .upsert({ profile_id: user.id, data: rest as Json, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

/** Deletes the saved details (the dialog then opens with only the profile prefill). */
export async function clearClientKnowledge(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { error } = await supabase.from("client_knowledge_documents").delete().eq("profile_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}
