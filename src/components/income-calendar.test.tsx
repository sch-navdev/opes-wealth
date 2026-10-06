import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { IncomeCalendar } from "@/components/income-calendar";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import type { IncomeCalendar as Data } from "@/lib/income-calendar";

const keys = [
  "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
  "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
];
const zero = { reit: 0, stocks: 0, rental: 0, private_equity: 0 };

function data(over: Partial<Data> = {}): Data {
  const months: Data["months"] = keys.map((month) => ({ month, total: 0, bySource: { ...zero }, items: [] }));
  months[0] = {
    month: "2025-11",
    total: 1000,
    bySource: { ...zero, rental: 600, stocks: 400 },
    items: [
      { assetId: "a", name: "Flat", source: "rental", amount: 600, date: "2025-11-01", basis: "contract" },
      { assetId: "b", name: "ACME", source: "stocks", amount: 400, basis: "estimate" },
    ],
  };
  months[3] = { month: "2026-02", total: 500, bySource: { ...zero, reit: 500 }, items: [] };
  return {
    months,
    annualTotal: 1500,
    monthlyAverage: 125,
    peakMonth: "2025-11",
    yieldOnCostPct: 7.5,
    currentYieldPct: 5,
    costBasis: 20000,
    marketValue: 30000,
    ...over,
  };
}

const renderIt = (calendar: Data) =>
  render(
    <LanguageProvider>
      <PrivacyProvider>
        <IncomeCalendar calendar={calendar} baseCurrency="USD" />
      </PrivacyProvider>
    </LanguageProvider>,
  );

beforeEach(() => localStorage.clear());

describe("IncomeCalendar", () => {
  it("shows the summary figures", () => {
    renderIt(data());
    expect(screen.getAllByText("$1,500").length).toBeGreaterThan(0);
    expect(screen.getByText("$125")).toBeTruthy();
    expect(screen.getByText("7.5%")).toBeTruthy();
    expect(screen.getByText("5.0%")).toBeTruthy();
    // best month shown in the summary and again in the sr-only table
    expect(screen.getAllByText("November 2025").length).toBeGreaterThanOrEqual(2);
  });

  it("renders one labelled bar per month, scaled to the best month with stacked sources", () => {
    const { container } = renderIt(data());
    expect(screen.getAllByRole("img")).toHaveLength(12);
    expect(screen.getAllByRole("img")[0].getAttribute("aria-label")).toContain("$1,000");
    const segs = container.querySelectorAll<HTMLElement>('[data-source]');
    const rental = [...segs].find((s) => s.dataset.source === "rental");
    const stocks = [...segs].find((s) => s.dataset.source === "stocks");
    expect(rental?.style.height).toBe("60%");
    expect(stocks?.style.height).toBe("40%");
    const reit = [...segs].find((s) => s.dataset.source === "reit");
    expect(reit?.style.height).toBe("50%");
  });

  it("expands a month to its items and flags estimates", () => {
    renderIt(data());
    expect(screen.queryByText("Flat")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { pressed: false })[0]);
    expect(screen.getByText("Flat")).toBeTruthy();
    expect(screen.getByText("ACME")).toBeTruthy();
    expect(screen.getAllByText("Estimate")).toHaveLength(1);
  });

  it("has a table fallback with all 12 months", () => {
    renderIt(data());
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(13);
  });

  it("shows the empty state when nothing is projected", () => {
    renderIt(data({ annualTotal: 0, monthlyAverage: 0, peakMonth: null, yieldOnCostPct: null, currentYieldPct: null, months: keys.map((month) => ({ month, total: 0, bySource: { ...zero }, items: [] })) }));
    expect(screen.getByText(/No projected income yet/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
