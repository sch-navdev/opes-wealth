import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import { PortfolioTable } from "@/components/portfolio-table";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/context/privacy-context", () => ({ usePrivacy: () => ({ maskValue: (v: string) => v }) }));
vi.mock("@/components/add-asset-dialog", () => ({ AddAssetDialog: () => null }));
vi.mock("@/components/add-liability-dialog", () => ({ AddLiabilityDialog: () => null }));
vi.mock("@/components/delete-asset-button", () => ({ DeleteAssetButton: () => null }));

type Props = ComponentProps<typeof PortfolioTable>;
type Asset = Props["assets"][number];

const asset = (id: string, name: string, category: string, value: number): Asset => ({
  id,
  name,
  category_id: `c-${category}`,
  quantity: 1,
  current_value: value,
  currency: "USD",
  is_liability: false,
  metadata: null,
  images: null,
  ticker_symbol: null,
  purchase_date: "2024-01-01",
  asset_categories: { name: category },
});

const ASSETS: Asset[] = [
  asset("1", "Villa", "Real Estate", 500),
  asset("2", "Beach flat", "Real Estate", 100),
  asset("3", "Honda", "Vehicles", 300),
  asset("4", "Savings", "Cash", 200),
  asset("5", "ACME", "Equities", 50),
];

function ui(assets: Asset[]) {
  return (
    <LanguageProvider>
      <PortfolioTable assets={assets} categories={[]} displayCurrency="USD" rates={{}} />
    </LanguageProvider>
  );
}
const renderTable = (assets: Asset[] = ASSETS) => render(ui(assets));

const dataRows = () => screen.getAllByRole("row").filter((r) => r.hasAttribute("data-density"));
const rowNames = () => dataRows().map((r) => within(r).getAllByRole("link")[0].textContent);
const pill = (name: RegExp) => within(screen.getByRole("group", { name: "Filter by category" })).getByRole("button", { name });

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("PortfolioTable density toggle", () => {
  it("defaults to comfortable and switches rows to compact, persisting the choice", () => {
    renderTable();
    const group = screen.getByRole("group", { name: "Row density" });
    expect(within(group).getByRole("button", { name: "Comfortable" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "false");
    const before = dataRows()[0].className;
    expect(dataRows().every((r) => r.getAttribute("data-density") === "comfortable")).toBe(true);
    expect(before).not.toContain("text-xs");

    fireEvent.click(within(group).getByRole("button", { name: "Compact" }));
    expect(dataRows().every((r) => r.getAttribute("data-density") === "compact")).toBe(true);
    expect(dataRows()[0].className).toContain("text-xs");
    expect(within(group).getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("opes-table-density")).toBe("compact");
  });

  it("restores the stored density on mount", () => {
    localStorage.setItem("opes-table-density", "compact");
    renderTable();
    expect(dataRows()[0]).toHaveAttribute("data-density", "compact");
  });

  it("ignores an invalid stored value", () => {
    localStorage.setItem("opes-table-density", "huge");
    renderTable();
    expect(dataRows()[0]).toHaveAttribute("data-density", "comfortable");
  });

  it("keeps working for the session when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderTable();
    expect(dataRows()[0]).toHaveAttribute("data-density", "comfortable");
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));
    expect(dataRows()[0]).toHaveAttribute("data-density", "compact");
    // Reset the session fallback so later tests start from the default again.
    vi.restoreAllMocks();
    fireEvent.click(screen.getByRole("button", { name: "Comfortable" }));
    expect(dataRows()[0]).toHaveAttribute("data-density", "comfortable");
  });
});

describe("PortfolioTable category pills", () => {
  it("shows All plus only the categories present, with counts, in a labelled group", () => {
    renderTable();
    const group = screen.getByRole("group", { name: "Filter by category" });
    const labels = within(group)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(labels).toEqual(["All5", "Real Estate2", "Vehicles1", "Equities1", "Cash1"].map((l) => (l === "Equities1" ? "Brokerage Account1" : l)));
    expect(screen.queryByRole("button", { name: /Private Equity/ })).toBeNull();
    expect(pill(/^All/)).toHaveAttribute("aria-pressed", "true");
    expect(pill(/^Real Estate/)).toHaveAttribute("aria-pressed", "false");
  });

  it("filters rows when a pill is clicked and All resets", () => {
    renderTable();
    fireEvent.click(pill(/^Real Estate/));
    expect(pill(/^Real Estate/)).toHaveAttribute("aria-pressed", "true");
    expect(pill(/^All/)).toHaveAttribute("aria-pressed", "false");
    expect(rowNames()).toEqual(["Villa", "Beach flat"]);
    fireEvent.click(pill(/^All/));
    expect(rowNames()).toHaveLength(5);
  });

  it("composes with sorting", () => {
    renderTable();
    fireEvent.click(pill(/^Real Estate/));
    fireEvent.click(screen.getByRole("button", { name: /^name$/i }));
    expect(rowNames()).toEqual(["Beach flat", "Villa"]);
    fireEvent.click(screen.getByRole("button", { name: /^name$/i }));
    expect(rowNames()).toEqual(["Villa", "Beach flat"]);
  });

  it("shows a localized empty message when the selected category runs out of rows", () => {
    const { rerender } = renderTable();
    fireEvent.click(pill(/^Vehicles/));
    rerender(ui(ASSETS.filter((a) => a.asset_categories?.name !== "Vehicles")));
    expect(screen.getByText("No holdings in this category.")).toBeInTheDocument();
    expect(pill(/^Vehicles/)).toHaveTextContent("0");
    fireEvent.click(pill(/^All/));
    expect(rowNames()).toHaveLength(4);
  });

  it("hides the pills when only one category is present", () => {
    renderTable(ASSETS.slice(0, 2));
    expect(screen.queryByRole("group", { name: "Filter by category" })).toBeNull();
    expect(screen.getByRole("group", { name: "Row density" })).toBeInTheDocument();
  });

  it("is keyboard operable and respects reduced motion", () => {
    renderTable();
    const p = pill(/^Cash/);
    expect(p.tagName).toBe("BUTTON");
    expect(p).toHaveAttribute("type", "button");
    expect(p.className).toContain("motion-reduce:transition-none");
    expect(screen.getByRole("button", { name: "Compact" }).className).toContain("motion-reduce:transition-none");
  });
});
