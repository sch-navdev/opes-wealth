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
  validateOwners,
  type OwnerInput,
  type OwnerRow,
} from "@/lib/ownership";
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

export type ChangePayload = { fields: AssetFields; owners?: OwnerInput[] | null };

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
}): Promise<{ ok: true; invited: string[] } | { ok: false; error: string }> {
  const errors = validateOwners(opts.owners);
  if (errors.length > 0) return { ok: false, error: errors[0] };

  const service = opts.service ?? createServiceClient();
  const previous = await listOwnerRows(service, opts.assetId);
  const previousEmails = new Set(previous.map((r) => (r.email ? normalizeEmail(r.email) : "")));
  const inviterName = await displayName(service, opts.creatorProfileId);

  const rows: {
    asset_id: string;
    profile_id: string | null;
    name: string;
    email: string | null;
    ownership_percentage: number;
    is_creator: boolean;
    invited_at: string | null;
  }[] = [];
  const toInvite: OwnerInput[] = [];

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
      });
      continue;
    }
    const email = normalizeEmail(o.email);
    const { data: existingId } = await service.rpc("profile_id_for_email", { p_email: email });
    const prior = previous.find((r) => r.email && normalizeEmail(r.email) === email);
    const isNew = !previousEmails.has(email);
    if (isNew && !existingId) toInvite.push(o);
    rows.push({
      asset_id: opts.assetId,
      profile_id: (existingId as string | null) ?? null,
      name: o.name.trim(),
      email,
      ownership_percentage: o.percentage,
      is_creator: false,
      invited_at: isNew && !existingId ? new Date().toISOString() : prior ? null : null,
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
  }
  return { ok: true, invited };
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
}): Promise<RouteResult> {
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

  const approvers = otherRegisteredOwners(rows, opts.userId);
  // The creator edits freely when nobody else is registered; a co-owner always needs the creator.
  if (isCreator && approvers.length === 0) return { mode: "direct" };

  const { data: pending } = await service
    .from("asset_change_requests")
    .select("id")
    .eq("asset_id", opts.assetId)
    .eq("status", "pending")
    .limit(1);
  if (pending && pending.length > 0) return { mode: "error", error: "change_pending_exists" };

  const payload: ChangePayload = { fields: opts.fields, owners: opts.owners };
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
