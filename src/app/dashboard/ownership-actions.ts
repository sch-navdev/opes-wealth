"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { respondToApproval } from "@/lib/shared-assets/server";

export type RespondResult =
  | { ok: true; outcome: "approved" | "rejected" | "waiting" }
  | { ok: false; error: string };

/**
 * Accept or reject an incoming change to a shared asset. The signed-in user is
 * taken from the session (never from the arguments), and only their own
 * pending approval row can be answered. A rejection rejects the request; the
 * last approval applies it to the asset.
 */
export async function respondToChangeRequest(requestId: string, approve: boolean): Promise<RespondResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const result = await respondToApproval({ userId: user.id, requestId, approve });
  if (result.ok) revalidatePath("/dashboard", "layout");
  return result;
}
