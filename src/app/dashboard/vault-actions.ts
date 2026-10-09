"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { createMockAdminClient, getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { isDemoUser } from "@/lib/demo-mode";
import {
  VAULT_BUCKET,
  VAULT_MAX_BYTES,
  VAULT_MAX_BYTES_PER_USER,
  VAULT_MAX_DOCS_PER_ASSET,
  VAULT_MAX_DOCS_PER_USER,
  VAULT_SIGNED_URL_SECONDS,
  buildStoragePath,
  extensionFor,
  isMissingBucket,
  isMissingVaultTable,
  isOwnPath,
  isUuid,
  sanitizeFileStem,
  toVaultDocument,
  validateDocMeta,
  validateUploadBytes,
  visibleDocuments,
  type VaultDocument,
  type VaultError,
  type VaultMime,
} from "@/lib/vault";

/**
 * Governance Vault server actions (table + private bucket from migration 0038).
 *
 * Every action: the user comes from the session (never from arguments); MFA step-up is required (same
 * gate as the other sensitive actions); dev-only mock auth is honoured; writes refuse the read-only demo
 * account. Visibility is enforced twice: by RLS (the cookie-bound client) and again in code, because the
 * mock client bypasses RLS and because defence in depth is cheap here. A document that does not exist and
 * one the caller may not see give the SAME answer (`vault_err_not_found`): no enumeration. The storage
 * path never leaves the server; files are reached only through a 60 s signed URL issued after an access
 * log row is written (fail closed).
 */

export type VaultResult<T = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: VaultError };

type Gate = { ok: true; db: SupabaseClient; userId: string } | { ok: false; error: VaultError };

async function gate(write: boolean): Promise<Gate> {
  const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
  const supabase = mockUserId ? createMockAdminClient() : await createClient();
  const user = mockUserId ? { id: mockUserId } : (await supabase.auth.getUser()).data.user;
  if (!user) return { ok: false, error: "vault_err_signed_out" };
  if (!mockUserId && (await needsMfaStepUp(supabase))) return { ok: false, error: "vault_err_mfa" };
  if (write && isDemoUser(user.id)) return { ok: false, error: "vault_err_demo" };
  return { ok: true, db: supabase as unknown as SupabaseClient, userId: user.id };
}

const failure = (err: unknown): { ok: false; error: VaultError } => ({
  ok: false,
  error: isMissingVaultTable(err) || isMissingBucket(err) ? "vault_err_unavailable" : "vault_err_failed",
});

/** Creator of the asset, or a registered co-owner. */
async function isMember(db: SupabaseClient, assetId: string, userId: string): Promise<boolean> {
  const own = await db.from("assets").select("id").eq("id", assetId).eq("profile_id", userId).limit(1);
  if (!own.error && (own.data?.length ?? 0) > 0) return true;
  const co = await db.from("asset_owners").select("asset_id").eq("asset_id", assetId).eq("profile_id", userId).limit(1);
  return !co.error && (co.data?.length ?? 0) > 0;
}

const DOC_COLUMNS = "id, asset_id, profile_id, title, doc_type, mime_type, size_bytes, expires_on, owner_only, created_at";

type DocRow = Record<string, unknown> & { id: string; asset_id: string; profile_id: string; storage_path?: string; title?: string; doc_type?: string };

/** A document the caller may see (RLS + code), or null. Optionally with its storage path. */
async function findVisible(db: SupabaseClient, userId: string, docId: string, withPath: boolean): Promise<DocRow | null> {
  const { data, error } = await db
    .from("asset_documents")
    .select(withPath ? `${DOC_COLUMNS}, storage_path` : DOC_COLUMNS)
    .eq("id", docId)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const rows = visibleDocuments(data as unknown as Record<string, unknown>[], userId);
  const row = rows[0] as DocRow | undefined;
  if (!row) return null;
  if (row.profile_id !== userId && !(await isMember(db, row.asset_id, userId))) return null;
  return row;
}

async function writeLog(db: SupabaseClient, doc: DocRow, actorId: string, action: "view" | "download" | "upload" | "delete"): Promise<boolean> {
  const { error } = await db
    .from("document_access_log")
    .insert({ document_id: doc.id, owner_id: doc.profile_id, actor_id: actorId, action });
  return !error;
}

export async function listDocuments(assetId: string): Promise<VaultResult<{ available: boolean; documents: VaultDocument[] }>> {
  try {
    const g = await gate(false);
    if (!g.ok) return g;
    if (!isUuid(assetId)) return { ok: false, error: "vault_err_not_found" };
    if (!(await isMember(g.db, assetId, g.userId))) return { ok: false, error: "vault_err_not_found" };
    const { data, error } = await g.db
      .from("asset_documents")
      .select(DOC_COLUMNS)
      .eq("asset_id", assetId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      if (isMissingVaultTable(error)) return { ok: true, available: false, documents: [] };
      return { ok: false, error: "vault_err_failed" };
    }
    const documents = visibleDocuments((data ?? []) as Record<string, unknown>[], g.userId)
      .map((r) => toVaultDocument(r, g.userId))
      .filter((d): d is VaultDocument => d !== null);
    return { ok: true, available: true, documents };
  } catch {
    return { ok: false, error: "vault_err_failed" };
  }
}

export async function uploadDocument(formData: FormData): Promise<VaultResult<{ id: string }>> {
  try {
    const g = await gate(true);
    if (!g.ok) return g;
    const assetId = formData.get("assetId");
    const file = formData.get("file");
    if (!isUuid(assetId)) return { ok: false, error: "vault_err_bad_request" };
    if (!(file instanceof File)) return { ok: false, error: "vault_err_file_missing" };
    if (file.size > VAULT_MAX_BYTES) return { ok: false, error: "vault_err_file_size" };
    const meta = validateDocMeta({
      title: formData.get("title"),
      docType: formData.get("docType"),
      expiresOn: formData.get("expiresOn"),
      ownerOnly: formData.get("ownerOnly"),
    });
    if (!meta.ok) return meta;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateUploadBytes(bytes);
    if (!check.ok) return check;
    const mime: VaultMime = check.mime;

    if (!(await isMember(g.db, assetId, g.userId))) return { ok: false, error: "vault_err_not_found" };

    // Count caps (per asset, per user, total bytes per user), on the caller's own documents.
    const mine = await g.db.from("asset_documents").select("asset_id, size_bytes").eq("profile_id", g.userId).limit(1000);
    if (mine.error) return failure(mine.error);
    const rows = (mine.data ?? []) as { asset_id: string; size_bytes: number }[];
    if (rows.filter((r) => r.asset_id === assetId).length >= VAULT_MAX_DOCS_PER_ASSET) return { ok: false, error: "vault_err_limit_asset" };
    if (rows.length >= VAULT_MAX_DOCS_PER_USER) return { ok: false, error: "vault_err_limit_user" };
    if (rows.reduce((s, r) => s + (Number(r.size_bytes) || 0), 0) + bytes.length > VAULT_MAX_BYTES_PER_USER) {
      return { ok: false, error: "vault_err_limit_storage" };
    }

    // The path is built here from validated parts only; the client's name contributes a sanitised stem.
    const path = buildStoragePath({
      ownerId: g.userId,
      assetId,
      fileId: crypto.randomUUID(),
      fileName: file.name,
      mime,
    });
    const up = await g.db.storage.from(VAULT_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
    if (up.error) return failure(up.error);

    const ins = await g.db
      .from("asset_documents")
      .insert({
        asset_id: assetId,
        profile_id: g.userId,
        title: meta.value.title,
        doc_type: meta.value.docType,
        storage_path: path,
        mime_type: mime,
        size_bytes: bytes.length,
        expires_on: meta.value.expiresOn,
        owner_only: meta.value.ownerOnly,
      })
      .select("id");
    const id = (ins.data as { id?: string }[] | null)?.[0]?.id;
    if (ins.error || !id) {
      await g.db.storage.from(VAULT_BUCKET).remove([path]); // do not leave an orphan object
      return failure(ins.error);
    }
    await writeLog(g.db, { id, asset_id: assetId, profile_id: g.userId }, g.userId, "upload"); // best-effort
    return { ok: true, id };
  } catch {
    return { ok: false, error: "vault_err_failed" };
  }
}

export async function getDocumentUrl(docId: string, mode: "view" | "download"): Promise<VaultResult<{ url: string }>> {
  try {
    const g = await gate(false);
    if (!g.ok) return g;
    if (!isUuid(docId) || (mode !== "view" && mode !== "download")) return { ok: false, error: "vault_err_not_found" };
    const doc = await findVisible(g.db, g.userId, docId, true);
    const path = doc?.storage_path;
    if (!doc || typeof path !== "string" || !isOwnPath(path, doc.profile_id)) return { ok: false, error: "vault_err_not_found" };

    // Audit first, fail closed: no log row, no link.
    if (!(await writeLog(g.db, doc, g.userId, mode))) return { ok: false, error: "vault_err_failed" };

    const ext = extensionFor(doc.mime_type as VaultMime);
    const downloadName = `${sanitizeFileStem(String(doc.title ?? "document"))}.${ext}`;
    const { data, error } = await createServiceClient()
      .storage.from(VAULT_BUCKET)
      .createSignedUrl(path, VAULT_SIGNED_URL_SECONDS, mode === "download" ? { download: downloadName } : undefined);
    if (error || !data?.signedUrl) return failure(error);
    return { ok: true, url: data.signedUrl };
  } catch {
    return { ok: false, error: "vault_err_failed" };
  }
}

export async function updateDocument(
  docId: string,
  input: { title?: unknown; docType?: unknown; expiresOn?: unknown; ownerOnly?: unknown },
): Promise<VaultResult> {
  try {
    const g = await gate(true);
    if (!g.ok) return g;
    if (!isUuid(docId)) return { ok: false, error: "vault_err_not_found" };
    const meta = validateDocMeta(input);
    if (!meta.ok) return meta;
    const { data, error } = await g.db
      .from("asset_documents")
      .update({
        title: meta.value.title,
        doc_type: meta.value.docType,
        expires_on: meta.value.expiresOn,
        owner_only: meta.value.ownerOnly,
      })
      .eq("id", docId)
      .eq("profile_id", g.userId)
      .select("id");
    if (error) return failure(error);
    if (!data || data.length === 0) return { ok: false, error: "vault_err_not_found" };
    return { ok: true };
  } catch {
    return { ok: false, error: "vault_err_failed" };
  }
}

export async function deleteDocument(docId: string): Promise<VaultResult> {
  try {
    const g = await gate(true);
    if (!g.ok) return g;
    if (!isUuid(docId)) return { ok: false, error: "vault_err_not_found" };
    const doc = await findVisible(g.db, g.userId, docId, true);
    const path = doc?.storage_path;
    if (!doc || doc.profile_id !== g.userId || typeof path !== "string" || !isOwnPath(path, g.userId)) {
      return { ok: false, error: "vault_err_not_found" };
    }
    // Log the intent first (the row is still visible to the log's insert policy), fail closed.
    if (!(await writeLog(g.db, doc, g.userId, "delete"))) return { ok: false, error: "vault_err_failed" };
    // Object first, row second: a failure in between leaves a row the owner can delete again (never an unreachable file).
    const rm = await g.db.storage.from(VAULT_BUCKET).remove([path]);
    if (rm.error) return failure(rm.error);
    const { data, error } = await g.db.from("asset_documents").delete().eq("id", docId).eq("profile_id", g.userId).select("id");
    if (error) return failure(error);
    if (!data || data.length === 0) return { ok: false, error: "vault_err_not_found" };
    return { ok: true };
  } catch {
    return { ok: false, error: "vault_err_failed" };
  }
}
