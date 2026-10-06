import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { readTierFromCookieString } from "@/stores/useUiTierStore";
import { loadTierModules } from "@/test/tier-test-utils";

type Mods = Awaited<ReturnType<typeof loadTierModules>>;
let m: Mods;

beforeEach(async () => {
  m = await loadTierModules();
});

function setup() {
  const user = userEvent.setup();
  render(
    <m.LanguageProvider>
      <m.UiTierPreference />
    </m.LanguageProvider>,
  );
  // Same one-time rehydrate the sidebar does on mount.
  act(() => {
    void m.useUiTierStore.persist.rehydrate();
  });
  return { user };
}

const radio = (name: string) => screen.getByRole("radio", { name: new RegExp(`^${name}`) });

describe("UiTierPreference", () => {
  it("renders a radiogroup with the four tiers and Basic checked by default", () => {
    setup();
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(radio("Basic")).toBeChecked();
    expect(radio("Standard")).not.toBeChecked();
    expect(radio("Professional")).not.toBeChecked();
    expect(radio("Expert")).not.toBeChecked();
  });

  it("only the checked radio is in the tab order (roving tabindex)", async () => {
    const { user } = setup();
    const tabbable = () => screen.getAllByRole("radio").filter((r) => r.getAttribute("tabindex") === "0");
    expect(tabbable()).toEqual([radio("Basic")]);
    await user.click(radio("Professional"));
    expect(tabbable()).toEqual([radio("Professional")]);
  });

  it("clicking a tier checks it, updates the store, writes the cookie and announces it", async () => {
    const { user } = setup();
    await user.click(radio("Expert"));
    expect(radio("Expert")).toBeChecked();
    expect(radio("Basic")).not.toBeChecked();
    expect(m.useUiTierStore.getState().user_expertise_level).toBe("expert");
    expect(readTierFromCookieString(document.cookie)).toBe("expert");
    expect(screen.getByRole("status")).toHaveTextContent("Dashboard view set to Expert");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("clicking the already-active tier changes nothing and announces nothing", async () => {
    const { user } = setup();
    await user.click(radio("Basic"));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("ArrowRight / ArrowLeft move and select, wrapping at the ends, and move focus", async () => {
    const { user } = setup();
    act(() => radio("Basic").focus());
    await user.keyboard("{ArrowRight}");
    expect(radio("Standard")).toBeChecked();
    expect(radio("Standard")).toHaveFocus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(radio("Expert")).toBeChecked();
    expect(radio("Expert")).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(radio("Basic")).toBeChecked();
    expect(m.useUiTierStore.getState().user_expertise_level).toBe("basic");
  });

  it("ArrowDown and ArrowUp behave like Right and Left", async () => {
    const { user } = setup();
    act(() => radio("Basic").focus());
    await user.keyboard("{ArrowDown}");
    expect(radio("Standard")).toBeChecked();
    await user.keyboard("{ArrowUp}");
    expect(radio("Basic")).toBeChecked();
  });

  it("End selects Expert and Home selects Basic", async () => {
    const { user } = setup();
    act(() => radio("Basic").focus());
    await user.keyboard("{End}");
    expect(radio("Expert")).toBeChecked();
    expect(radio("Expert")).toHaveFocus();
    expect(readTierFromCookieString(document.cookie)).toBe("expert");
    await user.keyboard("{Home}");
    expect(radio("Basic")).toBeChecked();
    expect(radio("Basic")).toHaveFocus();
  });

  it("ignores unrelated keys", async () => {
    const { user } = setup();
    act(() => radio("Basic").focus());
    await user.keyboard("a");
    expect(radio("Basic")).toBeChecked();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
