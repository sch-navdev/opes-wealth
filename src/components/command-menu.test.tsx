import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadTierModules } from "@/test/tier-test-utils";
import type { ExpertiseLevel } from "@/stores/useUiTierStore";
import type { CommandHolding } from "@/lib/command-menu-items";

const push = vi.fn();
let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const HOLDINGS: CommandHolding[] = [
  { id: "a1", name: "Apple Inc", ticker_symbol: "AAPL", category: "Equities", is_liability: false },
  { id: "b2", name: "Dubai Villa", ticker_symbol: null, category: "Real Estate", is_liability: false },
  { id: "c3", name: "Car Loan", ticker_symbol: null, category: "Liabilities", is_liability: true },
];

type Mods = Awaited<ReturnType<typeof loadTierModules>>;
let m: Mods;
let menu: typeof import("@/components/command-menu");
let events: typeof import("@/lib/command-menu-events");

beforeAll(() => {
  // cmdk / Radix need these in jsdom.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(async () => {
  push.mockClear();
  pathname = "/dashboard";
  m = await loadTierModules();
  menu = await import("@/components/command-menu");
  events = await import("@/lib/command-menu-events");
});

function renderMenu(tier: ExpertiseLevel = "basic", holdings = HOLDINGS) {
  return render(
    <m.LanguageProvider>
      <m.TierProvider initialTier={tier}>
        <menu.CommandMenuTrigger />
        <menu.CommandMenu holdings={holdings} />
      </m.TierProvider>
    </m.LanguageProvider>,
  );
}

function open(init: KeyboardEventInit = { key: "k", ctrlKey: true }) {
  fireEvent.keyDown(window, init);
}

describe("CommandMenu", () => {
  it("renders nothing heavy until opened", () => {
    renderMenu();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Apple Inc")).toBeNull();
  });

  it.each([
    ["ctrl+K", { key: "k", ctrlKey: true }],
    ["meta+K", { key: "K", metaKey: true }],
  ])("opens on %s", (_label, init) => {
    renderMenu();
    open(init);
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search holdings, pages and actions…")).toBeInTheDocument();
  });

  it("ignores a plain K and prevents the browser default for the shortcut", () => {
    renderMenu();
    fireEvent.keyDown(window, { key: "k" });
    expect(screen.queryByRole("dialog")).toBeNull();
    const notPrevented = fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(notPrevented).toBe(false);
  });

  it("opens from the header trigger button", async () => {
    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: "Open search and commands" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    renderMenu();
    open();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("filters holdings by name and ticker", async () => {
    renderMenu();
    open();
    expect(screen.getByText("Dubai Villa")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("combobox"), "aapl");
    expect(screen.getByText("Apple Inc")).toBeInTheDocument();
    expect(screen.queryByText("Dubai Villa")).toBeNull();
    expect(screen.queryByText("Car Loan")).toBeNull();
  });

  it("shows an empty state when nothing matches", async () => {
    renderMenu();
    open();
    await userEvent.type(screen.getByRole("combobox"), "zzzzqq");
    expect(screen.getByText("No results found.")).toBeInTheDocument();
  });

  it("selecting a holding navigates to its detail page and closes", async () => {
    renderMenu();
    open();
    await userEvent.click(screen.getByText("Dubai Villa"));
    expect(push).toHaveBeenCalledWith("/dashboard/assets/b2");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides tier-gated pages for Basic", () => {
    renderMenu("basic");
    open();
    const pages = screen.getByRole("group", { name: "Pages" });
    expect(within(pages).getByText("Dashboard")).toBeInTheDocument();
    expect(within(pages).getByText("Profile Settings")).toBeInTheDocument();
    expect(within(pages).queryByText("Banking")).toBeNull();
    expect(within(pages).queryByText("Companies")).toBeNull();
    expect(within(pages).queryByText("Future Projects")).toBeNull();
  });

  it("shows every page for Expert and navigates to one", async () => {
    renderMenu("expert");
    open();
    const pages = screen.getByRole("group", { name: "Pages" });
    for (const label of ["Banking", "Companies", "Future Projects"]) {
      expect(within(pages).getByText(label)).toBeInTheDocument();
    }
    await userEvent.click(within(pages).getByText("Banking"));
    expect(push).toHaveBeenCalledWith("/dashboard/banking");
  });

  it("offers the IRR comparison page from Professional up, not at Basic", async () => {
    // The label (irr_nav_compare) is merged into i18n separately, so assert on the page count and navigation.
    const { unmount } = renderMenu("basic");
    open();
    expect(within(screen.getByRole("group", { name: "Pages" })).getAllByRole("option")).toHaveLength(3);
    unmount();
    renderMenu("professional");
    open();
    const pages = within(screen.getByRole("group", { name: "Pages" }));
    expect(pages.getAllByRole("option")).toHaveLength(8);
    await userEvent.click(pages.getByText(/^(Compare returns|irr_nav_compare)/));
    expect(push).toHaveBeenCalledWith("/dashboard/compare");
  });

  it("marks the current view and switching calls the tier setter", async () => {
    renderMenu("basic");
    open();
    const views = screen.getByRole("group", { name: "Switch view" });
    expect(within(views).getByText("Current")).toBeInTheDocument();
    expect(within(views).getAllByRole("option")).toHaveLength(3);
    await userEvent.click(within(views).getByText("Expert view"));
    expect(m.useUiTierStore.getState().user_expertise_level).toBe("expert");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Add asset fires the quick-action event on the dashboard", async () => {
    const handler = vi.fn();
    const off = events.onQuickAction("add-asset", handler);
    renderMenu("expert");
    open();
    await userEvent.click(screen.getByText("Add asset"));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    off();
  });

  it("Add asset from another page navigates to the dashboard first", async () => {
    pathname = "/dashboard/settings";
    renderMenu("expert");
    open();
    await userEvent.click(screen.getByText("Add asset"));
    expect(push).toHaveBeenCalledWith("/dashboard");
    // The request is remembered for the dashboard's dialog, which mounts later.
    const handler = vi.fn();
    const off = events.onQuickAction("add-asset", handler);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(handler).toHaveBeenCalledTimes(1);
    off();
  });

  it("Upload statement is offered from Standard up and fires its event", async () => {
    const { unmount } = renderMenu("basic");
    open();
    expect(screen.queryByText("Upload statement")).toBeNull();
    unmount();

    const handler = vi.fn();
    const off = events.onQuickAction("upload-statement", handler);
    renderMenu("professional");
    open();
    await userEvent.click(screen.getByText("Upload statement"));
    expect(handler).toHaveBeenCalledTimes(1);
    off();
  });

  it("switches the display currency through the ?currency param", async () => {
    renderMenu("basic");
    open();
    await userEvent.click(screen.getByText("Show amounts in EUR"));
    expect(push).toHaveBeenCalledWith("/dashboard?currency=EUR");
  });

  it("only offers the display currency group on the dashboard", () => {
    pathname = "/dashboard/security";
    renderMenu("basic");
    open();
    expect(screen.queryByRole("group", { name: "Display currency" })).toBeNull();
  });
});
