import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PeLiquidityPanel } from "@/components/pe-liquidity-panel";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import type { PeLiquidityData, PeLiquidityRow } from "@/lib/pe-liquidity-data";

const row = (over: Partial<PeLiquidityRow> = {}): PeLiquidityRow => ({
  id: "a",
  name: "Invented Fund A",
  currency: "EUR",
  paidIn: 100_000,
  unfunded: 50_000,
  nav: 80_000,
  distributed: 40_000,
  dpi: 0.4,
  rvpi: 0.8,
  tvpi: 1.2,
  netIrr: 0.123,
  irrGap: null,
  ...over,
});

const data = (over: Partial<PeLiquidityData> = {}): PeLiquidityData => ({
  rows: [row()],
  portfolio: { paidIn: 100_000, unfunded: 50_000, nav: 80_000, distributed: 40_000, dpi: 0.4, rvpi: 0.8, tvpi: 1.2, netIrr: 0.123, undatedFunds: 0 },
  upcoming: [],
  upcomingTotal: 0,
  today: "2025-01-15",
  ...over,
});

function renderPanel(d: PeLiquidityData) {
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <PeLiquidityPanel data={d} baseCurrency="USD" />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe("PeLiquidityPanel", () => {
  it("shows paid-in, unfunded, DPI, RVPI, TVPI and net IRR for a fund", () => {
    renderPanel(data());
    const table = screen.getByRole("region", { name: /Private-market liquidity/ });
    const r = within(table).getByRole("link", { name: "Invented Fund A" }).closest("tr")!;
    expect(r.textContent).toContain("100,000");
    expect(r.textContent).toContain("50,000");
    expect(r.textContent).toContain("0.40x");
    expect(r.textContent).toContain("0.80x");
    expect(r.textContent).toContain("1.20x");
    expect(r.textContent).toContain("12.3%");
    expect(within(table).getByRole("link", { name: "Invented Fund A" })).toHaveAttribute("href", "/dashboard/assets/a");
  });

  it("shows an en dash with an explanation, never 0 or NaN, for missing data", () => {
    renderPanel(
      data({
        rows: [row({ paidIn: null, unfunded: null, nav: null, distributed: null, dpi: null, rvpi: null, tvpi: null, netIrr: null, irrGap: "no_paid_in" })],
      }),
    );
    const tr = screen.getByRole("link", { name: "Invented Fund A" }).closest("tr")!;
    expect(within(tr).getAllByLabelText(/Not available/).length).toBe(8);
    expect(tr.textContent).not.toMatch(/NaN|Infinity|0\.00x/);
    expect(within(tr).getAllByText("–").length).toBe(8);
    expect(within(tr).getByLabelText(/nothing has been paid in/)).toBeTruthy();
  });

  it("adds a portfolio roll-up row for several funds and notes funds left out of the pooled IRR", () => {
    renderPanel(
      data({
        rows: [row(), row({ id: "b", name: "Invented Fund B", netIrr: null, irrGap: "undated_flows" })],
        portfolio: { paidIn: 150_000, unfunded: 60_000, nav: 100_000, distributed: 45_000, dpi: 0.3, rvpi: 0.67, tvpi: 0.97, netIrr: 0.05, undatedFunds: 1 },
      }),
    );
    const total = screen.getByTestId("pel-portfolio-row");
    expect(total.textContent).toContain("150,000");
    expect(total.textContent).toContain("0.97x");
    expect(total.textContent).toContain("5.0%");
    expect(screen.getByText(/1 fund\(s\) with undated cash flows/)).toBeTruthy();
  });

  it("masks amounts and multiples in Privacy Mode but keeps the IRR and an en dash visible", () => {
    localStorage.setItem("opes_privacy_mode", "true");
    renderPanel(data({ rows: [row({ nav: null })] }));
    const tr = screen.getByRole("link", { name: "Invented Fund A" }).closest("tr")!;
    expect(tr.textContent).not.toContain("100,000");
    expect(tr.textContent).not.toContain("0.40x");
    expect(tr.textContent).toContain("••••••••");
    expect(tr.textContent).toContain("12.3%");
    expect(within(tr).getAllByText("–").length).toBe(1);
  });

  it("lists the 12-month strip with overdue and upcoming calls, en dash for empty months", () => {
    renderPanel(
      data({
        upcoming: [
          { assetId: "a", fund: "Invented Fund A", callId: "x", dueDate: "2024-11-01", amount: 5_000, overdue: true },
          { assetId: "a", fund: "Invented Fund A", callId: "y", dueDate: "2025-03-01", amount: 20_000, overdue: false },
          { assetId: "a", fund: "Invented Fund A", callId: "z", dueDate: "2026-01-20", amount: 10_000, overdue: false },
        ],
        upcomingTotal: 35_000,
      }),
    );
    const strip = screen.getByTestId("pel-strip");
    const cells = within(strip).getAllByRole("listitem");
    expect(cells).toHaveLength(13); // overdue + 12 months
    expect(cells[0].textContent).toContain("Overdue");
    expect(cells[0].textContent).toContain("5,000");
    expect(cells[3].textContent).toContain("20,000"); // March
    expect(cells[12].textContent).toContain("10,000"); // beyond the 12th month is clamped into the last cell
    expect(cells[1].textContent).toContain("–");
    expect(screen.getByText(/Total due:/).textContent).toContain("35,000");
  });

  it("says so when no calls are due and when there are no funds", () => {
    renderPanel(data());
    expect(screen.getByText(/No capital calls due in the next 12 months/)).toBeTruthy();
  });

  it("shows the empty note with no funds", () => {
    renderPanel(data({ rows: [] }));
    expect(screen.getByText("No private equity funds yet.")).toBeTruthy();
  });
});
