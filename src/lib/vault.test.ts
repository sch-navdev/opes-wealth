import { describe, expect, it } from "vitest";
import {
  buildStoragePath,
  daysUntil,
  detectMime,
  expiryStatus,
  formatBytes,
  isMissingVaultTable,
  isOwnPath,
  sanitizeFileStem,
  toVaultDocument,
  validateDocMeta,
  validateUploadBytes,
  visibleDocuments,
  VAULT_MAX_BYTES,
} from "@/lib/vault";

const U = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const F = "ffffffff-ffff-4fff-8fff-ffffffffffff";

describe("detectMime (magic bytes)", () => {
  it("recognises PDF, PNG, JPEG", () => {
    expect(detectMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1]))).toBe("application/pdf");
    expect(detectMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(detectMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });
  it("rejects html, svg, zip, gif, truncated headers and empty input", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(detectMime(enc("<html>"))).toBeNull();
    expect(detectMime(enc("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectMime(new Uint8Array([0x50, 0x4b, 3, 4]))).toBeNull();
    expect(detectMime(enc("GIF89a"))).toBeNull();
    expect(detectMime(new Uint8Array([0x25, 0x50, 0x44]))).toBeNull();
    expect(detectMime(new Uint8Array([]))).toBeNull();
    expect(detectMime(enc("  %PDF-1.4"))).toBeNull(); // must START with the signature
  });
});

describe("validateUploadBytes", () => {
  it("checks empty, size and type in that order", () => {
    expect(validateUploadBytes(new Uint8Array(0))).toEqual({ ok: false, error: "vault_err_file_empty" });
    const big = new Uint8Array(VAULT_MAX_BYTES + 1);
    big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(validateUploadBytes(big)).toEqual({ ok: false, error: "vault_err_file_size" });
    expect(validateUploadBytes(new Uint8Array([1, 2, 3]))).toEqual({ ok: false, error: "vault_err_file_type" });
    expect(validateUploadBytes(new Uint8Array([0xff, 0xd8, 0xff, 0]))).toEqual({ ok: true, mime: "image/jpeg" });
    const exactly = new Uint8Array(VAULT_MAX_BYTES);
    exactly.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(validateUploadBytes(exactly).ok).toBe(true);
  });
});

describe("sanitizeFileStem / buildStoragePath", () => {
  it("strips paths, extensions, accents, control and unicode tricks", () => {
    expect(sanitizeFileStem("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileStem("C:\\Users\\x\\Titre de propriété (v2).PDF")).toBe("Titre-de-propriete-v2");
    expect(sanitizeFileStem("a\u0000b\nc\u202e.pdf")).toBe("a-b-c");
    expect(sanitizeFileStem("....")).toBe("document");
    expect(sanitizeFileStem("")).toBe("document");
    expect(sanitizeFileStem("x".repeat(300)).length).toBe(60);
    expect(sanitizeFileStem("证书.pdf")).toBe("document");
  });
  it("builds <owner>/<asset>/<uuid>-<stem>.<ext> with the extension from the detected type", () => {
    expect(buildStoragePath({ ownerId: U, assetId: A, fileId: F, fileName: "evil.html", mime: "image/jpeg" })).toBe(`${U}/${A}/${F}-evil.jpg`);
  });
  it("refuses non-uuid parts (path traversal through ids)", () => {
    expect(() => buildStoragePath({ ownerId: "../x", assetId: A, fileId: F, fileName: "a", mime: "application/pdf" })).toThrow();
    expect(() => buildStoragePath({ ownerId: U, assetId: `${A}/..`, fileId: F, fileName: "a", mime: "application/pdf" })).toThrow();
  });
});

describe("isOwnPath", () => {
  it("accepts only <owner>/<asset-uuid>/<file>", () => {
    expect(isOwnPath(`${U}/${A}/x.pdf`, U)).toBe(true);
    expect(isOwnPath(`${A}/${A}/x.pdf`, U)).toBe(false);
    expect(isOwnPath(`${U}/${A}/../${A}/x.pdf`, U)).toBe(false);
    expect(isOwnPath(`${U}/x.pdf`, U)).toBe(false);
    expect(isOwnPath(`${U}/${A}/`, U)).toBe(false);
    expect(isOwnPath(`${U}\\${A}\\x.pdf`, U)).toBe(false);
  });
});

describe("validateDocMeta", () => {
  it("normalises a valid input", () => {
    expect(validateDocMeta({ title: "  Deed ", docType: "deed", expiresOn: "2027-03-01", ownerOnly: true })).toEqual({
      ok: true,
      value: { title: "Deed", docType: "deed", expiresOn: "2027-03-01", ownerOnly: true },
    });
    const r = validateDocMeta({ title: "a", docType: "other", expiresOn: "", ownerOnly: "false" });
    expect(r.ok && r.value).toMatchObject({ expiresOn: null, ownerOnly: false });
  });
  it("rejects bad titles, types and dates", () => {
    expect(validateDocMeta({ title: "", docType: "deed" })).toEqual({ ok: false, error: "vault_err_title" });
    expect(validateDocMeta({ title: "x".repeat(121), docType: "deed" })).toEqual({ ok: false, error: "vault_err_title" });
    expect(validateDocMeta({ title: "x", docType: "passport" })).toEqual({ ok: false, error: "vault_err_doc_type" });
    expect(validateDocMeta({ title: "x", docType: "id", expiresOn: "2027-13-01" })).toEqual({ ok: false, error: "vault_err_expiry" });
    expect(validateDocMeta({ title: "x", docType: "id", expiresOn: 5 })).toEqual({ ok: false, error: "vault_err_expiry" });
  });
});

describe("expiry maths", () => {
  it("counts whole days and classifies the badge", () => {
    expect(daysUntil("2026-10-10", "2026-10-09")).toBe(1);
    expect(expiryStatus(null, "2026-10-09")).toEqual({ status: "none", days: null });
    expect(expiryStatus("2026-10-08", "2026-10-09").status).toBe("expired");
    expect(expiryStatus("2026-10-09", "2026-10-09").status).toBe("urgent");
    expect(expiryStatus("2026-10-16", "2026-10-09").status).toBe("urgent");
    expect(expiryStatus("2026-10-17", "2026-10-09").status).toBe("soon");
    expect(expiryStatus("2026-12-08", "2026-10-09").status).toBe("soon");
    expect(expiryStatus("2026-12-09", "2026-10-09").status).toBe("ok");
  });
});

describe("rows", () => {
  const base = { id: "i", asset_id: "a", title: "t", doc_type: "tax", mime_type: "image/png", size_bytes: "5", created_at: "x" };
  it("filters owner-only rows of other people and drops unusable rows", () => {
    const rows = [{ ...base, profile_id: "o", owner_only: true }, { ...base, profile_id: "o", owner_only: false }, { ...base, profile_id: "me", owner_only: true }];
    expect(visibleDocuments(rows, "me")).toHaveLength(2);
    expect(toVaultDocument({ ...base, doc_type: "x", profile_id: "me" }, "me")).toBeNull();
    expect(toVaultDocument({ ...base, profile_id: "me", storage_path: "secret" }, "me")).not.toHaveProperty("storage_path");
  });
  it("formatBytes and the missing-table check", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(isMissingVaultTable({ code: "42P01" })).toBe(true);
    expect(isMissingVaultTable({ message: 'relation "public.asset_documents" does not exist' })).toBe(true);
    expect(isMissingVaultTable({ message: "permission denied" })).toBe(false);
  });
});
