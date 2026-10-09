/**
 * Governance Vault: PURE helpers (no server imports, safe in client components). Types, limits,
 * upload validation (magic bytes, size, names), server-side path building, expiry maths.
 * The table / bucket come from migration 0038 (see tracker/Governance-Vault.md).
 */

export const VAULT_BUCKET = "governance-vault";
export const VAULT_MAX_BYTES = 15 * 1024 * 1024;
export const VAULT_MAX_DOCS_PER_ASSET = 50;
export const VAULT_MAX_DOCS_PER_USER = 500;
export const VAULT_MAX_BYTES_PER_USER = 2 * 1024 * 1024 * 1024;
/** Signed links live this long (seconds). */
export const VAULT_SIGNED_URL_SECONDS = 60;
export const VAULT_TITLE_MAX = 120;

export const DOC_TYPES = ["deed", "insurance", "trust_deed", "tax", "valuation", "id", "contract", "other"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const VAULT_MIMES = ["application/pdf", "image/png", "image/jpeg"] as const;
export type VaultMime = (typeof VAULT_MIMES)[number];

export type VaultError =
  | "vault_err_signed_out"
  | "vault_err_mfa"
  | "vault_err_demo"
  | "vault_err_not_found"
  | "vault_err_unavailable"
  | "vault_err_failed"
  | "vault_err_bad_request"
  | "vault_err_file_missing"
  | "vault_err_file_type"
  | "vault_err_file_size"
  | "vault_err_file_empty"
  | "vault_err_title"
  | "vault_err_doc_type"
  | "vault_err_expiry"
  | "vault_err_limit_asset"
  | "vault_err_limit_user"
  | "vault_err_limit_storage";

/** What the browser gets for a document. NEVER includes the storage path. */
export type VaultDocument = {
  id: string;
  assetId: string;
  title: string;
  docType: DocType;
  mimeType: VaultMime;
  sizeBytes: number;
  expiresOn: string | null;
  ownerOnly: boolean;
  createdAt: string;
  /** True when the signed-in user owns (uploaded) it: only then can it be edited or deleted. */
  isMine: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

export const isDocType = (v: unknown): v is DocType => typeof v === "string" && (DOC_TYPES as readonly string[]).includes(v);

/** The real type of a file from its first bytes (never from the client's mime or file name). */
export function detectMime(bytes: Uint8Array): VaultMime | null {
  const startsWith = (sig: number[]) => bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}

const EXT: Record<VaultMime, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };
export const extensionFor = (mime: VaultMime): string => EXT[mime];

/**
 * A storage-safe file stem from a client-supplied name: basename only, no extension, ASCII
 * letters / digits / dot-free, at most 60 chars, never empty. The extension is NOT taken from the
 * name (it comes from the detected type).
 */
export function sanitizeFileStem(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").normalize("NFKD");
  const noExt = base.replace(/\.[A-Za-z0-9]{1,8}$/, "");
  const stem = noExt
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return stem || "document";
}

/** `<owner>/<asset>/<uuid>-<stem>.<ext>`: built here, on the server, from validated parts only. */
export function buildStoragePath(args: { ownerId: string; assetId: string; fileId: string; fileName: string; mime: VaultMime }): string {
  const { ownerId, assetId, fileId } = args;
  if (!isUuid(ownerId) || !isUuid(assetId) || !isUuid(fileId)) throw new Error("invalid path part");
  return `${ownerId}/${assetId}/${fileId}-${sanitizeFileStem(args.fileName)}.${extensionFor(args.mime)}`;
}

/** True when `path` is inside `<ownerId>/` with exactly the expected shape (no traversal). */
export function isOwnPath(path: string, ownerId: string): boolean {
  if (!isUuid(ownerId) || path.includes("..") || path.includes("\\")) return false;
  const parts = path.split("/");
  return parts.length === 3 && parts[0].toLowerCase() === ownerId.toLowerCase() && isUuid(parts[1]) && parts[2].length > 0;
}

export type FileCheck = { ok: true; mime: VaultMime } | { ok: false; error: VaultError };

/** Validates the bytes of an upload: non-empty, within the limit, and a real PDF / PNG / JPEG. */
export function validateUploadBytes(bytes: Uint8Array): FileCheck {
  if (bytes.length === 0) return { ok: false, error: "vault_err_file_empty" };
  if (bytes.length > VAULT_MAX_BYTES) return { ok: false, error: "vault_err_file_size" };
  const mime = detectMime(bytes);
  return mime ? { ok: true, mime } : { ok: false, error: "vault_err_file_type" };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date `YYYY-MM-DD`, within a sane window. */
export function isValidDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  const y = d.getUTCFullYear();
  return y >= 1900 && y <= 2200;
}

export type DocMeta = { title: string; docType: DocType; expiresOn: string | null; ownerOnly: boolean };

/** Validates the editable fields (shared by upload and update). */
export function validateDocMeta(input: { title?: unknown; docType?: unknown; expiresOn?: unknown; ownerOnly?: unknown }):
  | { ok: true; value: DocMeta }
  | { ok: false; error: VaultError } {
  const title = typeof input.title === "string" ? input.title.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
  if (title.length < 1 || title.length > VAULT_TITLE_MAX) return { ok: false, error: "vault_err_title" };
  if (!isDocType(input.docType)) return { ok: false, error: "vault_err_doc_type" };
  let expiresOn: string | null = null;
  if (typeof input.expiresOn === "string" && input.expiresOn.trim() !== "") {
    if (!isValidDate(input.expiresOn.trim())) return { ok: false, error: "vault_err_expiry" };
    expiresOn = input.expiresOn.trim();
  } else if (input.expiresOn != null && input.expiresOn !== "") {
    return { ok: false, error: "vault_err_expiry" };
  }
  return { ok: true, value: { title, docType: input.docType, expiresOn, ownerOnly: input.ownerOnly === true || input.ownerOnly === "true" } };
}

/** Normalises a table row to the DTO (drops the storage path); null when unusable. */
export function toVaultDocument(row: Record<string, unknown>, userId: string): VaultDocument | null {
  if (typeof row.id !== "string" || typeof row.asset_id !== "string" || typeof row.title !== "string") return null;
  if (!isDocType(row.doc_type)) return null;
  if (!(VAULT_MIMES as readonly string[]).includes(row.mime_type as string)) return null;
  return {
    id: row.id,
    assetId: row.asset_id,
    title: row.title,
    docType: row.doc_type,
    mimeType: row.mime_type as VaultMime,
    sizeBytes: Number(row.size_bytes) || 0,
    expiresOn: typeof row.expires_on === "string" ? row.expires_on : null,
    ownerOnly: row.owner_only === true,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    isMine: row.profile_id === userId,
  };
}

/** Keeps what `userId` may see: their own documents and other people's that are not owner-only (RLS does the same). */
export function visibleDocuments(rows: Record<string, unknown>[], userId: string): Record<string, unknown>[] {
  return rows.filter((r) => r.profile_id === userId || r.owner_only !== true);
}

/** Whole days from `today` (YYYY-MM-DD, UTC) to `expiresOn`; negative once past. */
export function daysUntil(expiresOn: string, today: string): number {
  const ms = Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export type ExpiryStatus = "none" | "ok" | "soon" | "urgent" | "expired";

/** Badge state: expired, urgent (<= 7 days), soon (<= 60), ok. */
export function expiryStatus(expiresOn: string | null, today: string): { status: ExpiryStatus; days: number | null } {
  if (!expiresOn) return { status: "none", days: null };
  const days = daysUntil(expiresOn, today);
  if (days < 0) return { status: "expired", days };
  if (days <= 7) return { status: "urgent", days };
  if (days <= 60) return { status: "soon", days };
  return { status: "ok", days };
}

export const todayUtc = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

/** "2.4 MB" / "310 KB". */
export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${n} B`;
}

/** True for "the vault tables are not there yet" (migration 0038 not applied). */
export function isMissingVaultTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  const msg = e.message ?? "";
  return (
    e.code === "42P01" ||
    e.code === "PGRST205" ||
    (/asset_documents|document_access_log/i.test(msg) && /does not exist|schema cache|could not find/i.test(msg))
  );
}

/** True for "the bucket is not there yet". */
export function isMissingBucket(err: unknown): boolean {
  const msg = (err as { message?: string } | null)?.message ?? "";
  return /bucket not found/i.test(msg);
}
