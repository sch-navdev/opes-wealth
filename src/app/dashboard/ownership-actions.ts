"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";
import { isDemoUser } from "@/lib/demo-mode";
import { notifyApprovers, resendInvite, respondToApproval, revokeCoOwner } from "@/lib/shared-assets/server";

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

export type ResendResult = { ok: true } | { ok: false; error: string };

/** The requester re-sends the "please review" email to one co-owner who has not answered. */
export async function resendApprovalEmail(requestId: string, profileId: string): Promise<ResendResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  if (isDemoUser(user.id)) return { ok: true };
  const service = createServiceClient();
  const { data: request } = await service
    .from("asset_change_requests")
    .select("requested_by, asset_id")
    .eq("id", requestId)
    .eq("status", "pending")
    .single();
  if (!request || request.requested_by !== user.id) return { ok: false, error: "Only the person who proposed the change can do this." };

  const { sent, failed } = await notifyApprovers(service, requestId, profileId);
  revalidatePath(`/dashboard/assets/${request.asset_id}`);
  return sent > 0 && failed === 0 ? { ok: true } : { ok: false, error: "The email could not be sent. See the status for the reason." };
}

/** The creator re-sends the join invitation to a co-owner without an account. */
export async function resendCoOwnerInvite(assetId: string, email: string): Promise<ResendResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  if (isDemoUser(user.id)) return { ok: true };
  const { data: asset } = await createServiceClient().from("assets").select("profile_id").eq("id", assetId).single();
  if (!asset || asset.profile_id !== user.id) return { ok: false, error: "Only the asset's creator can do this." };

  const res = await resendInvite(assetId, email);
  revalidatePath(`/dashboard/assets/${assetId}`);
  return res.sent ? { ok: true } : { ok: false, error: res.reason ?? "The invitation could not be sent." };
}

/**
 * The creator stops sharing the asset with a co-owner who has not accepted their
 * invitation yet. No one else's approval is needed because that person cannot act.
 */
export async function revokePendingCoOwner(assetId: string, email: string): Promise<ResendResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const res = await revokeCoOwner(assetId, user.id, email);
  if (res.ok) revalidatePath("/dashboard", "layout");
  return res;
}
