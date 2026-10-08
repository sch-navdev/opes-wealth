import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadTierModules } from "@/test/tier-test-utils";
import { countIssues, type DataQualityIssue, type DataQualityReport } from "@/lib/data-quality";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

type Mods = Awaited<ReturnType<typeof loadTierModules>>;
let m: Mods;
let Card: typeof import("@/components/data-quality-card").DataQualityCard;
let Privacy: typeof import("@/context/privacy-context");

beforeEach(async () => {
  m = await loadTierModules();
  ({ DataQualityCard: Card } = await import("@/components/data-quality-card"));
  Privacy = await import("@/context/privacy-context");
});

const issue = (over: Partial<DataQualityIssue> & Pick<DataQualityIssue, "id" | "kind" | "severity">): DataQualityIssue => ({
  params: {},
  ...over,
});

const report = (issues: DataQualityIssue[]): DataQualityReport => ({ issues, counts: countIssues(issues) });

function renderCard(r: DataQualityReport) {
  return render(
    <m.LanguageProvider>
      <Privacy.PrivacyProvider>
        <m.TierProvider initialTier="standard">
          <Card report={r} />
        </m.TierProvider>
      </Privacy.PrivacyProvider>
    </m.LanguageProvider>,
  );
}

const sample = [
  issue({ id: "fx_missing:a1", kind: "fx_missing", severity: "high", assetId: "a1", assetName: "Chalet", category: "Real Estate", params: { currency: "SEK", base: "USD" } }),
  issue({ id: "fx_fallback:global", kind: "fx_fallback", severity: "medium" }),
  issue({
    id: "cash_balance_mismatch:a2",
    kind: "cash_balance_mismatch",
    severity: "medium",
    assetId: "a2",
    assetName: "Savings",
    category: "Cash",
    params: { current: 5200, recorded: 5000, date: "2026-10-01", currency: "USD" },
  }),
  issue({ id: "zero_value:a3", kind: "zero_value", severity: "low", assetId: "a3", assetName: "Empty", category: "Real Estate" }),
];

describe("DataQualityCard", () => {
  it("shows a calm all-clear with no issue list when everything passes", () => {
    renderCard(report([]));
    expect(screen.getByRole("heading", { name: "Data quality" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("All checks passed");
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("link", { name: /See all checks/ })).toHaveAttribute("href", "/dashboard/data-quality");
  });

  it("states the count (singular and plural) and the counts by severity", () => {
    const { unmount } = renderCard(report([sample[0]]));
    expect(screen.getByRole("status")).toHaveTextContent("1 item needs attention");
    unmount();
    renderCard(report(sample));
    expect(screen.getByRole("status")).toHaveTextContent("4 items need attention");
    expect(screen.getByTestId("dq-count-high")).toHaveTextContent("High · 1");
    expect(screen.getByTestId("dq-count-medium")).toHaveTextContent("Medium · 2");
    expect(screen.getByTestId("dq-count-low")).toHaveTextContent("Low · 1");
  });

  it("lists only the top three issues, in the given order, and says how many are left", () => {
    renderCard(report(sample));
    const list = screen.getAllByRole("list").find((l) => within(l).queryAllByRole("link").length > 0)!;
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Chalet");
    expect(screen.queryByText("Empty")).toBeNull();
    expect(screen.getByText("1 more on the full list")).toBeInTheDocument();
  });

  it("links asset issues to the asset page and global issues to the data quality page", () => {
    renderCard(report(sample));
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/dashboard/assets/a1",
      "/dashboard/data-quality",
      "/dashboard/assets/a2",
      "/dashboard/data-quality",
    ]);
  });

  it("explains each issue in one line", () => {
    renderCard(report(sample));
    expect(screen.getByText(/No exchange rate is available for SEK/)).toBeInTheDocument();
    expect(screen.getByText(/Live exchange rates are unavailable/)).toBeInTheDocument();
  });

  it("shows money normally, and masks it in Privacy Mode", () => {
    const { unmount } = renderCard(report([sample[2]]));
    expect(screen.getByText(/5,200.00/)).toBeInTheDocument();
    unmount();
    localStorage.setItem("opes_privacy_mode", "true");
    const { container } = renderCard(report([sample[2]]));
    expect(container.textContent).not.toMatch(/5,200/);
    expect(container.textContent).toContain("••••••••");
  });
});
