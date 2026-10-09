import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { dueThreshold, planReminders, reminderKey, type ExpiryDoc } from "@/lib/vault-expiry";
import { runDocumentExpiry } from "@/lib/vault-expiry-server";
import { notificationMessageKey, notificationDocParams, toNotificationItem } from "@/lib/notifications";

const TODAY = "2026-10-09";
const doc = (id: string, expires_on: string, over: Partial<ExpiryDoc> = {}): ExpiryDoc => ({
  id,
  profile_id: "owner-1",
  asset_id: "asset-1",
  title: "Deed",
  expires_on,
  ...over,
});

describe("dueThreshold", () => {
  it("maps days-left to the current band", () => {
    expect(dueThreshold("2026-10-08", TODAY)).toBe("expired");
    expect(dueThreshold("2026-10-09", TODAY)).toBe("7");
    expect(dueThreshold("2026-10-16", TODAY)).toBe("7");
    expect(dueThreshold("2026-10-17", TODAY)).toBe("30");
    expect(dueThreshold("2026-11-08", TODAY)).toBe("30");
    expect(dueThreshold("2026-11-09", TODAY)).toBe("60");
    expect(dueThreshold("2026-12-08", TODAY)).toBe("60");
    expect(dueThreshold("2026-12-09", TODAY)).toBeNull();
  });
});

describe("planReminders", () => {
  it("sends only the current band and skips what was already sent", () => {
    const docs = [doc("a", "2026-10-12"), doc("b", "2026-11-20"), doc("c", "2027-06-01"), doc("d", "2026-09-01")];
    const sent = new Set([reminderKey("b", "60", "2026-11-20")]);
    const plan = planReminders(docs, sent, TODAY);
    expect(plan.map((p) => [p.doc.id, p.threshold])).toEqual([["a", "7"], ["d", "expired"]]);
    expect(planReminders(docs, new Set([...sent, reminderKey("a", "7", "2026-10-12"), reminderKey("d", "expired", "2026-09-01")]), TODAY)).toEqual([]);
  });
  it("a renewed (re-dated) document is reminded again", () => {
    const sent = new Set([reminderKey("a", "7", "2026-10-12")]);
    expect(planReminders([doc("a", "2026-10-14")], sent, TODAY)).toHaveLength(1);
  });
});

/** Fake service client: documents table, notifications table (records inserts), assets table. */
function fakeService(opts: { docs: ExpiryDoc[]; existing?: Record<string, unknown>[]; docsError?: unknown }) {
  const inserted: Record<string, unknown>[] = [];
  const from = (table: string) => {
    const state: { insert?: Record<string, unknown> } = {};
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of ["select", "not", "lte", "order", "limit", "eq", "in"]) b[m] = chain;
    b.insert = (row: Record<string, unknown>) => {
      state.insert = row;
      inserted.push(row);
      return b;
    };
    b.then = (ok: (v: unknown) => unknown) => {
      let res: { data: unknown; error: unknown } = { data: [], error: null };
      if (table === "asset_documents") res = { data: opts.docs, error: opts.docsError ?? null };
      if (table === "notifications" && !state.insert) res = { data: (opts.existing ?? []).map((data) => ({ data })), error: null };
      if (table === "assets") res = { data: [{ id: "asset-1", name: "Villa Test" }], error: null };
      return Promise.resolve(res).then(ok);
    };
    return b;
  };
  return { service: { from } as never, inserted };
}

describe("runDocumentExpiry", () => {
  const now = new Date("2026-10-09T05:00:00Z");
  beforeEach(() => void vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("inserts one notification per due document, with the dedupe keys, and returns counts only", async () => {
    const { service, inserted } = fakeService({ docs: [doc("a", "2026-10-12"), doc("b", "2027-01-01")] });
    const r = await runDocumentExpiry(now, service);
    expect(r).toEqual({ available: true, scanned: 2, due: 1, sent: 1, skipped: 1, failed: 0 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      profile_id: "owner-1",
      kind: "document_expiry",
      asset_id: "asset-1",
      data: { threshold: "7", document_id: "a", expires_on: "2026-10-12", assetName: "Villa Test", documentTitle: "Deed" },
    });
    expect(JSON.stringify(r)).not.toMatch(/owner-1|Deed/);
  });

  it("is idempotent: a second run with the stored reminders inserts nothing", async () => {
    const first = fakeService({ docs: [doc("a", "2026-10-12"), doc("d", "2026-09-01")] });
    await runDocumentExpiry(now, first.service);
    const existing = first.inserted.map((r) => r.data as Record<string, unknown>);
    const second = fakeService({ docs: [doc("a", "2026-10-12"), doc("d", "2026-09-01")], existing });
    const r = await runDocumentExpiry(now, second.service);
    expect(second.inserted).toHaveLength(0);
    expect(r).toMatchObject({ due: 0, sent: 0, failed: 0 });
  });

  it("reports not available while the table is missing", async () => {
    const { service } = fakeService({ docs: [], docsError: { code: "42P01", message: "x" } });
    expect(await runDocumentExpiry(now, service)).toMatchObject({ available: false, failed: 0 });
  });
});

describe("document_expiry notifications", () => {
  it("picks the expired or expiring message and carries the threshold", () => {
    expect(String(notificationMessageKey("document_expiry", { threshold: "30" }))).toBe("vault_notif_expiry");
    expect(String(notificationMessageKey("document_expiry", { threshold: "expired" }))).toBe("vault_notif_expired");
    const item = toNotificationItem({ id: "n", kind: "document_expiry", created_at: "2026-10-09T00:00:00Z", data: { documentTitle: "Deed", threshold: "7", assetName: "Villa" } });
    expect(item?.data).toMatchObject({ documentTitle: "Deed", threshold: "7", assetName: "Villa" });
    expect(notificationDocParams(item!.data, "a document")).toEqual({ doc: "Deed", days: "7" });
    expect(toNotificationItem({ id: "n", kind: "document_expiry", created_at: "x", data: { threshold: "99" } })?.data.threshold).toBeUndefined();
  });
});
