/**
 * Co-owner APPROVAL flow, logic level.
 *
 * HONEST LIMIT: this is a MOCKED-AUTH, IN-MEMORY SIMULATION of two users. It is not
 * a run with two real Supabase Auth accounts against a real database. The real code
 * under test is `lib/shared-assets/server.ts` (+ notify.ts, ownership.ts, load.ts)
 * and the `respondToChangeRequest` server action; only I/O boundaries are faked:
 *   - the service-role Supabase client  -> `FakeDb` (src/test/fake-supabase.ts), no RLS,
 *     no constraints, no triggers, no real `auth.users` (emulated by a list);
 *   - the session client (`@/utils/supabase/server`) -> returns whichever user the test
 *     "signs in" as;
 *   - `sendEmail` (Resend) -> a spy, nothing is ever sent;
 *   - `syncAssetHistory` -> a spy (it only writes asset_history).
 * What this cannot prove: RLS policies, DB constraints, the profile trigger that links
 * invitations, Supabase Auth sessions, real e-mail delivery, the Vercel cron wiring.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "@/test/fake-supabase";

const h = vi.hoisted(() => ({
  db: null as unknown as { client(): unknown },
  sessionUser: null as { id: string } | null,
  sendEmail: vi.fn(async (m: { to: string; subject: string; html: string; text?: string }) => (m ? { sent: true as const } : { sent: true as const })),
  syncAssetHistory: vi.fn(async (...args: unknown[]) => void args.length),
}));

vi.mock("@/utils/supabase/service", () => ({ createServiceClient: () => h.db.client() }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.sessionUser } }) } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: h.sendEmail }));
vi.mock("@/lib/asset-history-sync", () => ({ syncAssetHistory: h.syncAssetHistory }));

import { respondToChangeRequest } from "@/app/dashboard/ownership-actions";
import {
  applyChangeRequest,
  expirePendingRequests,
  loadPendingApprovals,
  respondToApproval,
  routeAssetEdit,
  type AssetFields,
} from "@/lib/shared-assets/server";
import { resetNotificationWarning } from "@/lib/shared-assets/notifications-server";
import { applyOwnershipFactors, loadOwnershipFactors } from "@/lib/shared-assets/load";

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const C = "cccccccc-0000-4000-8000-00000000000c"; // not an owner
const ASSET = "55555555-0000-4000-8000-000000000001";
const CAT = "44444444-0000-4000-8000-000000000001";
const EMAIL = { A: "alice@example.com", B: "bob@example.com" };

let db: FakeDb;

function seedShared(opts: { bJoined?: boolean } = {}) {
  db = new FakeDb();
  h.db = db;
  const joined = "2026-01-01T00:00:00Z";
  db.users = [
    { id: A, email: EMAIL.A, email_confirmed_at: joined },
    { id: B, email: EMAIL.B, email_confirmed_at: opts.bJoined === false ? null : joined },
    { id: C, email: "carol@example.com", email_confirmed_at: joined },
  ];
  db.seed("profiles", [
    { id: A, first_name: "Alice", last_name: "Adams" },
    { id: B, first_name: "Bob", last_name: "Brown" },
    { id: C, first_name: "Carol", last_name: "Clark" },
  ]);
  db.seed("asset_categories", [{ id: CAT, name: "Real Estate" }]);
  db.seed("assets", [
    {
      id: ASSET,
      profile_id: A,
      name: "Marina flat",
      category_id: CAT,
      quantity: 1,
      current_value: 1_000_000,
      currency: "USD",
      metadata: { market_valuation: 1_000_000 },
      images: [],
      ticker_symbol: null,
      purchase_date: "2024-01-01",
      status: "active",
    },
  ]);
  db.seed("asset_owners", [
    { asset_id: ASSET, profile_id: A, name: "Alice Adams", email: EMAIL.A, ownership_percentage: 50, is_creator: true },
    { asset_id: ASSET, profile_id: B, name: "Bob Brown", email: EMAIL.B, ownership_percentage: 50, is_creator: false },
  ]);
}

/** The whole-asset values being proposed (raw, as typed in the edit form). */
const fields = (over: Partial<AssetFields> = {}): AssetFields => ({
  name: "Marina flat",
  category_id: CAT,
  quantity: 1,
  current_value: 1_200_000,
  currency: "USD",
  metadata: { market_valuation: 1_200_000 },
  images: [],
  ticker_symbol: null,
  purchase_date: "2024-01-01",
  ...over,
});

const asset = () => db.table("assets").find((r) => r.id === ASSET)!;
const requests = () => db.table("asset_change_requests");
const approvals = () => db.table("change_approvals");
const notifs = () => db.table("notifications");

async function propose(userId: string, over: Partial<AssetFields> = {}, notify?: boolean) {
  const res = await routeAssetEdit({ userId, assetId: ASSET, fields: fields(over), owners: null, notify });
  if (res.mode !== "pending") throw new Error(`expected pending, got ${JSON.stringify(res)}`);
  return res.requestId;
}

beforeEach(() => {
  h.sendEmail.mockClear();
  h.syncAssetHistory.mockClear();
  h.sessionUser = null;
  delete process.env.DEMO_USER_ID;
  seedShared();
});

describe("A proposes an edit to a co-owned asset", () => {
  it("stages a pending request, does not apply it, and e-mails B", async () => {
    const id = await propose(A);

    expect(requests()).toHaveLength(1);
    expect(requests()[0]).toMatchObject({ id, asset_id: ASSET, requested_by: A, status: "pending" });
    expect(approvals()).toHaveLength(1);
    expect(approvals()[0]).toMatchObject({ change_request_id: id, profile_id: B, status: "pending" });

    // Not applied yet.
    expect(asset().current_value).toBe(1_000_000);
    expect(h.syncAssetHistory).not.toHaveBeenCalled();

    // B (and only B) was e-mailed, naming the requester and the asset.
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const mail = h.sendEmail.mock.calls[0][0];
    expect(mail.to).toBe(EMAIL.B);
    expect(mail.subject).toBe("Alice Adams proposed a change to Marina flat");
    expect(mail.text).toContain(`/dashboard/assets/${ASSET}`);
    expect(approvals()[0]).toMatchObject({ notify_status: "sent" });
  });

  it("does not e-mail when the requester opted out (notify=false), but still stages it", async () => {
    await propose(A, {}, false);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(approvals()[0]).toMatchObject({ status: "pending", notify_status: "not_sent" });
  });

  it("records a failed notification instead of throwing when the mailer fails", async () => {
    h.sendEmail.mockResolvedValueOnce({ sent: false as never, reason: "boom" } as never);
    await propose(A);
    expect(approvals()[0]).toMatchObject({ notify_status: "failed", notify_error: "boom" });
  });

  it("allows only one pending request per asset", async () => {
    await propose(A);
    const second = await routeAssetEdit({ userId: A, assetId: ASSET, fields: fields({ name: "Other" }), owners: null });
    expect(second).toEqual({ mode: "error", error: "change_pending_exists" });
    expect(requests()).toHaveLength(1);
  });

  it("shows B the pending request in the notification list, and A nothing", async () => {
    const id = await propose(A);
    const forB = await loadPendingApprovals(B);
    expect(forB).toHaveLength(1);
    expect(forB[0]).toMatchObject({ requestId: id, assetId: ASSET, assetName: "Marina flat", requesterName: "Alice Adams" });
    // Whole-asset values, not shares.
    expect(forB[0].changes).toContainEqual({ key: "current_value", before: "1000000 USD", after: "1200000 USD" });
    expect(await loadPendingApprovals(A)).toEqual([]);
  });
});

describe("B approves", () => {
  it("applies the change exactly once, with RAW whole-asset values", async () => {
    const id = await propose(A);

    const res = await respondToApproval({ userId: B, requestId: id, approve: true });
    expect(res).toEqual({ ok: true, outcome: "approved" });

    // Written values are the proposed whole-asset ones, never B's or A's 50% share.
    expect(asset().current_value).toBe(1_200_000);
    expect(asset().metadata).toEqual({ market_valuation: 1_200_000 });
    expect(h.syncAssetHistory).toHaveBeenCalledTimes(1);
    expect(h.syncAssetHistory.mock.calls[0][2]).toBe(1_200_000);
    expect(requests()[0]).toMatchObject({ status: "approved", auto_approved: false });
    expect(requests()[0].resolved_at).toBeTruthy();

    // Reads still scale for display: each owner's view is half of the stored value.
    const supa = db.client() as never;
    const row = { id: ASSET, profile_id: A, quantity: 1, current_value: 1_200_000, metadata: null, asset_categories: { name: "Other" } };
    for (const uid of [A, B]) {
      const factors = await loadOwnershipFactors(supa, uid, [row]);
      expect(applyOwnershipFactors([row], factors)[0].current_value).toBe(600_000);
    }
    expect(asset().current_value).toBe(1_200_000); // reads did not write back

    // A second approve (double click / replay) is refused and does not apply again.
    const again = await respondToApproval({ userId: B, requestId: id, approve: true });
    expect(again.ok).toBe(false);
    expect(h.syncAssetHistory).toHaveBeenCalledTimes(1);
    expect(await loadPendingApprovals(B)).toEqual([]);
  });

  it("works through the server action using the SESSION user, not an argument", async () => {
    const id = await propose(A);
    h.sessionUser = { id: B };
    expect(await respondToChangeRequest(id, true)).toEqual({ ok: true, outcome: "approved" });
    expect(asset().current_value).toBe(1_200_000);
  });

  it("the action refuses when nobody is signed in", async () => {
    const id = await propose(A);
    h.sessionUser = null;
    expect(await respondToChangeRequest(id, true)).toEqual({ ok: false, error: "You must be signed in." });
    expect(asset().current_value).toBe(1_000_000);
  });

  // The requester is told the outcome with an in-app notification (migration 0034, see the
  // "requester notifications" block below), not by e-mail.
  it("notifies the requester (A) in-app once B has approved", async () => {
    const id = await propose(A);
    await respondToApproval({ userId: B, requestId: id, approve: true });
    expect(notifs().map((n) => n.profile_id)).toEqual([A]);
  });
});

describe("B rejects", () => {
  it("rejects the request and does not apply it", async () => {
    const id = await propose(A);
    const res = await respondToApproval({ userId: B, requestId: id, approve: false });
    expect(res).toEqual({ ok: true, outcome: "rejected" });
    expect(asset().current_value).toBe(1_000_000);
    expect(h.syncAssetHistory).not.toHaveBeenCalled();
    expect(requests()[0]).toMatchObject({ status: "rejected" });
    expect(approvals()[0]).toMatchObject({ status: "rejected" });
    expect(await loadPendingApprovals(B)).toEqual([]);
  });

  it("a rejected request cannot later be approved or auto-applied, and a new one can be proposed", async () => {
    const id = await propose(A);
    await respondToApproval({ userId: B, requestId: id, approve: false });
    expect((await respondToApproval({ userId: B, requestId: id, approve: true })).ok).toBe(false);
    requests()[0].expires_at = "2000-01-01T00:00:00Z";
    expect(await expirePendingRequests()).toEqual({ applied: 0, failed: [] });
    expect(asset().current_value).toBe(1_000_000);
    await expect(propose(A, { name: "Retry" })).resolves.toBeTruthy();
  });
});

describe("requester notifications (in-app, migration 0034)", () => {
  it("approve: exactly one change_approved row for the REQUESTER, responder and asset in data, none for the responder", async () => {
    const id = await propose(A);
    expect(notifs()).toHaveLength(0); // proposing notifies nobody in-app
    await respondToApproval({ userId: B, requestId: id, approve: true });
    expect(notifs()).toHaveLength(1);
    expect(notifs()[0]).toMatchObject({
      profile_id: A,
      kind: "change_approved",
      asset_id: ASSET,
      request_id: id,
      read_at: null,
      data: { assetName: "Marina flat", responderName: "Bob Brown", responderId: B },
    });
    expect(notifs().some((n) => n.profile_id === B)).toBe(false);
  });

  it("reject: exactly one change_rejected row for the requester, none for the responder", async () => {
    const id = await propose(A);
    await respondToApproval({ userId: B, requestId: id, approve: false });
    expect(notifs()).toHaveLength(1);
    expect(notifs()[0]).toMatchObject({
      profile_id: A,
      kind: "change_rejected",
      asset_id: ASSET,
      request_id: id,
      data: { assetName: "Marina flat", responderName: "Bob Brown", responderId: B },
    });
  });

  it("works through the server action too (session user = responder)", async () => {
    const id = await propose(A);
    h.sessionUser = { id: B };
    await respondToChangeRequest(id, false);
    expect(notifs().map((n) => [n.profile_id, n.kind])).toEqual([[A, "change_rejected"]]);
  });

  it("with three owners: nothing while waiting, one change_approved after the LAST approval", async () => {
    db.table("asset_owners").length = 0;
    db.seed("asset_owners", [
      { asset_id: ASSET, profile_id: A, name: "Alice Adams", email: EMAIL.A, ownership_percentage: 50, is_creator: true },
      { asset_id: ASSET, profile_id: B, name: "Bob Brown", email: EMAIL.B, ownership_percentage: 25, is_creator: false },
      { asset_id: ASSET, profile_id: C, name: "Carol Clark", email: "carol@example.com", ownership_percentage: 25, is_creator: false },
    ]);
    const id = await propose(A);
    await respondToApproval({ userId: B, requestId: id, approve: true });
    expect(notifs()).toHaveLength(0);
    await respondToApproval({ userId: C, requestId: id, approve: true });
    expect(notifs()).toHaveLength(1);
    expect(notifs()[0]).toMatchObject({ profile_id: A, kind: "change_approved", data: { responderName: "Carol Clark" } });
  });

  it("a refused or replayed answer creates no extra notification", async () => {
    const id = await propose(A);
    await respondToApproval({ userId: A, requestId: id, approve: true }); // the requester cannot answer
    await respondToApproval({ userId: C, requestId: id, approve: false }); // a non-owner cannot
    expect(notifs()).toHaveLength(0);
    await respondToApproval({ userId: B, requestId: id, approve: true });
    await respondToApproval({ userId: B, requestId: id, approve: true }); // replay
    expect(notifs()).toHaveLength(1);
  });

  it("never notifies when the recipient is the actor", async () => {
    const id = await propose(A);
    requests()[0].requested_by = B; // degenerate: the requester is also the one who decides
    await respondToApproval({ userId: B, requestId: id, approve: true });
    expect(notifs()).toHaveLength(0);
  });

  it("expiry auto-apply: exactly one change_auto_applied row for the requester, no responder", async () => {
    const id = await propose(A);
    requests()[0].expires_at = new Date(Date.now() - 60_000).toISOString();
    await expirePendingRequests();
    expect(notifs()).toHaveLength(1);
    expect(notifs()[0]).toMatchObject({ profile_id: A, kind: "change_auto_applied", asset_id: ASSET, request_id: id, data: { assetName: "Marina flat" } });
    expect(notifs()[0].data).not.toHaveProperty("responderName");
    await expirePendingRequests(); // idempotent: nothing more
    expect(notifs()).toHaveLength(1);
  });

  it("a rejected request is never auto-applied, so no auto_applied notification", async () => {
    const id = await propose(A);
    await respondToApproval({ userId: B, requestId: id, approve: false });
    requests()[0].expires_at = "2000-01-01T00:00:00Z";
    await expirePendingRequests();
    expect(notifs().map((n) => n.kind)).toEqual(["change_rejected"]);
  });

  describe("best effort: approvals keep working without notifications", () => {
    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("table missing (migration not applied): approve, reject and expiry still succeed", async () => {
      db.missingTables.add("notifications");
      const approve = await propose(A);
      expect(await respondToApproval({ userId: B, requestId: approve, approve: true })).toEqual({ ok: true, outcome: "approved" });
      expect(asset().current_value).toBe(1_200_000);

      const reject = await propose(A, { name: "Retry" });
      expect(await respondToApproval({ userId: B, requestId: reject, approve: false })).toEqual({ ok: true, outcome: "rejected" });

      await propose(A, { name: "Again" });
      requests()[requests().length - 1].expires_at = new Date(Date.now() - 1000).toISOString();
      expect(await expirePendingRequests()).toEqual({ applied: 1, failed: [] });
      expect(notifs()).toHaveLength(0);
    });

    it("the insert THROWS: the approval is still applied and the call still resolves", async () => {
      db.throwingTables.add("notifications");
      const id = await propose(A);
      await expect(respondToApproval({ userId: B, requestId: id, approve: true })).resolves.toEqual({ ok: true, outcome: "approved" });
      expect(asset().current_value).toBe(1_200_000);
      expect(requests()[0]).toMatchObject({ status: "approved" });
    });

    it("logs the missing table at most once", async () => {
      resetNotificationWarning();
      db.missingTables.add("notifications");
      const warn = vi.spyOn(console, "warn");
      for (const approve of [true, false]) {
        const id = await propose(A, { name: approve ? "One" : "Two" });
        await respondToApproval({ userId: B, requestId: id, approve });
      }
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain("0034");
    });
  });
});

describe("who may approve", () => {
  it("the requester (A) cannot approve their own request", async () => {
    const id = await propose(A);
    const res = await respondToApproval({ userId: A, requestId: id, approve: true });
    expect(res).toEqual({ ok: false, error: "No pending approval for you on this request." });
    expect(asset().current_value).toBe(1_000_000);
    expect(requests()[0].status).toBe("pending");
    // ...nor reject it
    expect((await respondToApproval({ userId: A, requestId: id, approve: false })).ok).toBe(false);
    expect(requests()[0].status).toBe("pending");
  });

  it("a user who is not an owner cannot approve, reject or even propose", async () => {
    const id = await propose(A);
    expect((await respondToApproval({ userId: C, requestId: id, approve: true })).ok).toBe(false);
    expect((await respondToApproval({ userId: C, requestId: id, approve: false })).ok).toBe(false);
    expect(asset().current_value).toBe(1_000_000);
    expect(requests()[0].status).toBe("pending");
    expect(await loadPendingApprovals(C)).toEqual([]);

    const own = await routeAssetEdit({ userId: C, assetId: ASSET, fields: fields(), owners: null });
    expect(own).toEqual({ mode: "error", error: "Asset not found." });
  });

  it("unknown request id is refused", async () => {
    const res = await respondToApproval({ userId: B, requestId: "nope", approve: true });
    expect(res.ok).toBe(false);
  });

  it("a co-owner's edit needs the creator's approval (A is the approver when B proposes)", async () => {
    const id = await propose(B, { current_value: 900_000 });
    expect(approvals()[0]).toMatchObject({ profile_id: A, status: "pending" });
    expect(h.sendEmail.mock.calls[0][0].to).toBe(EMAIL.A);
    expect(asset().current_value).toBe(1_000_000);
    expect((await respondToApproval({ userId: B, requestId: id, approve: true })).ok).toBe(false);
    expect(await respondToApproval({ userId: A, requestId: id, approve: true })).toEqual({ ok: true, outcome: "approved" });
    expect(asset().current_value).toBe(900_000);
  });

  it("with three owners, the change applies only after the LAST approval; any rejection wins", async () => {
    db.table("asset_owners").length = 0;
    db.seed("asset_owners", [
      { asset_id: ASSET, profile_id: A, name: "Alice Adams", email: EMAIL.A, ownership_percentage: 50, is_creator: true },
      { asset_id: ASSET, profile_id: B, name: "Bob Brown", email: EMAIL.B, ownership_percentage: 25, is_creator: false },
      { asset_id: ASSET, profile_id: C, name: "Carol Clark", email: "carol@example.com", ownership_percentage: 25, is_creator: false },
    ]);
    const id = await propose(A);
    expect(approvals().map((a) => a.profile_id).sort()).toEqual([B, C].sort());
    expect(await respondToApproval({ userId: B, requestId: id, approve: true })).toEqual({ ok: true, outcome: "waiting" });
    expect(asset().current_value).toBe(1_000_000);
    expect(await respondToApproval({ userId: C, requestId: id, approve: true })).toEqual({ ok: true, outcome: "approved" });
    expect(asset().current_value).toBe(1_200_000);
    expect(h.syncAssetHistory).toHaveBeenCalledTimes(1);
  });
});

describe("single-owner / unjoined co-owner", () => {
  it("an asset with no owner rows is edited directly by its creator", async () => {
    db.table("asset_owners").length = 0;
    const res = await routeAssetEdit({ userId: A, assetId: ASSET, fields: fields(), owners: null });
    expect(res).toEqual({ mode: "direct" });
    expect(requests()).toHaveLength(0);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("a co-owner who has not accepted their invitation never blocks the creator", async () => {
    seedShared({ bJoined: false });
    const res = await routeAssetEdit({ userId: A, assetId: ASSET, fields: fields(), owners: null });
    expect(res).toEqual({ mode: "direct" });
    expect(requests()).toHaveLength(0);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
});

describe("stale and expired requests", () => {
  it("the daily job applies an expired request, flagged auto-approved, exactly once", async () => {
    await propose(A);
    requests()[0].expires_at = new Date(Date.now() - 60_000).toISOString();

    expect(await expirePendingRequests()).toEqual({ applied: 1, failed: [] });
    expect(asset().current_value).toBe(1_200_000);
    expect(requests()[0]).toMatchObject({ status: "approved", auto_approved: true });
    expect(h.syncAssetHistory).toHaveBeenCalledTimes(1);

    // Idempotent: a second run (or a late manual approve) does nothing more.
    expect(await expirePendingRequests()).toEqual({ applied: 0, failed: [] });
    expect((await respondToApproval({ userId: B, requestId: requests()[0].id as string, approve: true })).ok).toBe(false);
    expect(h.syncAssetHistory).toHaveBeenCalledTimes(1);
    expect(await loadPendingApprovals(B)).toEqual([]);
  });

  it("the daily job leaves a request alone until it expires", async () => {
    await propose(A);
    expect(await expirePendingRequests()).toEqual({ applied: 0, failed: [] });
    expect(asset().current_value).toBe(1_000_000);
    expect(requests()[0].status).toBe("pending");
  });

  it("the default expiry is about 7 days out", async () => {
    await propose(A);
    const days = (Date.parse(requests()[0].expires_at as string) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("applyChangeRequest on a request whose asset was deleted fails cleanly", async () => {
    const id = await propose(A);
    db.tables.assets = [];
    expect(await applyChangeRequest(id, { auto: true })).toEqual({ ok: false, error: "Asset no longer exists." });
  });

  it("a pending request waiting on someone no longer a co-owner is purged and does not block a new edit", async () => {
    await propose(A);
    // B is removed from the asset (e.g. ownership replaced): only A remains as an owner row besides a new person.
    db.tables.asset_owners = db.table("asset_owners").filter((r) => r.profile_id !== B);
    db.seed("asset_owners", [
      { asset_id: ASSET, profile_id: C, name: "Carol Clark", email: "carol@example.com", ownership_percentage: 50, is_creator: false },
    ]);
    const res = await routeAssetEdit({ userId: A, assetId: ASSET, fields: fields({ name: "New" }), owners: null });
    expect(res.mode).toBe("pending");
    expect(requests()).toHaveLength(1);
    expect(approvals().map((a) => a.profile_id)).toEqual([C]);
  });
});
