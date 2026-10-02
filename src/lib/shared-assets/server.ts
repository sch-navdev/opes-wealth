/**
 * Co-ownership server logic: owners, invites, change requests and their
 * application (server-only — uses the service-role client, which bypasses RLS,
 * so every caller must authorise the user first; the exported helpers take the
 * authenticated `userId` and check membership themselves).
 *
 * Workflow (see migration 0025 and tracker/Co-Ownership.md):
 *  - `routeAssetEdit`   decides, for an edit of a shared asset, between applying
 *                       it directly (no other REGISTERED co-owner) and staging it
 *                       as a change request with one approval row per registered
 *                       co-owner. One pending request per asset at a time.
 *  - `respondToApproval` records a decision; a rejection rejects the request,
 *                       the last approval applies it.
 *  - `applyChangeRequest` writes the payload to `assets` (+ history, + owners).
 *  - `expirePendingRequests` is what the daily cron calls: pending requests past
 *                       `expires_at` are applied and flagged `auto_approved`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/utils/supabase/service";
import { syncAssetHistory } from "@/lib/asset-history-sync";
import {
  normalizeEmail,
  otherRegisteredOwners,
  timeLeft,
  validateOwners,
  type OwnerInput,
  type OwnerRow,
  type TimeLeft,
} from "@/lib/ownership";
import { sendApprovalEmail, sendSharedWithYouEmail } from "@/lib/shared-assets/notify";
import { isDemoUser } from "@/lib/demo-mode";
import type { Json } from "@/types/supabase";

type Service = ReturnType<typeof createServiceClient>;

export type AssetFields = {
  name: string;
  category_id: string;
  quantity: number;
  current_value: number;
  currency: string;
  metadata: Json;
  images: string[];
  ticker_symbol: string | null;
  purchase_date: string;
};

/** `notify: false` = the requester chose not to email the co-owners (default: notify). */
export type ChangePayload = { fields: AssetFields; owners?: OwnerInput[] | null; notify?: boolean };

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.opeswealth.app";

/** Parses the `owners` form field (JSON); null when absent or not a list. */
export function parseOwnersField(formData: FormData): OwnerInput[] | null {
  const raw = formData.get("owners");
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((o) => ({
      profileId: null, // never trusted from the client: resolved from the email below
      name: String(o?.name ?? ""),
      email: String(o?.email ?? ""),
      percentage: Number(o?.percentage),
      isCreator: o?.isCreator === true,
    }));
  } catch {
    return null;
  }
}

export async function listOwnerRows(service: Service, assetId: string): Promise<OwnerRow[]> {
  const { data } = await service
    .from("asset_owners")
    .select("profile_id, name, email, ownership_percentage, is_creator")
    .eq("asset_id", assetId);
  return (data ?? []).map((r) => ({ ...r, ownership_percentage: Number(r.ownership_percentage) }));
}

/**
 * Has this account finished sign-up? An invited user exists in Auth (and has a
 * profile) from the moment of the invitation but cannot sign in or answer an
 * approval until they accept it, so they must not block edits.
 */
async function hasJoined(service: Service, profileId: string): Promise<boolean> {
  const { data } = await service.auth.admin.getUserById(profileId);
  return !!data.user?.email_confirmed_at || !!data.user?.last_sign_in_at;
}

async function displayName(service: Service, profileId: string): Promise<string> {
  const { data } = await service.from("profiles").select("first_name, last_name").eq("id", profileId).single();
  const name = [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim();
  return name || "A co-owner";
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

/**
 * Emails an invitation to a co-owner who has no account (Supabase Auth invite:
 * creates the user, sends the project's invite template). When they accept, the
 * profile trigger from migration 0025 links their `asset_owners` rows, so the
 * shared assets are on their dashboard immediately. Set
 * `CO_OWNER_INVITE_EMAILS=off` to skip sending (staging / tests).
 */
export async function inviteCoOwner(
  service: Service,
  opts: { email: string; name: string; inviterName: string; assetName: string },
): Promise<{ sent: boolean; reason?: string }> {
  if (process.env.CO_OWNER_INVITE_EMAILS === "off") return { sent: false, reason: "disabled" };
  const [first, ...rest] = opts.name.trim().split(/\s+/);
  const { error } = await service.auth.admin.inviteUserByEmail(opts.email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/dashboard`,
    data: {
      first_name: first ?? "",
      last_name: rest.join(" "),
      invited_by: opts.inviterName,
      invited_asset: opts.assetName,
    },
  });
  if (error) return { sent: false, reason: error.message };
  return { sent: true };
}

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

/**
 * Replaces an asset's owner rows. The creator row is always `creatorProfileId`;
 * co-owners are matched to an account by email (never by a client-sent id).
 * New unregistered emails are invited. Validates the 100% total.
 */
export async function replaceOwners(opts: {
  service?: Service;
  assetId: string;
  assetName: string;
  creatorProfileId: string;
  owners: OwnerInput[];
  /** Email the invitation to new co-owners without an account (default true). */
  notify?: boolean;
}): Promise<{ ok: true; invited: string[] } | { ok: false; error: string }> {
  // Demo account: read-only; these writes use the service role, which bypasses RLS.
  if (isDemoUser(opts.creatorProfileId)) return { ok: true, invited: [] };
  const errors = validateOwners(opts.owners);
  if (errors.length > 0) return { ok: false, error: errors[0] };

  const notify = opts.notify !== false;
  const service = opts.service ?? createServiceClient();
  const previous = await listOwnerRows(service, opts.assetId);
  const previousEmails = new Set(previous.map((r) => (r.email ? normalizeEmail(r.email) : "")));
  // Rows are rewritten wholesale, so carry over what was already known about each invitation.
  const { data: priorInvites } = await service
    .from("asset_owners")
    .select("email, invited_at, invite_status, invite_error")
    .eq("asset_id", opts.assetId);
  const inviterName = await displayName(service, opts.creatorProfileId);

  const rows: {
    asset_id: string;
    profile_id: string | null;
    name: string;
    email: string | null;
    ownership_percentage: number;
    is_creator: boolean;
    invited_at: string | null;
    invite_status: string;
    invite_error: string | null;
  }[] = [];
  const toInvite: OwnerInput[] = [];
  // New co-owners who already have a working account: they get a "shared with you" email instead of an invitation.
  const toTellShared: OwnerInput[] = [];

  for (const o of opts.owners) {
    if (o.isCreator) {
      rows.push({
        asset_id: opts.assetId,
        profile_id: opts.creatorProfileId,
        name: o.name.trim() || inviterName,
        email: o.email.trim() ? normalizeEmail(o.email) : null,
        ownership_percentage: o.percentage,
        is_creator: true,
        invited_at: null,
        invite_status: "not_sent",
        invite_error: null,
      });
      continue;
    }
    const email = normalizeEmail(o.email);
    const { data: existingId } = await service.rpc("profile_id_for_email", { p_email: email });
    const prior = (priorInvites ?? []).find((r) => r.email && normalizeEmail(r.email) === email);
    const isNew = !previousEmails.has(email);
    if (isNew && notify) {
      if (!existingId) toInvite.push(o);
      else if (await hasJoined(service, existingId as string)) toTellShared.push(o);
      else toInvite.push(o); // invited earlier but never accepted: send the invitation again
    }
    rows.push({
      asset_id: opts.assetId,
      profile_id: (existingId as string | null) ?? null,
      name: o.name.trim(),
      email,
      ownership_percentage: o.percentage,
      is_creator: false,
      invited_at: prior?.invited_at ?? null,
      invite_status: prior?.invite_status ?? "not_sent",
      invite_error: prior?.invite_error ?? null,
    });
  }

  const { error: deleteError } = await service.from("asset_owners").delete().eq("asset_id", opts.assetId);
  if (deleteError) return { ok: false, error: deleteError.message };
  const { error: insertError } = await service.from("asset_owners").insert(rows);
  if (insertError) return { ok: false, error: insertError.message };

  const invited: string[] = [];
  for (const o of toInvite) {
    const res = await inviteCoOwner(service, {
      email: normalizeEmail(o.email),
      name: o.name,
      inviterName,
      assetName: opts.assetName,
    });
    if (res.sent) invited.push(normalizeEmail(o.email));
    await recordInvite(service, opts.assetId, normalizeEmail(o.email), res);
  }
  for (const o of toTellShared) {
    const email = normalizeEmail(o.email);
    const res = await sendSharedWithYouEmail(email, {
      recipientName: o.name,
      ownerName: inviterName,
      assetName: opts.assetName,
      percentage: o.percentage,
      url: `${siteUrl()}/dashboard/assets/${opts.assetId}`,
    });
    if (res.sent) invited.push(email);
    await recordInvite(service, opts.assetId, email, res.sent ? { sent: true } : { sent: false, reason: res.reason });
  }
  return { ok: true, invited };
}

/** Stores the outcome of an invitation email on the owner's row. */
async function recordInvite(service: Service, assetId: string, email: string, res: { sent: boolean; reason?: string }) {
  await service
    .from("asset_owners")
    .update({
      invite_status: res.sent ? "sent" : "failed",
      invite_error: res.sent ? null : (res.reason ?? "Unknown error"),
      ...(res.sent ? { invited_at: new Date().toISOString() } : {}),
    })
    .eq("asset_id", assetId)
    .eq("email", email);
}

/** Re-sends the join invitation to a co-owner (creator only; checked by the caller). */
export async function resendInvite(assetId: string, email: string): Promise<{ sent: boolean; reason?: string }> {
  const service = createServiceClient();
  const { data: asset } = await service.from("assets").select("name, profile_id").eq("id", assetId).single();
  if (!asset) return { sent: false, reason: "Asset not found." };
  const { data: owner } = await service
    .from("asset_owners")
    .select("name, profile_id, ownership_percentage")
    .eq("asset_id", assetId)
    .eq("email", normalizeEmail(email))
    .single();
  if (!owner) return { sent: false, reason: "Co-owner not found." };
  const inviterName = await displayName(service, asset.profile_id);
  const alreadyJoined = !!owner.profile_id && (await hasJoined(service, owner.profile_id));
  const res = alreadyJoined
    ? await sendSharedWithYouEmail(normalizeEmail(email), {
        recipientName: owner.name,
        ownerName: inviterName,
        assetName: asset.name,
        percentage: Number(owner.ownership_percentage),
        url: `${siteUrl()}/dashboard/assets/${assetId}`,
      })
    : await inviteCoOwner(service, {
        email: normalizeEmail(email),
        name: owner.name,
        inviterName,
        assetName: asset.name,
      });
  await recordInvite(service, assetId, normalizeEmail(email), res);
  return res;
}

/**
 * Stops sharing the asset with a co-owner who has NOT accepted their invitation yet,
 * without anyone else's approval (creator only; the caller checks that). Their share
 * returns to the creator, any change waiting on them is cancelled, and a never-used
 * invited account with no other shares is deleted so the invitation link stops working.
 */
export async function revokeCoOwner(
  assetId: string,
  creatorId: string,
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isDemoUser(creatorId)) return { ok: true };
  const service = createServiceClient();
  const { data: asset } = await service.from("assets").select("profile_id").eq("id", assetId).single();
  if (!asset || asset.profile_id !== creatorId) return { ok: false, error: "Only the asset's creator can do this." };

  const { data: rows } = await service
    .from("asset_owners")
    .select("id, profile_id, email, ownership_percentage, is_creator")
    .eq("asset_id", assetId);
  const target = (rows ?? []).find((r) => !r.is_creator && r.email && normalizeEmail(r.email) === normalizeEmail(email));
  if (!target) return { ok: false, error: "Co-owner not found." };
  if (target.profile_id && (await hasJoined(service, target.profile_id))) {
    return { ok: false, error: "ownership_revoke_joined" };
  }

  // Cancel any change request that was waiting for this person.
  if (target.profile_id) {
    const { data: theirs } = await service
      .from("change_approvals")
      .select("change_request_id, asset_change_requests!inner(asset_id, status)")
      .eq("profile_id", target.profile_id)
      .eq("asset_change_requests.asset_id", assetId)
      .eq("asset_change_requests.status", "pending");
    for (const a of theirs ?? []) await service.from("asset_change_requests").delete().eq("id", a.change_request_id);
  }

  const remaining = (rows ?? []).filter((r) => r.id !== target.id);
  if (remaining.length <= 1) {
    // Only the creator is left: the asset is solely theirs again.
    await service.from("asset_owners").delete().eq("asset_id", assetId);
  } else {
    await service.from("asset_owners").delete().eq("id", target.id);
    const creatorRow = remaining.find((r) => r.is_creator);
    if (creatorRow) {
      await service
        .from("asset_owners")
        .update({ ownership_percentage: Number(creatorRow.ownership_percentage) + Number(target.ownership_percentage) })
        .eq("id", creatorRow.id);
    }
  }

  // Remove an invited account that never signed in and has no other shares or assets.
  if (target.profile_id) {
    const [{ count: shares }, { count: assets }] = await Promise.all([
      service.from("asset_owners").select("id", { count: "exact", head: true }).eq("profile_id", target.profile_id),
      service.from("assets").select("id", { count: "exact", head: true }).eq("profile_id", target.profile_id),
    ]);
    if (!shares && !assets) await service.auth.admin.deleteUser(target.profile_id);
  }
  return { ok: true };
}

/**
 * Emails the "please review this change" message to the pending approvers of a
 * request (or just `onlyProfileId`) and records, per approver, whether it was sent.
 */
export async function notifyApprovers(
  service: Service,
  requestId: string,
  onlyProfileId?: string,
): Promise<{ sent: number; failed: number }> {
  const { data: request } = await service
    .from("asset_change_requests")
    .select("asset_id, requested_by, expires_at, status")
    .eq("id", requestId)
    .single();
  if (!request || request.status !== "pending") return { sent: 0, failed: 0 };
  const { data: asset } = await service.from("assets").select("name").eq("id", request.asset_id).single();
  const owners = await listOwnerRows(service, request.asset_id);
  const requesterName = await displayName(service, request.requested_by);

  let approvals = (
    await service.from("change_approvals").select("id, profile_id").eq("change_request_id", requestId).eq("status", "pending")
  ).data ?? [];
  if (onlyProfileId) approvals = approvals.filter((a) => a.profile_id === onlyProfileId);

  let sent = 0;
  let failed = 0;
  for (const a of approvals) {
    const owner = owners.find((o) => o.profile_id === a.profile_id);
    const res = owner?.email
      ? await sendApprovalEmail(owner.email, {
          recipientName: owner.name,
          requesterName,
          assetName: asset?.name ?? "a shared asset",
          expiresAt: request.expires_at,
          reviewUrl: `${siteUrl()}/dashboard/assets/${request.asset_id}`,
        })
      : { sent: false as const, reason: "No email address on file." };
    await service
      .from("change_approvals")
      .update(
        res.sent
          ? { notify_status: "sent", notified_at: new Date().toISOString(), notify_error: null }
          : { notify_status: "failed", notify_error: res.reason },
      )
      .eq("id", a.id);
    if (res.sent) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

// ---------------------------------------------------------------------------
// Edit routing and change requests
// ---------------------------------------------------------------------------

export type RouteResult =
  | { mode: "direct" }
  | { mode: "pending"; requestId: string }
  | { mode: "error"; error: string };

/**
 * Decides how an edit of an asset is applied. `direct` = the caller (the
 * creator, with no OTHER registered co-owner) proceeds with its normal update —
 * so edits never wait forever on someone who hasn't signed up. Otherwise the
 * edit is staged as a pending request, approvers being every other registered
 * owner. Errors are translation keys or plain messages.
 */
export async function routeAssetEdit(opts: {
  userId: string;
  assetId: string;
  fields: AssetFields;
  owners: OwnerInput[] | null;
  /** Email the approvers (default true). */
  notify?: boolean;
}): Promise<RouteResult> {
  if (isDemoUser(opts.userId)) return { mode: "direct" }; // the demo user's own (shimmed) update follows
  const service = createServiceClient();
  const { data: asset } = await service.from("assets").select("id, profile_id, name").eq("id", opts.assetId).single();
  if (!asset) return { mode: "error", error: "Asset not found." };

  const rows = await listOwnerRows(service, opts.assetId);
  const isCreator = asset.profile_id === opts.userId;
  if (!isCreator && !rows.some((r) => r.profile_id === opts.userId)) {
    return { mode: "error", error: "Asset not found." };
  }

  if (opts.owners) {
    const errors = validateOwners(opts.owners);
    if (errors.length > 0) return { mode: "error", error: errors[0] };
  }

  // Approvers = the other owners who have actually joined; people who were invited but have not
  // accepted yet cannot answer, so they never block an edit.
  const approvers: (OwnerRow & { profile_id: string })[] = [];
  for (const o of otherRegisteredOwners(rows, opts.userId)) {
    if (await hasJoined(service, o.profile_id)) approvers.push(o);
  }
  // The creator edits freely when nobody else has joined; a co-owner always needs the creator.
  if (isCreator && approvers.length === 0) return { mode: "direct" };

  const { data: pending } = await service
    .from("asset_change_requests")
    .select("id")
    .eq("asset_id", opts.assetId)
    .eq("status", "pending")
    .limit(1);
  if (pending && pending.length > 0) return { mode: "error", error: "change_pending_exists" };

  const notify = opts.notify !== false;
  const payload: ChangePayload = { fields: opts.fields, owners: opts.owners, notify };
  const { data: request, error } = await service
    .from("asset_change_requests")
    .insert({ asset_id: opts.assetId, requested_by: opts.userId, proposed_payload: payload as unknown as Json })
    .select("id")
    .single();
  if (error || !request) return { mode: "error", error: error?.message ?? "Could not create the change request." };

  const { error: approvalError } = await service
    .from("change_approvals")
    .insert(approvers.map((a) => ({ change_request_id: request.id, profile_id: a.profile_id })));
  if (approvalError) {
    await service.from("asset_change_requests").delete().eq("id", request.id);
    return { mode: "error", error: approvalError.message };
  }
  if (notify) await notifyApprovers(service, request.id);
  return { mode: "pending", requestId: request.id };
}

/** Writes a pending request's payload to `assets` (+ history, + owners) and marks it approved. */
export async function applyChangeRequest(
  requestId: string,
  opts: { auto: boolean; service?: Service },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = opts.service ?? createServiceClient();
  const { data: request } = await service
    .from("asset_change_requests")
    .select("id, asset_id, requested_by, proposed_payload, status")
    .eq("id", requestId)
    .single();
  if (!request || request.status !== "pending") return { ok: false, error: "Request is not pending." };

  const payload = request.proposed_payload as unknown as ChangePayload;
  const f = payload.fields;
  const { data: asset } = await service.from("assets").select("id, profile_id").eq("id", request.asset_id).single();
  if (!asset) return { ok: false, error: "Asset no longer exists." };

  const { error: updateError } = await service
    .from("assets")
    .update({
      category_id: f.category_id,
      name: f.name,
      quantity: f.quantity,
      current_value: f.current_value,
      currency: f.currency,
      metadata: f.metadata,
      images: f.images,
      ticker_symbol: f.ticker_symbol,
      purchase_date: f.purchase_date,
      updated_at: new Date().toISOString(),
    })
    .eq("id", asset.id);
  if (updateError) return { ok: false, error: updateError.message };

  const { data: category } = await service.from("asset_categories").select("name").eq("id", f.category_id).single();
  await syncAssetHistory(service as unknown as SupabaseClient, asset.id, f.current_value, category?.name, f.metadata);

  if (payload.owners) {
    const res = await replaceOwners({
      service,
      assetId: asset.id,
      assetName: f.name,
      creatorProfileId: asset.profile_id,
      owners: payload.owners,
      notify: payload.notify,
    });
    if (!res.ok) return { ok: false, error: res.error };
  }

  await service
    .from("asset_change_requests")
    .update({ status: "approved", auto_approved: opts.auto, resolved_at: new Date().toISOString() })
    .eq("id", requestId);
  return { ok: true };
}

/** Records the user's decision on their approval row; resolves the request when decided. */
export async function respondToApproval(opts: {
  userId: string;
  requestId: string;
  approve: boolean;
}): Promise<{ ok: true; outcome: "approved" | "rejected" | "waiting" } | { ok: false; error: string }> {
  if (isDemoUser(opts.userId)) return { ok: true, outcome: "approved" };
  const service = createServiceClient();
  const { data: approval } = await service
    .from("change_approvals")
    .select("id, status")
    .eq("change_request_id", opts.requestId)
    .eq("profile_id", opts.userId)
    .single();
  if (!approval || approval.status !== "pending") return { ok: false, error: "No pending approval for you on this request." };

  const { data: request } = await service
    .from("asset_change_requests")
    .select("id, status")
    .eq("id", opts.requestId)
    .single();
  if (!request || request.status !== "pending") return { ok: false, error: "This request is no longer pending." };

  await service
    .from("change_approvals")
    .update({ status: opts.approve ? "approved" : "rejected", decided_at: new Date().toISOString() })
    .eq("id", approval.id);

  if (!opts.approve) {
    await service
      .from("asset_change_requests")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .eq("id", opts.requestId);
    return { ok: true, outcome: "rejected" };
  }

  const { data: remaining } = await service
    .from("change_approvals")
    .select("id")
    .eq("change_request_id", opts.requestId)
    .eq("status", "pending");
  if (remaining && remaining.length > 0) return { ok: true, outcome: "waiting" };

  const applied = await applyChangeRequest(opts.requestId, { auto: false, service });
  if (!applied.ok) return { ok: false, error: applied.error };
  return { ok: true, outcome: "approved" };
}

/** The daily job: applies every pending request whose `expires_at` has passed, flagged auto-approved. */
export async function expirePendingRequests(): Promise<{ applied: number; failed: { id: string; error: string }[] }> {
  const service = createServiceClient();
  const { data: due } = await service
    .from("asset_change_requests")
    .select("id")
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
  const failed: { id: string; error: string }[] = [];
  let applied = 0;
  for (const r of due ?? []) {
    const res = await applyChangeRequest(r.id, { auto: true, service });
    if (res.ok) applied += 1;
    else failed.push({ id: r.id, error: res.error });
  }
  return { applied, failed };
}

// ---------------------------------------------------------------------------
// Sharing & approval status (asset page)
// ---------------------------------------------------------------------------

export type OwnerStatus = {
  key: string;
  name: string;
  email: string;
  percentage: number;
  isCreator: boolean;
  isYou: boolean;
  /** Has an account that finished sign-up. */
  joined: boolean;
  inviteStatus: "not_sent" | "sent" | "failed";
  invitedAt: string | null;
  inviteError: string | null;
};

export type ApprovalStatus = {
  profileId: string;
  name: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  decidedAt: string | null;
  notifyStatus: "not_sent" | "sent" | "failed";
  notifiedAt: string | null;
  notifyError: string | null;
};

export type OwnershipStatus = {
  /** The signed-in user created the asset (may resend invitations). */
  isCreator: boolean;
  owners: OwnerStatus[];
  request: null | {
    id: string;
    requesterName: string;
    /** The signed-in user proposed it (may resend the review emails). */
    isMine: boolean;
    createdAt: string;
    expiresAt: string;
    timeLeft: TimeLeft;
    approvals: ApprovalStatus[];
  };
};

/** Who was emailed and what is awaiting approval for a shared asset. Caller must have checked membership. */
export async function loadOwnershipStatus(assetId: string, userId: string): Promise<OwnershipStatus | null> {
  const service = createServiceClient();
  const { data: asset } = await service.from("assets").select("profile_id").eq("id", assetId).single();
  if (!asset) return null;
  const { data: rows } = await service
    .from("asset_owners")
    .select("profile_id, name, email, ownership_percentage, is_creator, invited_at, invite_status, invite_error")
    .eq("asset_id", assetId)
    .order("is_creator", { ascending: false });
  if (!rows || rows.length < 2) return null;

  // Which registered co-owners have finished sign-up (an invited user has not confirmed yet).
  const joined = new Map<string, boolean>();
  for (const r of rows) {
    if (!r.profile_id || joined.has(r.profile_id)) continue;
    joined.set(r.profile_id, await hasJoined(service, r.profile_id));
  }

  const owners: OwnerStatus[] = rows.map((r, i) => ({
    key: `owner-${i}`,
    name: r.name,
    email: r.email ?? "",
    percentage: Number(r.ownership_percentage),
    isCreator: r.is_creator,
    isYou: r.profile_id === userId,
    joined: r.profile_id ? (joined.get(r.profile_id) ?? false) : false,
    inviteStatus: r.invite_status as OwnerStatus["inviteStatus"],
    invitedAt: r.invited_at,
    inviteError: r.invite_error,
  }));

  const { data: req } = await service
    .from("asset_change_requests")
    .select("id, requested_by, created_at, expires_at")
    .eq("asset_id", assetId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let request: OwnershipStatus["request"] = null;
  if (req) {
    const { data: approvals } = await service
      .from("change_approvals")
      .select("profile_id, status, decided_at, notify_status, notified_at, notify_error")
      .eq("change_request_id", req.id);
    request = {
      id: req.id,
      requesterName: await displayName(service, req.requested_by),
      isMine: req.requested_by === userId,
      createdAt: req.created_at,
      expiresAt: req.expires_at,
      timeLeft: timeLeft(req.expires_at),
      approvals: (approvals ?? []).map((a) => {
        const owner = rows.find((r) => r.profile_id === a.profile_id);
        return {
          profileId: a.profile_id,
          name: owner?.name ?? "",
          email: owner?.email ?? "",
          status: a.status as ApprovalStatus["status"],
          decidedAt: a.decided_at,
          notifyStatus: a.notify_status as ApprovalStatus["notifyStatus"],
          notifiedAt: a.notified_at,
          notifyError: a.notify_error,
        };
      }),
    };
  }
  return { isCreator: asset.profile_id === userId, owners, request };
}

// ---------------------------------------------------------------------------
// Notifications (the header's approval list)
// ---------------------------------------------------------------------------

export type PendingApproval = {
  requestId: string;
  assetId: string;
  assetName: string;
  requesterName: string;
  createdAt: string;
  expiresAt: string;
  /** What the edit changes, as [field label key, before, after]. */
  changes: { key: string; before: string; after: string }[];
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Pending approvals addressed to `userId`, with a summary of what each edit changes. */
export async function loadPendingApprovals(userId: string): Promise<PendingApproval[]> {
  const service = createServiceClient();
  const { data: approvals } = await service
    .from("change_approvals")
    .select("change_request_id")
    .eq("profile_id", userId)
    .eq("status", "pending");
  const ids = (approvals ?? []).map((a) => a.change_request_id);
  if (ids.length === 0) return [];

  const { data: requests } = await service
    .from("asset_change_requests")
    .select("id, asset_id, requested_by, proposed_payload, created_at, expires_at")
    .in("id", ids)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const out: PendingApproval[] = [];
  for (const r of requests ?? []) {
    const { data: asset } = await service
      .from("assets")
      .select("name, quantity, current_value, currency, purchase_date, ticker_symbol, metadata")
      .eq("id", r.asset_id)
      .single();
    if (!asset) continue;
    const payload = r.proposed_payload as unknown as ChangePayload;
    const f = payload.fields;
    const changes: PendingApproval["changes"] = [];
    const add = (key: string, before: unknown, after: unknown) => {
      if (!same(before, after)) changes.push({ key, before: String(before ?? "—"), after: String(after ?? "—") });
    };
    add("name", asset.name, f.name);
    add("quantity", asset.quantity, f.quantity);
    add("current_value", `${asset.current_value} ${asset.currency}`, `${f.current_value} ${f.currency}`);
    add("purchase_date", asset.purchase_date, f.purchase_date);
    add("ticker_symbol", asset.ticker_symbol, f.ticker_symbol);
    const metaBefore = (asset.metadata ?? {}) as Record<string, unknown>;
    const metaAfter = (f.metadata ?? {}) as Record<string, unknown>;
    const keys = new Set([...Object.keys(metaBefore), ...Object.keys(metaAfter)]);
    const changedMeta = [...keys].filter((k) => !same(metaBefore[k], metaAfter[k]));
    if (changedMeta.length > 0) changes.push({ key: "details", before: "", after: changedMeta.slice(0, 6).join(", ") });
    if (payload.owners) {
      const rows = await listOwnerRows(service, r.asset_id);
      const before = rows.map((o) => `${(o.email ?? o.profile_id ?? "").toLowerCase()}:${o.ownership_percentage}`).sort();
      const after = payload.owners.map((o) => `${o.email.toLowerCase()}:${o.percentage}`);
      // The creator row's email may be blank in the payload: compare percentages + count only.
      const pct = (xs: string[]) => xs.map((x) => x.split(":")[1]).sort().join(",");
      if (pct(before) !== pct(after)) changes.push({ key: "owners", before: "", after: "" });
    }
    out.push({
      requestId: r.id,
      assetId: r.asset_id,
      assetName: asset.name,
      requesterName: await displayName(service, r.requested_by),
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      changes,
    });
  }
  return out;
}
