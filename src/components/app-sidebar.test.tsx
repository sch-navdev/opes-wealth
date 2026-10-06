import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NAV_LINK_TIERS, type DashboardSection, type NavLinkId } from "@/lib/dashboard-tiers";
import { EXPERTISE_LEVELS, type ExpertiseLevel } from "@/stores/useUiTierStore";
import { loadTierModules } from "@/test/tier-test-utils";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/app/auth/actions", () => ({ logout: vi.fn() }));

type Mods = Awaited<ReturnType<typeof loadTierModules>>;
let m: Mods;
let NavList: typeof import("@/components/app-sidebar").NavList;

beforeEach(async () => {
  m = await loadTierModules();
  // Imported after the registry reset so the sidebar shares the fresh tier store.
  ({ NavList } = await import("@/components/app-sidebar"));
});

const HREFS: Record<NavLinkId, string> = {
  dashboard: "/dashboard",
  banking: "/dashboard/banking",
  companies: "/dashboard/companies",
  planning: "/dashboard/planning",
  settings: "/dashboard/settings",
  security: "/dashboard/security",
};

const EXPECTED_LINKS: Record<ExpertiseLevel, NavLinkId[]> = {
  basic: ["dashboard", "settings", "security"],
  standard: ["dashboard", "banking", "settings", "security"],
  professional: ["dashboard", "banking", "companies", "planning", "settings", "security"],
  expert: ["dashboard", "banking", "companies", "planning", "settings", "security"],
};

function renderSidebar(tier: ExpertiseLevel) {
  return render(
    <m.LanguageProvider>
      <m.TierProvider initialTier={tier}>
        <NavList collapsible />
      </m.TierProvider>
    </m.LanguageProvider>,
  );
}

function renderedLinks(tier: ExpertiseLevel): NavLinkId[] {
  const { unmount } = renderSidebar(tier);
  const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
  unmount();
  return (Object.keys(HREFS) as NavLinkId[]).filter((id) => hrefs.includes(HREFS[id]));
}

function sectionShown(tier: ExpertiseLevel, section: DashboardSection) {
  const { unmount } = render(
    <m.TierProvider initialTier={tier}>
      <m.TierGate section={section}>
        <p>section-content</p>
      </m.TierGate>
    </m.TierProvider>,
  );
  const shown = screen.queryByText("section-content") !== null;
  unmount();
  return shown;
}

describe("AppSidebar nav links", () => {
  it.each(EXPERTISE_LEVELS)("shows exactly the expected links at %s", (tier) => {
    expect(renderedLinks(tier)).toEqual(EXPECTED_LINKS[tier]);
  });

  it("renders English labels", () => {
    renderSidebar("professional");
    expect(screen.getByRole("link", { name: "Future Projects" })).toHaveAttribute("href", "/dashboard/planning");
  });

  it("shows the Future Projects link at Professional but not at Standard", () => {
    expect(renderedLinks("professional")).toContain("planning");
    expect(renderedLinks("standard")).not.toContain("planning");
  });
});

describe("sidebar mirrors the dashboard tier map", () => {
  const sectionLinks = (Object.keys(NAV_LINK_TIERS) as NavLinkId[]).flatMap((id) => {
    const rule = NAV_LINK_TIERS[id];
    return "section" in rule ? [[id, rule.section] as const] : [];
  });

  it("has section-backed links for planning and banking", () => {
    expect(sectionLinks.map(([id]) => id).sort()).toEqual(["banking", "planning"]);
  });

  it.each(sectionLinks)("%s link is present <=> the %s section is present", (id, section) => {
    for (const tier of EXPERTISE_LEVELS) {
      expect(renderedLinks(tier).includes(id), `${id} link at ${tier}`).toBe(sectionShown(tier, section));
    }
  });
});
