import { beforeEach, describe, expect, it, vi } from "vitest";

type Op = [string, unknown[]];
type Res = { data: unknown; error: unknown };

const U1 = "11111111-1111-4111-8111-111111111111"; // document owner
const U2 = "22222222-2222-4222-8222-222222222222"; // co-owner
const ASSET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  needsMfa: vi.fn(),
  handlers: {} as Record<string, (ops: Op[]) => Res>,
  calls: [] as { table: string; ops: Op[] }[],
  upload: vi.fn(),
  remove: vi.fn(),
  signed: vi.fn(),
}));

function builder(table: string) {
  const ops: Op[] = [];
  const b: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          m.calls.push({ table, ops });
          const h = m.handlers[table];
          const res: Res = h ? h(ops) : { data: [], error: null };
          return (ok: (v: Res) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(res).then(ok, bad);
        }
        return (...args: unknown[]) => {
          ops.push([prop, args]);
          return b;
        };
      },
    },
  );
  return b;
}

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: m.getUser },
    from: (t: string) => builder(t),
    storage: { from: () => ({ upload: m.upload, remove: m.remove }) },
  }),
}));
vi.mock("@/utils/supabase/service", () => ({
  createServiceClient: () => ({ storage: { from: () => ({ createSignedUrl: m.signed }) } }),
}));
vi.mock("@/utils/supabase/mfa", () => ({ needsMfaStepUp: m.needsMfa }));
vi.mock("@/utils/supabase/mock-auth", () => ({
  isMockAuthEnabled: () => false,
  getMockUserId: () => null,
  createMockAdminClient: () => {
    throw new Error("not used");
  },
}));

import { deleteDocument, getDocumentUrl, listDocuments, updateDocument, uploadDocument } from "@/app/dashboard/vault-actions";
import { DEMO_USER_ID } from "@/lib/demo-mode";

const has = (ops: Op[], name: string) => ops.some(([n]) => n === name);
const arg = (ops: Op[], name: string) => ops.find(([n]) => n === name)?.[1];
const ok = (data: unknown): Res => ({ data, error: null });

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);

function form(bytes: Uint8Array | string, name = "Deed 2026.pdf", extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("assetId", ASSET);
  fd.set("file", new File([bytes as BlobPart], name, { type: "application/pdf" }));
  fd.set("title", "Villa deed");
  fd.set("docType", "deed");
  fd.set("expiresOn", "2027-01-31");
  fd.set("ownerOnly", "false");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

const row = (over: Record<string, unknown> = {}) => ({
  id: DOC,
  asset_id: ASSET,
  profile_id: U1,
  title: "Villa deed",
  doc_type: "deed",
  mime_type: "application/pdf",
  size_bytes: 9,
  expires_on: null,
  owner_only: false,
  created_at: "2026-10-01T00:00:00Z",
  storage_path: `${U1}/${ASSET}/ffffffff-ffff-4fff-8fff-ffffffffffff-villa.pdf`,
  ...over,
});

/** Member of the asset (creator or co-owner). */
function asMember() {
  m.handlers.assets = () => ok([{ id: ASSET }]);
}

beforeEach(() => {
  m.calls.length = 0;
  m.handlers = {};
  for (const f of [m.getUser, m.needsMfa, m.upload, m.remove, m.signed]) f.mockReset();
  m.getUser.mockResolvedValue({ data: { user: { id: U1 } } });
  m.needsMfa.mockResolvedValue(false);
  m.upload.mockResolvedValue({ data: {}, error: null });
  m.remove.mockResolvedValue({ data: [], error: null });
  m.signed.mockResolvedValue({ data: { signedUrl: "https://x.test/signed" }, error: null });
  asMember();
  m.handlers.document_access_log = () => ok([]);
});

describe("uploadDocument", () => {
  it("stores the file under a server-built path with the DETECTED type and writes the row + log", async () => {
    m.handlers.asset_documents = (ops) => (has(ops, "insert") ? ok([{ id: DOC }]) : ok([]));
    const r = await uploadDocument(form(PDF, "../../etc/Deed 2026.pdf"));
    expect(r).toEqual({ ok: true, id: DOC });
    const [path, , opts] = m.upload.mock.calls[0] as [string, unknown, { contentType: string; upsert: boolean }];
    expect(path).toMatch(new RegExp(`^${U1}/${ASSET}/[0-9a-f-]{36}-Deed-2026\\.pdf$`));
    expect(opts).toMatchObject({ contentType: "application/pdf", upsert: false });
    const insert = arg(m.calls.find((c) => c.table === "asset_documents" && has(c.ops, "insert"))!.ops, "insert")![0] as Record<string, unknown>;
    expect(insert).toMatchObject({ profile_id: U1, asset_id: ASSET, mime_type: "application/pdf", size_bytes: PDF.length, owner_only: false });
    const log = m.calls.find((c) => c.table === "document_access_log")!;
    expect(arg(log.ops, "insert")![0]).toMatchObject({ action: "upload", actor_id: U1, owner_id: U1 });
  });

  it("rejects a spoofed type (html named .pdf with a pdf mime) before touching storage", async () => {
    const r = await uploadDocument(form("<html><script>alert(1)</script></html>", "x.pdf"));
    expect(r).toEqual({ ok: false, error: "vault_err_file_type" });
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("rejects files over 15 MB and empty files", async () => {
    const big = await uploadDocument(form(new Uint8Array(15 * 1024 * 1024 + 1)));
    expect(big).toEqual({ ok: false, error: "vault_err_file_size" });
    const empty = await uploadDocument(form(new Uint8Array(0)));
    expect(empty).toEqual({ ok: false, error: "vault_err_file_empty" });
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("refuses the demo account and an un-stepped-up session", async () => {
    m.getUser.mockResolvedValue({ data: { user: { id: DEMO_USER_ID } } });
    expect(await uploadDocument(form(PDF))).toEqual({ ok: false, error: "vault_err_demo" });
    m.getUser.mockResolvedValue({ data: { user: { id: U1 } } });
    m.needsMfa.mockResolvedValue(true);
    expect(await uploadDocument(form(PDF))).toEqual({ ok: false, error: "vault_err_mfa" });
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("is not found for an asset the caller is not a member of", async () => {
    m.handlers.assets = () => ok([]);
    m.handlers.asset_owners = () => ok([]);
    expect(await uploadDocument(form(PDF))).toEqual({ ok: false, error: "vault_err_not_found" });
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("validates the metadata and the asset id", async () => {
    expect(await uploadDocument(form(PDF, "a.pdf", { title: "  " }))).toEqual({ ok: false, error: "vault_err_title" });
    expect(await uploadDocument(form(PDF, "a.pdf", { docType: "passport" }))).toEqual({ ok: false, error: "vault_err_doc_type" });
    expect(await uploadDocument(form(PDF, "a.pdf", { expiresOn: "2027-02-30" }))).toEqual({ ok: false, error: "vault_err_expiry" });
    expect(await uploadDocument(form(PDF, "a.pdf", { assetId: "../x" }))).toEqual({ ok: false, error: "vault_err_bad_request" });
  });

  it("enforces the per-asset and per-user caps", async () => {
    m.handlers.asset_documents = () => ok(Array.from({ length: 50 }, () => ({ asset_id: ASSET, size_bytes: 1 })));
    expect(await uploadDocument(form(PDF))).toEqual({ ok: false, error: "vault_err_limit_asset" });
    m.handlers.asset_documents = () => ok(Array.from({ length: 500 }, (_, i) => ({ asset_id: `other-${i}`, size_bytes: 1 })));
    expect(await uploadDocument(form(PDF))).toEqual({ ok: false, error: "vault_err_limit_user" });
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("removes the stored object when the row insert fails", async () => {
    m.handlers.asset_documents = (ops) => (has(ops, "insert") ? { data: null, error: { code: "23505", message: "dup" } } : ok([]));
    expect(await uploadDocument(form(PDF))).toEqual({ ok: false, error: "vault_err_failed" });
    expect(m.remove).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable while the table is missing", async () => {
    m.handlers.asset_documents = () => ({ data: null, error: { code: "42P01", message: 'relation "asset_documents" does not exist' } });
    expect(await uploadDocument(form(PDF))).toEqual({ ok: false, error: "vault_err_unavailable" });
  });
});

describe("listDocuments", () => {
  it("hides other people's owner-only documents from a co-owner and never returns the storage path", async () => {
    m.getUser.mockResolvedValue({ data: { user: { id: U2 } } });
    m.handlers.asset_documents = () =>
      ok([row({ id: "1", owner_only: true }), row({ id: "2", owner_only: false }), row({ id: "3", owner_only: true, profile_id: U2 })]);
    const r = await listDocuments(ASSET);
    expect(r.ok && r.documents.map((d) => d.id)).toEqual(["2", "3"]);
    expect(JSON.stringify(r)).not.toContain("storage_path");
    expect(JSON.stringify(r)).not.toContain(U1);
    if (r.ok) expect(r.documents.map((d) => d.isMine)).toEqual([false, true]);
  });

  it("is not found for non-members and for malformed ids; unavailable-state when the table is missing", async () => {
    m.handlers.assets = () => ok([]);
    m.handlers.asset_owners = () => ok([]);
    expect(await listDocuments(ASSET)).toEqual({ ok: false, error: "vault_err_not_found" });
    expect(await listDocuments("nope")).toEqual({ ok: false, error: "vault_err_not_found" });
    asMember();
    m.handlers.asset_documents = () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table" } });
    expect(await listDocuments(ASSET)).toEqual({ ok: true, available: false, documents: [] });
  });

  it("requires MFA step-up", async () => {
    m.needsMfa.mockResolvedValue(true);
    expect(await listDocuments(ASSET)).toEqual({ ok: false, error: "vault_err_mfa" });
  });
});

describe("getDocumentUrl", () => {
  it("logs the access BEFORE issuing a 60 s signed URL", async () => {
    m.handlers.asset_documents = () => ok([row()]);
    const order: string[] = [];
    m.handlers.document_access_log = (ops) => {
      order.push(`log:${(arg(ops, "insert")![0] as { action: string }).action}`);
      return ok([]);
    };
    m.signed.mockImplementation(async () => {
      order.push("sign");
      return { data: { signedUrl: "https://x.test/s" }, error: null };
    });
    const r = await getDocumentUrl(DOC, "view");
    expect(r).toEqual({ ok: true, url: "https://x.test/s" });
    expect(order).toEqual(["log:view", "sign"]);
    expect(m.signed.mock.calls[0][1]).toBe(60);
    expect(m.signed.mock.calls[0][2]).toBeUndefined();
  });

  it("download mode asks for an attachment with a sanitised name", async () => {
    m.handlers.asset_documents = () => ok([row({ title: "../Villa <deed>" })]);
    await getDocumentUrl(DOC, "download");
    expect(m.signed.mock.calls[0][2]).toEqual({ download: "Villa-deed.pdf" });
  });

  it("gives a co-owner nothing for an owner-only document: same answer as a missing one, no log, no link", async () => {
    m.getUser.mockResolvedValue({ data: { user: { id: U2 } } });
    m.handlers.asset_documents = () => ok([row({ owner_only: true })]);
    expect(await getDocumentUrl(DOC, "view")).toEqual({ ok: false, error: "vault_err_not_found" });
    m.handlers.asset_documents = () => ok([]);
    expect(await getDocumentUrl(DOC, "view")).toEqual({ ok: false, error: "vault_err_not_found" });
    expect(m.signed).not.toHaveBeenCalled();
    expect(m.calls.some((c) => c.table === "document_access_log")).toBe(false);
  });

  it("lets a co-owner open a shared document", async () => {
    m.getUser.mockResolvedValue({ data: { user: { id: U2 } } });
    m.handlers.asset_documents = () => ok([row()]);
    expect((await getDocumentUrl(DOC, "view")).ok).toBe(true);
  });

  it("fails closed when the log cannot be written", async () => {
    m.handlers.asset_documents = () => ok([row()]);
    m.handlers.document_access_log = () => ({ data: null, error: { message: "boom" } });
    expect(await getDocumentUrl(DOC, "view")).toEqual({ ok: false, error: "vault_err_failed" });
    expect(m.signed).not.toHaveBeenCalled();
  });

  it("refuses a stored path that is not inside the owner's folder, and bad ids / modes", async () => {
    m.handlers.asset_documents = () => ok([row({ storage_path: `${U2}/${ASSET}/x.pdf` })]);
    expect(await getDocumentUrl(DOC, "view")).toEqual({ ok: false, error: "vault_err_not_found" });
    expect(await getDocumentUrl("../x", "view")).toEqual({ ok: false, error: "vault_err_not_found" });
    expect(await getDocumentUrl(DOC, "edit" as "view")).toEqual({ ok: false, error: "vault_err_not_found" });
    expect(m.signed).not.toHaveBeenCalled();
  });

  it("requires MFA step-up", async () => {
    m.needsMfa.mockResolvedValue(true);
    expect(await getDocumentUrl(DOC, "view")).toEqual({ ok: false, error: "vault_err_mfa" });
  });
});

describe("updateDocument", () => {
  it("updates only the editable fields, scoped to the owner", async () => {
    m.handlers.asset_documents = () => ok([{ id: DOC }]);
    const r = await updateDocument(DOC, { title: " New ", docType: "tax", expiresOn: "", ownerOnly: true });
    expect(r).toEqual({ ok: true });
    const c = m.calls.find((x) => has(x.ops, "update"))!;
    expect(arg(c.ops, "update")![0]).toEqual({ title: "New", doc_type: "tax", expires_on: null, owner_only: true });
    expect(c.ops.filter(([n]) => n === "eq").map(([, a]) => a)).toEqual([["id", DOC], ["profile_id", U1]]);
  });

  it("is not found when nothing matches (someone else's document), refuses the demo user", async () => {
    m.handlers.asset_documents = () => ok([]);
    expect(await updateDocument(DOC, { title: "x", docType: "tax" })).toEqual({ ok: false, error: "vault_err_not_found" });
    m.getUser.mockResolvedValue({ data: { user: { id: DEMO_USER_ID } } });
    expect(await updateDocument(DOC, { title: "x", docType: "tax" })).toEqual({ ok: false, error: "vault_err_demo" });
  });
});

describe("deleteDocument", () => {
  it("logs, removes the object, then the row", async () => {
    const order: string[] = [];
    m.handlers.asset_documents = (ops) => {
      if (has(ops, "delete")) {
        order.push("row");
        return ok([{ id: DOC }]);
      }
      return ok([row()]);
    };
    m.handlers.document_access_log = (ops) => {
      order.push(`log:${(arg(ops, "insert")![0] as { action: string }).action}`);
      return ok([]);
    };
    m.remove.mockImplementation(async () => {
      order.push("object");
      return { data: [], error: null };
    });
    expect(await deleteDocument(DOC)).toEqual({ ok: true });
    expect(order).toEqual(["log:delete", "object", "row"]);
  });

  it("a co-owner cannot delete someone else's shared document", async () => {
    m.getUser.mockResolvedValue({ data: { user: { id: U2 } } });
    m.handlers.asset_documents = () => ok([row()]);
    expect(await deleteDocument(DOC)).toEqual({ ok: false, error: "vault_err_not_found" });
    expect(m.remove).not.toHaveBeenCalled();
  });

  it("keeps the row when the object cannot be removed (retry-safe)", async () => {
    m.handlers.asset_documents = () => ok([row()]);
    m.remove.mockResolvedValue({ data: null, error: { message: "nope" } });
    expect(await deleteDocument(DOC)).toEqual({ ok: false, error: "vault_err_failed" });
    expect(m.calls.some((c) => c.table === "asset_documents" && has(c.ops, "delete"))).toBe(false);
  });
});
