/**
 * Notifications: load / mark-read ownership, best-effort behaviour, and the two server actions.
 * Same honest limit as approval-flow.test.ts: an in-memory FakeDb (no RLS), so "cannot touch
 * another user's rows" proves the APP-LEVEL profile_id scoping, not the RLS policies of
 * migration 0034 (those are only written, not applied or run).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "@/test/fake-supabase";

const h = vi.hoisted(() => ({
  db: null as unknown as { client(): unknown },
  sessionUser: null as { id: string } | null,
}));

vi.mock("@/utils/supabase/service", () => ({ createServiceClient: () => h.db.client() }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.sessionUser } }) } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));
vi.mock("@/lib/asset-history-sync", () => ({ syncAssetHistory: vi.fn() }));

import { markAllNotificationsRead, markNotificationRead } from "@/app/dashboard/ownership-actions";
import {
  createNotification,
  isMissingTable,
  loadNotifications,
  resetNotificationWarning,
} from "@/lib/shared-assets/notifications-server";

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";

let db: FakeDb;
const rows = () => db.table("notifications");

function seed(profile: string, n: number, over: Record<string, unknown> = {}) {
  for (let i = 0; i < n; i++) {
    db.seed("notifications", [
      {
        profile_id: profile,
        kind: "change_approved",
        asset_id: null,
        data: { assetName: "Flat", responderName: "Bob" },
        created_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
        ...over,
      },
    ]);
  }
}

beforeEach(() => {
  db = new FakeDb();
  h.db = db;
  h.sessionUser = null;
  delete process.env.DEMO_USER_ID;
  resetNotificationWarning();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("loadNotifications", () => {
  it("returns only the user's own rows, newest first, capped at 10", async () => {
    seed(A, 12);
    seed(B, 3);
    const list = await loadNotifications(A);
    expect(list).toHaveLength(10);
    expect(list[0].createdAt > list[9].createdAt).toBe(true);
    expect(await loadNotifications(B)).toHaveLength(3);
    expect(await loadNotifications("nobody")).toEqual([]);
  });

  it("maps a row to a typed item and drops unusable rows", async () => {
    seed(A, 1, { asset_id: "asset-1", request_id: "req-1" });
    db.seed("notifications", [{ profile_id: A, kind: "bogus", created_at: new Date().toISOString() }]);
    const list = await loadNotifications(A);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: "change_approved", assetId: "asset-1", requestId: "req-1", readAt: null, data: { assetName: "Flat", responderName: "Bob" } });
  });

  it("returns [] (no throw) when the table is missing, and warns once", async () => {
    db.missingTables.add("notifications");
    expect(await loadNotifications(A)).toEqual([]);
    expect(await loadNotifications(A)).toEqual([]);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("returns [] when the query throws", async () => {
    db.throwingTables.add("notifications");
    expect(await loadNotifications(A)).toEqual([]);
  });
});

describe("createNotification", () => {
  it("skips when recipient == actor", async () => {
    expect(await createNotification(db.client() as never, { profileId: A, kind: "change_approved", actorId: A })).toBe(false);
    expect(rows()).toHaveLength(0);
  });
  it("writes for another recipient and reports missing-table / throw as false", async () => {
    expect(await createNotification(db.client() as never, { profileId: A, kind: "change_rejected", actorId: B, data: { assetName: "X" } })).toBe(true);
    expect(rows()).toHaveLength(1);
    db.missingTables.add("notifications");
    expect(await createNotification(db.client() as never, { profileId: A, kind: "change_rejected" })).toBe(false);
    db.missingTables.clear();
    db.throwingTables.add("notifications");
    expect(await createNotification(db.client() as never, { profileId: A, kind: "change_rejected" })).toBe(false);
  });
});

describe("isMissingTable", () => {
  it("recognises Postgres 42P01 and PostgREST PGRST205", () => {
    expect(isMissingTable({ code: "42P01", message: "x" })).toBe(true);
    expect(isMissingTable({ code: "PGRST205", message: "x" })).toBe(true);
    expect(isMissingTable({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });
});

describe("markNotificationRead / markAllNotificationsRead (server actions)", () => {
  it("refuse when signed out and change nothing", async () => {
    seed(A, 2);
    expect(await markNotificationRead(String(rows()[0].id))).toEqual({ ok: false, error: "You must be signed in." });
    expect(await markAllNotificationsRead()).toEqual({ ok: false, error: "You must be signed in." });
    expect(rows().every((r) => r.read_at === null)).toBe(true);
  });

  it("mark one: sets read_at on the user's own row only", async () => {
    seed(A, 2);
    h.sessionUser = { id: A };
    const target = String(rows()[0].id);
    expect(await markNotificationRead(target)).toEqual({ ok: true });
    expect(rows().find((r) => r.id === target)!.read_at).toBeTruthy();
    expect(rows().filter((r) => r.read_at).length).toBe(1);
  });

  it("cannot mark ANOTHER user's notification (id belongs to B, session is A)", async () => {
    seed(B, 1);
    h.sessionUser = { id: A };
    await markNotificationRead(String(rows()[0].id));
    expect(rows()[0].read_at).toBeNull();
  });

  it("mark all: only the session user's unread rows; keeps an earlier read_at; never touches others", async () => {
    seed(A, 2);
    seed(A, 1, { read_at: "2026-01-01T00:00:00.000Z" });
    seed(B, 2);
    h.sessionUser = { id: A };
    expect(await markAllNotificationsRead()).toEqual({ ok: true });
    const mine = rows().filter((r) => r.profile_id === A);
    expect(mine.every((r) => r.read_at)).toBe(true);
    expect(mine.filter((r) => r.read_at === "2026-01-01T00:00:00.000Z")).toHaveLength(1);
    expect(rows().filter((r) => r.profile_id === B).every((r) => r.read_at === null)).toBe(true);
  });

  it("do not throw when the table is missing", async () => {
    db.missingTables.add("notifications");
    h.sessionUser = { id: A };
    await expect(markNotificationRead("x")).resolves.toEqual({ ok: true });
    await expect(markAllNotificationsRead()).resolves.toEqual({ ok: true });
  });

  it("the demo user's writes are swallowed", async () => {
    const DEMO = "ddf92bf5-5beb-45c1-bf92-d3b696806d13"; // default of DEMO_USER_ID (src/lib/demo-mode.ts)
    seed(DEMO, 1);
    h.sessionUser = { id: DEMO };
    expect(await markAllNotificationsRead()).toEqual({ ok: true });
    expect(rows()[0].read_at).toBeNull();
  });
});
