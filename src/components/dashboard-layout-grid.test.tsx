import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/app/dashboard/layout-actions", () => ({ saveDashboardLayout: mocks.save }));

import { DashboardCustomizeButton } from "@/components/dashboard-customize-button";
import { DashboardLayoutGrid, type DashboardBlockContent } from "@/components/dashboard-layout-grid";
import { DashboardLayoutProvider } from "@/components/dashboard-layout-provider";
import { TierProvider } from "@/components/tier-provider";
import { LanguageProvider } from "@/context/language-context";
import { BLOCK_IDS, defaultLayout, emptyLayouts, moveBlock, withTierLayout, type DashboardLayouts } from "@/lib/dashboard-layout";
import { LOCAL_LAYOUT_KEY } from "@/lib/dashboard-layout-local";

const content: DashboardBlockContent = Object.fromEntries(
  BLOCK_IDS.map((id) => [id, <button key={id} type="button" data-inner={id}>inner {id}</button>]),
);

function renderDashboard(initial: DashboardLayouts | null = null, tier: "expert" | "basic" = "expert", blocks = content) {
  return render(
    <LanguageProvider>
      <TierProvider initialTier={tier}>
        <DashboardLayoutProvider initialLayouts={initial}>
          <DashboardCustomizeButton />
          <DashboardLayoutGrid content={blocks} />
        </DashboardLayoutProvider>
      </TierProvider>
    </LanguageProvider>,
  );
}

/** Block ids in DOM order (works in both modes: each block carries data-testid="block-<id>"). */
function domOrder(): string[] {
  return screen
    .queryAllByTestId(/^block-(?!toggle-)/)
    .map((el) => el.getAttribute("data-testid")!.replace("block-", ""));
}

const toggleOf = (id: string) => screen.getByTestId(`block-toggle-${id}`);
const customize = () => screen.getByTestId("customize-dashboard");

beforeEach(() => {
  localStorage.clear();
  mocks.save.mockReset().mockImplementation(async (layouts: DashboardLayouts) => ({ ok: true, layouts }));
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
});

describe("normal mode", () => {
  it("renders the default layout in the original order, with the original arrangement of the Expert tiles", () => {
    renderDashboard();
    expect(domOrder()).toEqual(defaultLayout("expert").order);
    expect(screen.getByTestId("block-expertRaw")).toHaveClass("xl:col-span-6");
    expect(screen.getByTestId("block-expertRatios")).toHaveClass("xl:col-span-12");
    expect(screen.getByTestId("block-bento")).toHaveClass("xl:col-span-12");
    expect(screen.queryByTestId("layout-editor")).toBeNull();
  });

  it("applies a saved layout from the server: order, hidden blocks and sizes", () => {
    let layout = moveBlock(defaultLayout("expert"), "export", 0);
    layout = { ...layout, hidden: ["bento"], sizes: { ...layout.sizes, metricCards: "m" } };
    renderDashboard(withTierLayout(emptyLayouts(), "expert", layout));
    expect(domOrder()[0]).toBe("export");
    expect(domOrder()).not.toContain("bento");
    expect(screen.getByTestId("block-metricCards")).toHaveClass("xl:col-span-6");
  });

  it("only shows blocks the tier offers and that have content", () => {
    renderDashboard(null, "basic");
    expect(domOrder()).toEqual(["basicOverview"]);
    const { expertAttribution: _omit, ...withoutAttribution } = content;
    void _omit;
    renderDashboard(null, "expert", withoutAttribution);
    expect(screen.queryAllByTestId("block-expertAttribution")).toHaveLength(0);
  });

  it("ignores a hostile saved layout (unknown ids, blocks of other tiers)", () => {
    renderDashboard({
      version: 1,
      tiers: { basic: { version: 1, order: ["export", "nope"] as never, hidden: [], sizes: {} } },
    });
    expect(domOrder()).toEqual(defaultLayout("expert").order);
  });

  it("falls back to a layout kept in localStorage, and survives broken storage values", () => {
    localStorage.setItem(
      LOCAL_LAYOUT_KEY,
      JSON.stringify(withTierLayout(emptyLayouts(), "expert", moveBlock(defaultLayout("expert"), "export", 0))),
    );
    renderDashboard();
    expect(domOrder()[0]).toBe("export");
  });

  it("ignores unparseable localStorage content", () => {
    localStorage.setItem(LOCAL_LAYOUT_KEY, "{not json");
    renderDashboard();
    expect(domOrder()).toEqual(defaultLayout("expert").order);
  });
});

describe("edit mode", () => {
  it("enters edit mode showing every block of the tier, all active", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(customize());
    expect(screen.getByTestId("layout-editor")).toBeInTheDocument();
    expect(domOrder()).toEqual(defaultLayout("expert").order);
    for (const id of defaultLayout("expert").order) {
      expect(toggleOf(id)).toHaveAttribute("aria-pressed", "true");
    }
    expect(customize()).toBeDisabled();
  });

  it("keeps block content visible but inert, so a click toggles instead of triggering inner controls", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(customize());
    const inner = document.querySelector('[data-inner="bento"]') as HTMLElement;
    expect(inner).toBeTruthy();
    expect(inner.closest("[inert]")).not.toBeNull();
    expect(inner.closest(".pointer-events-none")).not.toBeNull();
  });

  it("one click switches a block off (greyed), another switches it back on", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(customize());
    await user.click(toggleOf("quickAdd"));
    expect(toggleOf("quickAdd")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("block-quickAdd")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("block-quickAdd")).toHaveClass("border-dashed");
    expect(toggleOf("bento")).toHaveAttribute("aria-pressed", "true");
    await user.click(toggleOf("quickAdd"));
    expect(toggleOf("quickAdd")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("block-quickAdd")).not.toHaveClass("border-dashed");
  });

  it("the up/down buttons reorder and the other blocks follow", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(customize());
    const before = domOrder();
    await user.click(screen.getByRole("button", { name: /Move .*Quick add.* down/i }));
    const after = domOrder();
    expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
    expect(after[2]).toBe(before[3]);
    expect(after[3]).toBe(before[2]);
    expect(after.slice(4)).toEqual(before.slice(4));
    await user.click(screen.getByRole("button", { name: /Move .*Quick add.* up/i }));
    expect(domOrder()).toEqual(before);
  });

  it("disables moving past either end", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(customize());
    const first = domOrder()[0];
    const last = domOrder().at(-1)!;
    expect(within(screen.getByTestId(`block-${first}`)).getAllByRole("button", { name: /Move .* up/i })[0]).toBeDisabled();
    expect(within(screen.getByTestId(`block-${last}`)).getAllByRole("button", { name: /Move .* down/i })[0]).toBeDisabled();
  });

  it("a size button changes the span class; sizes a block does not allow are disabled", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(customize());
    const card = screen.getByTestId("block-metricCards");
    expect(card).toHaveClass("xl:col-span-12");
    await user.click(within(card).getByRole("button", { name: /Medium/i }));
    expect(card).toHaveClass("xl:col-span-6");
    expect(card).not.toHaveClass("xl:col-span-12");
    expect(within(card).getByRole("button", { name: /Medium/i })).toHaveAttribute("aria-pressed", "true");
    expect(within(card).getByRole("button", { name: /Small/i })).toBeDisabled(); // metric cards: M and up
    await user.click(within(card).getByRole("button", { name: /Large/i }));
    expect(card).toHaveClass("xl:col-span-8");
  });

  it("Done saves once with the normalised layout and leaves edit mode", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(customize());
    await user.click(toggleOf("bento"));
    await user.click(within(screen.getByTestId("block-metricCards")).getByRole("button", { name: /Medium/i }));
    await user.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const sent = mocks.save.mock.calls[0][0] as DashboardLayouts;
    expect(sent.tiers.expert?.hidden).toEqual(["bento"]);
    expect(sent.tiers.expert?.sizes.metricCards).toBe("m");

    expect(screen.queryByTestId("layout-editor")).toBeNull();
    expect(domOrder()).not.toContain("bento");
    expect(screen.getByTestId("block-metricCards")).toHaveClass("xl:col-span-6");
    await waitFor(() => expect(screen.getByTestId("layout-status")).toHaveTextContent(/saved/i));
    expect(localStorage.getItem(LOCAL_LAYOUT_KEY)).toBeNull(); // account copy saved: no local fallback kept
    expect(customize()).toBeEnabled();
  });

  it("Done without any change does not call the server", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(customize());
    await user.click(screen.getByRole("button", { name: /^Done$/ }));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.queryByTestId("layout-editor")).toBeNull();
  });

  it("falls back to localStorage when the account save fails, and says so", async () => {
    mocks.save.mockResolvedValue({ ok: false, error: "column does not exist", unavailable: true });
    const user = userEvent.setup();
    renderDashboard();
    await user.click(customize());
    await user.click(toggleOf("bento"));
    await user.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(screen.getByTestId("layout-status")).toHaveTextContent(/this device only/i));
    const stored = JSON.parse(localStorage.getItem(LOCAL_LAYOUT_KEY)!);
    expect(stored.tiers.expert.hidden).toEqual(["bento"]);
    expect(domOrder()).not.toContain("bento");
  });

  it("falls back to localStorage when the action throws", async () => {
    mocks.save.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    renderDashboard();
    await user.click(customize());
    await user.click(toggleOf("bento"));
    await user.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(screen.getByTestId("layout-status")).toHaveTextContent(/this device only/i));
    expect(localStorage.getItem(LOCAL_LAYOUT_KEY)).not.toBeNull();
  });

  it("reports a failure when neither the account nor localStorage can be written", async () => {
    mocks.save.mockResolvedValue({ ok: false, error: "x" });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const user = userEvent.setup();
    renderDashboard();
    await user.click(customize());
    await user.click(toggleOf("bento"));
    await user.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(screen.getByTestId("layout-status")).toHaveTextContent(/could not be saved/i));
    setItem.mockRestore();
  });

  it("Cancel discards every change", async () => {
    const user = userEvent.setup();
    renderDashboard();
    const original = domOrder();
    await user.click(customize());
    await user.click(toggleOf("bento"));
    await user.click(screen.getByRole("button", { name: /Move .*Quick add.* up/i }));
    await user.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.queryByTestId("layout-editor")).toBeNull();
    expect(domOrder()).toEqual(original);
    await user.click(customize());
    expect(toggleOf("bento")).toHaveAttribute("aria-pressed", "true");
  });

  it("Reset restores the default layout in the editor (and Cancel then keeps the saved one)", async () => {
    const saved = withTierLayout(
      emptyLayouts(),
      "expert",
      { ...moveBlock(defaultLayout("expert"), "export", 0), hidden: ["bento"], sizes: { ...defaultLayout("expert").sizes, metricCards: "m" } },
    );
    const user = userEvent.setup();
    renderDashboard(saved);
    await user.click(customize());
    expect(domOrder()[0]).toBe("export");
    expect(toggleOf("bento")).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: /Reset to default/i }));
    expect(domOrder()).toEqual(defaultLayout("expert").order);
    expect(toggleOf("bento")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("block-metricCards")).toHaveClass("xl:col-span-12");
    await user.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(domOrder()[0]).toBe("export");
  });

  it("Reset then Done saves the default layout", async () => {
    const saved = withTierLayout(emptyLayouts(), "expert", { ...defaultLayout("expert"), hidden: ["bento"] });
    const user = userEvent.setup();
    renderDashboard(saved);
    await user.click(customize());
    await user.click(screen.getByRole("button", { name: /Reset to default/i }));
    await user.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect((mocks.save.mock.calls[0][0] as DashboardLayouts).tiers.expert).toEqual(defaultLayout("expert"));
  });

  it("offers a keyboard-focusable drag handle per block with an accessible name", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(customize());
    const handles = screen.getAllByRole("button", { name: /Drag to move/i });
    expect(handles).toHaveLength(defaultLayout("expert").order.length);
    handles[0].focus();
    expect(handles[0]).toHaveFocus();
    expect(handles[0]).toHaveAttribute("aria-roledescription");
  });

  it("shows a placeholder for a block without data, and still lets it be switched", async () => {
    const { expertAttribution: _omit, ...withoutAttribution } = content;
    void _omit;
    const user = userEvent.setup();
    renderDashboard(null, "expert", withoutAttribution);
    await user.click(customize());
    expect(toggleOf("expertAttribution")).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByTestId("block-expertAttribution")).getByText(/Nothing to show/i)).toBeInTheDocument();
  });
});

describe("no provider", () => {
  it("the Customize button renders nothing", () => {
    const { container } = render(
      <LanguageProvider>
        <DashboardCustomizeButton />
      </LanguageProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
