import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("recharts", async () => {
  const React = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return { ResponsiveContainer: Box, ComposedChart: Box, AreaChart: Box, Bar: () => null, Line: () => null, Area: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null, ReferenceLine: () => null };
});

import { IncomeCalendarExplorer } from "@/components/income-calendar-explorer";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import { emptyByKind } from "@/lib/income-calendar-liabilities";
import type { IncomeCalendar } from "@/lib/income-calendar";

const keys = ["2026-11", "2026-12", "2027-01"];
const calendar: IncomeCalendar = {
  months: keys.map((month) => ({
    month,
    total: 1000,
    bySource: { rental: 1000, stocks: 0, reit: 0, private_equity: 0 },
    items: [],
    liabilities: { ...emptyByKind(), mortgage: 4000 },
    liabilityTotal: 4000,
    liabilityItems: [],
  })),
  annualTotal: 3000,
  monthCount: 3,
  liabilityAnnual: 12000,
  monthlyAverage: 1000,
  peakMonth: "2026-11",
  yieldOnCostPct: null,
  currentYieldPct: null,
  costBasis: 0,
  marketValue: 0,
};

const renderIt = () =>
  render(
    <LanguageProvider>
      <PrivacyProvider>
        <IncomeCalendarExplorer calendar={calendar} baseCurrency="USD" from="2026-11" months={3} hasEarned={false} backHref="/dashboard" />
      </PrivacyProvider>
    </LanguageProvider>,
  );

describe("IncomeCalendarExplorer", () => {
  it("shows the totals, the analysis, a year-by-year table and every month", () => {
    renderIt();
    expect(screen.getByRole("heading", { name: "Income calendar" })).toBeTruthy();
    expect(screen.getByText(/a shortfall of/)).toBeTruthy();
    expect(screen.getByText("Year by year")).toBeTruthy();
    expect(screen.getAllByRole("row").length).toBeGreaterThanOrEqual(3 + 1 + 3);
  });
  it("reloads for another length or a custom window", async () => {
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: "5 years" }));
    expect(nav.push).toHaveBeenCalledWith("?from=2026-11&months=60");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(nav.push).toHaveBeenLastCalledWith("?from=2026-11&months=3");
  });
});

describe("IncomeCalendarExplorer day by day and what-if", () => {
  it("shows the chosen month as a day grid", async () => {
    renderIt();
    expect(screen.getByTestId("income-days")).toBeTruthy();
    expect(document.querySelectorAll("[data-day]").length).toBe(30);
    await userEvent.click(screen.getByRole("button", { name: "Dec 26" }));
    expect(document.querySelectorAll("[data-day]").length).toBe(31);
  });

  it("adds a what-if income and counts it", async () => {
    window.localStorage.clear();
    renderIt();
    await userEvent.type(screen.getByPlaceholderText("Rent of the new flat"), "Marina rent");
    await userEvent.type(screen.getByLabelText(/Amount \(USD\)/), "5000");
    await userEvent.type(screen.getByPlaceholderText("Marina flat (simulation)"), "Marina flat");
    await userEvent.click(screen.getByRole("button", { name: "Add to the simulation" }));
    expect(screen.getByText(/Marina rent/)).toBeTruthy();
    expect(screen.getByText(/The what-if entries add/)).toBeTruthy();
  });
});
