import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadTierModules } from "@/test/tier-test-utils";
import { countIssues, type DataQualityIssue, type DataQualityReport } from "@/lib/data-quality";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/data-quality",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

type Mods = Awaited<ReturnType<typeof loadTierModules>>;
let m: Mods;
let List: typeof import("@/components/data-quality-list").DataQualityList;
let Privacy: typeof import("@/context/privacy-context");

beforeEach(async () => {
  m = await loadTierModules();
  ({ DataQualityList: List } = await import("@/components/data-quality-list"));
  Privacy = await import("@/context/privacy-context");
});

const report = (issues: DataQualityIssue[]): DataQualityReport => ({ issues, counts: countIssues(issues) });

function renderList(r: DataQualityReport) {
  return render(
    <m.LanguageProvider>
      <Privacy.PrivacyProvider>
        <m.TierProvider initialTier="standard">
          <List report={r} />
        </m.TierProvider>
      </Privacy.PrivacyProvider>
    </m.LanguageProvider>,
  );
}

const issues: DataQualityIssue[] = [
  { id: "fx_missing:a1", kind: "fx_missing", severity: "high", assetId: "a1", assetName: "Chalet", category: "Real Estate", params: { currency: "SEK", base: "USD" } },
  { id: "fx_fallback:global", kind: "fx_fallback", severity: "medium", params: {} },
  {
    id: "stale_valuation:a2",
    kind: "stale_valuation",
    severity: "medium",
    assetId: "a2",
    assetName: "Index fund",
    category: "Equities",
    params: { days: 20, threshold: 7, date: "2026-09-18" },
  },
  {
    id: "cash_balance_mismatch:a3",
    kind: "cash_balance_mismatch",
    severity: "medium",
    assetId: "a3",
    assetName: "Savings",
    category: "Cash",
    params: { current: 5200, recorded: 5000, date: "2026-10-01", currency: "USD" },
  },
  { id: "zero_value:a4", kind: "zero_value", severity: "low", assetId: "a4", assetName: "Empty", category: "Real Estate", params: {} },
];

describe("DataQualityList", () => {
  it("shows the empty state when nothing was found, with no filters", () => {
    renderList(report([]));
    expect(screen.getByRole("heading", { level: 1, name: "Data quality" })).toBeInTheDocument();
    expect(screen.getByText("All checks passed")).toBeInTheDocument();
    expect(screen.getByText("No data quality issues were found in your assets.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter by check" })).toBeNull();
  });

  it("groups issues under High, Medium and Low headings in that order", () => {
    renderList(report(issues));
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["High1", "Medium3", "Low1"]);
    expect(within(screen.getByTestId("dq-group-high")).getAllByRole("listitem")).toHaveLength(1);
    expect(within(screen.getByTestId("dq-group-medium")).getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows asset, category, explanation and how to fix on each row", () => {
    renderList(report(issues));
    const row = screen.getByRole("link", { name: "Open Index fund" }).closest("li")!;
    expect(row).toHaveTextContent("Brokerage Account");
    expect(row).toHaveTextContent("Last valuation on 2026-09-18, 20 days ago. This category is checked every 7 days.");
    expect(row).toHaveTextContent("How to fix: Refresh the market price from the asset page.");
  });

  it("links asset rows to the asset page; global rows have no link", () => {
    renderList(report(issues));
    expect(screen.getByRole("link", { name: "Open Chalet" })).toHaveAttribute("href", "/dashboard/assets/a1");
    const globalRow = screen.getByText("All assets").closest("li")!;
    expect(within(globalRow).queryByRole("link")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/dashboard");
  });

  it("filters by check with toggleable chips and announces the count", async () => {
    renderList(report(issues));
    const group = screen.getByRole("group", { name: "Filter by check" });
    const all = within(group).getByRole("button", { name: /^All/ });
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getAllByRole("button")).toHaveLength(6); // All + 5 kinds present
    expect(screen.getByText("Showing 5 of 5 items")).toBeInTheDocument();

    const stale = within(group).getByRole("button", { name: /Outdated valuation/ });
    await userEvent.click(stale);
    expect(stale).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Showing 1 of 5 items")).toBeInTheDocument();
    expect(screen.getByText("Index fund")).toBeInTheDocument();
    expect(screen.queryByText("Chalet")).toBeNull();
    expect(screen.queryByTestId("dq-group-high")).toBeNull();

    await userEvent.click(stale); // toggling the active chip clears the filter
    expect(screen.getByText("Showing 5 of 5 items")).toBeInTheDocument();
    await userEvent.click(stale);
    await userEvent.click(all);
    expect(screen.getByText("Chalet")).toBeInTheDocument();
  });

  it("masks money in Privacy Mode", () => {
    localStorage.setItem("opes_privacy_mode", "true");
    const { container } = renderList(report(issues));
    expect(container.textContent).not.toMatch(/5,200/);
    expect(container.textContent).toContain("••••••••");
  });

  it("shows money when Privacy Mode is off", () => {
    renderList(report(issues));
    expect(screen.getByText(/\$5,200\.00 differs from the latest recorded balance of \$5,000\.00 on 2026-10-01/)).toBeInTheDocument();
  });
});
