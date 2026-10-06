/**
 * PortfolioGroups, dashboard-level category pills (jsdom): the dashboard shows one folder per
 * category, so the pill bar above the folders filters which folder is shown (and opens it).
 * Row-level behaviour is covered by portfolio-table.test.tsx.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import { PortfolioGroups } from "@/components/portfolio-groups";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/context/privacy-context", () => ({ usePrivacy: () => ({ maskValue: (v: string) => v }) }));
vi.mock("@/app/dashboard/actions", () => ({ batchDeleteAssets: vi.fn() }));
vi.mock("@/components/add-asset-dialog", () => ({ AddAssetDialog: () => null }));
vi.mock("@/components/add-liability-dialog", () => ({ AddLiabilityDialog: () => null }));
vi.mock("@/components/delete-asset-button", () => ({ DeleteAssetButton: () => null }));

type Props = ComponentProps<typeof PortfolioGroups>;
const asset = (id: string, name: string, category: string): Props["assets"][number] => ({
  id,
  name,
  category_id: `c-${category}`,
  quantity: 1,
  current_value: 100,
  currency: "USD",
  is_liability: false,
  metadata: null,
  images: null,
  ticker_symbol: null,
  purchase_date: "2024-01-01",
  asset_categories: { name: category },
});

const categories = [
  { id: "c-Real Estate", name: "Real Estate" },
  { id: "c-Vehicles", name: "Vehicles" },
  { id: "c-Cash", name: "Cash" },
];
const assets = [asset("1", "Villa", "Real Estate"), asset("2", "Flat", "Real Estate"), asset("3", "Honda", "Vehicles"), asset("4", "Savings", "Cash")];

function renderGroups(list = assets) {
  return render(
    <LanguageProvider>
      <PortfolioGroups assets={list} categories={categories} displayCurrency="USD" rates={{ USD: 1 }} />
    </LanguageProvider>,
  );
}

describe("PortfolioGroups category pills", () => {
  it("shows an All pill plus one pill per category with its count", () => {
    renderGroups();
    const bar = screen.getByRole("group", { name: "Filter by category" });
    const labels = within(bar)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(labels).toEqual(["All4", "Real Estate2", "Vehicles1", "Cash1"]);
    expect(within(bar).getByRole("button", { name: /^All/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("filters the folders to the chosen category, opens it, and All restores them", async () => {
    renderGroups();
    expect(screen.queryByText("Villa")).toBeNull(); // folders start closed
    const bar = screen.getByRole("group", { name: "Filter by category" });
    await userEvent.click(within(bar).getByRole("button", { name: /^Real Estate/ }));
    expect(screen.getByText("Villa")).toBeTruthy();
    expect(screen.queryByText("Honda")).toBeNull();
    expect(screen.queryByText("Savings")).toBeNull();
    await userEvent.click(within(bar).getByRole("button", { name: /^All/ }));
    expect(screen.queryByText("Villa")).toBeNull();
  });

  it("has no pill bar with a single category", () => {
    renderGroups([asset("1", "Villa", "Real Estate")]);
    expect(screen.queryByRole("group", { name: "Filter by category" })).toBeNull();
  });
});
