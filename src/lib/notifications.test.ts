import { describe, expect, it } from "vitest";
import {
  isNotificationKind,
  notificationMessageKey,
  notificationParams,
  relativeTime,
  toNotificationItem,
  unreadCount,
} from "@/lib/notifications";

describe("notificationMessageKey", () => {
  it("maps each kind to its own dictionary key", () => {
    expect(notificationMessageKey("change_approved")).toBe("notif_change_approved");
    expect(notificationMessageKey("change_rejected")).toBe("notif_change_rejected");
    expect(notificationMessageKey("change_auto_applied")).toBe("notif_change_auto_applied");
  });
  it("isNotificationKind rejects unknown values", () => {
    expect(isNotificationKind("change_approved")).toBe(true);
    expect(isNotificationKind("invite")).toBe(false);
    expect(isNotificationKind(undefined)).toBe(false);
  });
});

describe("notificationParams", () => {
  it("uses the data, trimmed", () => {
    expect(notificationParams({ responderName: " Bob ", assetName: "Flat" }, "Someone", "an asset")).toEqual({ name: "Bob", asset: "Flat" });
  });
  it("falls back to the translated defaults when data is missing or blank", () => {
    expect(notificationParams({}, "Someone", "an asset")).toEqual({ name: "Someone", asset: "an asset" });
    expect(notificationParams({ responderName: "  " }, "Someone", "an asset").name).toBe("Someone");
  });
});

describe("toNotificationItem", () => {
  const base = { id: "n1", kind: "change_rejected", created_at: "2026-10-01T00:00:00Z" };
  it("normalises a row and ignores non-string data fields", () => {
    expect(toNotificationItem({ ...base, asset_id: "a", data: { assetName: 5, responderName: "Bob" } })).toEqual({
      id: "n1",
      kind: "change_rejected",
      assetId: "a",
      requestId: null,
      data: { assetName: undefined, responderName: "Bob", responderId: undefined },
      readAt: null,
      createdAt: "2026-10-01T00:00:00Z",
    });
  });
  it("returns null for an unknown kind or a missing id", () => {
    expect(toNotificationItem({ ...base, kind: "x" })).toBeNull();
    expect(toNotificationItem({ kind: "change_approved", created_at: "x" })).toBeNull();
  });
  it("tolerates data being null or an array", () => {
    expect(toNotificationItem({ ...base, data: null })?.data).toEqual({ assetName: undefined, responderName: undefined, responderId: undefined });
    expect(toNotificationItem({ ...base, data: [] })).not.toBeNull();
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it("is 'now' under a minute", () => {
    expect(relativeTime(ago(10_000), "en", now)).toBe("now");
  });
  it("picks minutes, hours, days, weeks, months", () => {
    expect(relativeTime(ago(5 * 60_000), "en", now)).toBe("5 minutes ago");
    expect(relativeTime(ago(3 * 3_600_000), "en", now)).toBe("3 hours ago");
    expect(relativeTime(ago(86_400_000), "en", now)).toBe("yesterday");
    expect(relativeTime(ago(3 * 86_400_000), "en", now)).toBe("3 days ago");
    expect(relativeTime(ago(14 * 86_400_000), "en", now)).toBe("2 weeks ago");
    expect(relativeTime(ago(60 * 86_400_000), "en", now)).toBe("2 months ago");
  });
  it("localises", () => {
    expect(relativeTime(ago(2 * 3_600_000), "fr", now)).toMatch(/2 heures/);
  });
  it("returns '' for an invalid date", () => {
    expect(relativeTime("nope", "en", now)).toBe("");
  });
});

describe("unreadCount", () => {
  it("counts rows without readAt", () => {
    expect(unreadCount([{ readAt: null }, { readAt: "x" }, { readAt: null }])).toBe(2);
    expect(unreadCount([])).toBe(0);
  });
});
