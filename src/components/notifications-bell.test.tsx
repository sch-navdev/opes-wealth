/**
 * NotificationsBell, UI level (jsdom). The real component renders in the real
 * LanguageProvider (English); the server-action module is mocked, so this proves the view
 * and the calls it makes, not persistence (see notifications-server.test.ts).
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import type { NotificationItem } from "@/lib/notifications";

const actions = vi.hoisted(() => ({
  markNotificationRead: vi.fn(async () => ({ ok: true as const })),
  markAllNotificationsRead: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock("@/app/dashboard/ownership-actions", () => actions);

import { NotificationsBell } from "@/components/notifications-bell";

const recent = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();

const items: NotificationItem[] = [
  { id: "n1", kind: "change_approved", assetId: "asset-1", requestId: "r1", data: { assetName: "Marina flat", responderName: "Bob Brown" }, readAt: null, createdAt: recent(5) },
  { id: "n2", kind: "change_rejected", assetId: "asset-2", requestId: "r2", data: { assetName: "G63", responderName: "Sam Cousin" }, readAt: null, createdAt: recent(120) },
  { id: "n3", kind: "change_auto_applied", assetId: "asset-3", requestId: "r3", data: { assetName: "Villa" }, readAt: recent(1), createdAt: recent(60 * 24 * 8) },
];

function renderBell(list: NotificationItem[]) {
  return render(
    <LanguageProvider>
      <NotificationsBell items={list} />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  actions.markNotificationRead.mockClear();
  actions.markAllNotificationsRead.mockClear();
});

describe("NotificationsBell", () => {
  it("shows the unread count in the badge and the accessible name", () => {
    renderBell(items);
    const button = screen.getByRole("button", { name: "Notifications, 2 unread" });
    expect(within(button).getByText("2")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Notifications, 2 unread");
  });

  it("has no badge when everything is read or the list is empty", () => {
    renderBell([{ ...items[0], readAt: recent(1) }]);
    const button = screen.getByRole("button", { name: "Notifications" });
    expect(within(button).queryByText("1")).toBeNull();
  });

  it("lists a sentence per kind with the responder and the asset", async () => {
    const user = userEvent.setup();
    renderBell(items);
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByText("Bob Brown approved your change to Marina flat")).toBeTruthy();
    expect(screen.getByText("Sam Cousin rejected your change to G63")).toBeTruthy();
    expect(screen.getByText("Your change to Villa was applied automatically after 7 days")).toBeTruthy();
    expect(screen.getByText("5 minutes ago")).toBeTruthy();
    // unread items are flagged for screen readers, read ones are not
    expect(screen.getAllByText(/^Unread:/)).toHaveLength(2);
  });

  it("links each item to its asset", async () => {
    const user = userEvent.setup();
    renderBell(items);
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    const link = screen.getByRole("link", { name: /Bob Brown approved your change to Marina flat/ });
    expect(link.getAttribute("href")).toBe("/dashboard/assets/asset-1");
  });

  it("clicking an unread item marks it read through the action and updates the badge", async () => {
    const user = userEvent.setup();
    renderBell(items);
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    await user.click(screen.getByRole("link", { name: /Bob Brown approved/ }));
    expect(actions.markNotificationRead).toHaveBeenCalledTimes(1);
    expect(actions.markNotificationRead).toHaveBeenCalledWith("n1");
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeTruthy();
  });

  it("clicking an already-read item does not call the action", async () => {
    const user = userEvent.setup();
    renderBell(items);
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    await user.click(screen.getByRole("link", { name: /applied automatically/ }));
    expect(actions.markNotificationRead).not.toHaveBeenCalled();
  });

  it("'Mark all as read' calls the action once and clears the badge", async () => {
    const user = userEvent.setup();
    renderBell(items);
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    await user.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect(actions.markAllNotificationsRead).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark all as read" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows the empty state and disables 'Mark all as read'", async () => {
    const user = userEvent.setup();
    renderBell([]);
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("No notifications yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark all as read" }).hasAttribute("disabled")).toBe(true);
  });

  it("falls back to generic wording when the data lacks names", async () => {
    const user = userEvent.setup();
    renderBell([{ ...items[0], data: {} }]);
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByText("A co-owner approved your change to a shared asset")).toBeTruthy();
  });

  it("returns focus to the bell when the popover is closed with Escape", async () => {
    const user = userEvent.setup();
    renderBell(items);
    const button = screen.getByRole("button", { name: /Notifications/ });
    await user.click(button);
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(button);
  });
});
