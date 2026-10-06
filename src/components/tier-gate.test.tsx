import { act, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { tierMotion, type DashboardSection } from "@/lib/dashboard-tiers";
import { EXPERTISE_LEVELS, type ExpertiseLevel } from "@/stores/useUiTierStore";
import { loadTierModules, persistTier } from "@/test/tier-test-utils";

type Mods = Awaited<ReturnType<typeof loadTierModules>>;
let m: Mods;

beforeEach(async () => {
  m = await loadTierModules();
});

function hydrateWith(level: ExpertiseLevel) {
  persistTier(level);
  act(() => {
    void m.useUiTierStore.persist.rehydrate();
  });
}

function gated(tier: ExpertiseLevel, section: DashboardSection) {
  const { unmount } = render(
    <m.TierProvider initialTier={tier}>
      <m.TierGate section={section}>
        <p>content</p>
      </m.TierGate>
    </m.TierProvider>,
  );
  const shown = screen.queryByText("content") !== null;
  unmount();
  return shown;
}

describe("TierGate", () => {
  it("shows basicOverview only at basic", () => {
    expect(EXPERTISE_LEVELS.map((t) => gated(t, "basicOverview"))).toEqual([true, false, false, false]);
  });

  it("shows bento from standard upward", () => {
    expect(EXPERTISE_LEVELS.map((t) => gated(t, "bento"))).toEqual([false, true, true, true]);
  });

  it("shows expertPanels only at expert", () => {
    expect(EXPERTISE_LEVELS.map((t) => gated(t, "expertPanels"))).toEqual([false, false, false, true]);
  });

  it("follows the store once hydrated", () => {
    render(
      <m.TierGate section="expertPanels">
        <p>content</p>
      </m.TierGate>,
    );
    expect(screen.queryByText("content")).not.toBeInTheDocument();
    hydrateWith("expert");
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});

describe("useUiTier", () => {
  it("returns the default (basic) before hydration without a provider", () => {
    const { result } = renderHook(() => m.useUiTier());
    expect(result.current).toBe("basic");
  });

  it("returns the provider's initial tier before hydration, ignoring the store", () => {
    m.useUiTierStore.setState({ user_expertise_level: "standard" });
    const { result } = renderHook(() => m.useUiTier(), {
      wrapper: ({ children }) => <m.TierProvider initialTier="professional">{children}</m.TierProvider>,
    });
    expect(m.useUiTierStore.persist.hasHydrated()).toBe(false);
    expect(result.current).toBe("professional");
  });

  it("falls back to the default when the provider has no tier", () => {
    const { result } = renderHook(() => m.useUiTier(), {
      wrapper: ({ children }) => <m.TierProvider initialTier={undefined}>{children}</m.TierProvider>,
    });
    expect(result.current).toBe("basic");
  });

  it("returns the store value after hydration, overriding the provider", () => {
    const { result } = renderHook(() => m.useUiTier(), {
      wrapper: ({ children }) => <m.TierProvider initialTier="basic">{children}</m.TierProvider>,
    });
    expect(result.current).toBe("basic");
    hydrateWith("expert");
    expect(result.current).toBe("expert");
    act(() => m.useUiTierStore.getState().setExpertiseLevel("standard"));
    expect(result.current).toBe("standard");
  });
});

describe("useTierMotion", () => {
  it.each(EXPERTISE_LEVELS)("returns the motion for %s", (tier) => {
    const { result } = renderHook(() => m.useTierMotion(), {
      wrapper: ({ children }) => <m.TierProvider initialTier={tier}>{children}</m.TierProvider>,
    });
    expect(result.current).toEqual(tierMotion(tier));
  });
});
