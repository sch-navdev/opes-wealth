import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DashboardAttributionPanel } from "@/components/dashboard-attribution-panel";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import type { AttributionPanelData } from "@/lib/dashboard-attribution";

const data: AttributionPanelData = {
  included: 2,
  total: 3,
  coverage: 2 / 3,
  totals: {
    costBase: 400,
    capitalBase: 170,
    currencyBase: -180,
    totalBase: -10,
    capitalPct: 0.425,
    currencyPct: -0.45,
    totalPct: -0.025,
    capitalShare: 170 / 350,
    currencyShare: 180 / 350,
  },
  top: [
    { id: "a", name: "Dubai Flat", currency: "AED", currencyBase: -150, capitalBase: 0 },
    { id: "b", name: "Euro Fund", currency: "EUR", currencyBase: 30, capitalBase: 0 },
  ],
};

function renderPanel(d: AttributionPanelData | null) {
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <DashboardAttributionPanel data={d} baseCurrency="USD" />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe("DashboardAttributionPanel", () => {
  it("renders nothing without data (no foreign holdings)", () => {
    const { container } = renderPanel(null);
    expect(container.textContent).toBe("");
  });

  it("shows signed capital, currency and total amounts with colour coding", () => {
    renderPanel(data);
    const capital = screen.getByText("Capital return").closest("div")!;
    expect(within(capital).getByText("USD +170").className).toContain("text-success");
    expect(within(capital).getByText("42.5% of cost")).toBeTruthy();
    const currency = screen.getByText("Currency return").closest("div")!;
    expect(within(currency).getByText("USD -180").className).toContain("text-destructive");
    expect(within(currency).getByText("-45.0% of cost")).toBeTruthy();
    const total = screen.getByText("Total return").closest("div")!;
    expect(within(total).getByText("USD -10").className).toContain("text-destructive");
  });

  it("describes the split bar, coverage and the top holdings", () => {
    renderPanel(data);
    expect(screen.getByRole("img", { name: /capital 48\.6%, currency 51\.4%/ })).toBeTruthy();
    expect(screen.getByText("Based on 2 of 3 foreign-currency holdings.")).toBeTruthy();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Dubai Flat");
    expect(items[0].textContent).toContain("AED");
    expect(items[0].textContent).toContain("USD -150");
    expect(items[1].textContent).toContain("USD +30");
  });

  it("offers a focusable definition button", () => {
    renderPanel(data);
    expect(screen.getByRole("button", { name: /How the currency and capital returns/ })).toBeTruthy();
  });

  it("masks amounts and percentages in Privacy Mode but keeps coverage text", () => {
    localStorage.setItem("opes_privacy_mode", "true");
    renderPanel(data);
    expect(screen.queryByText("USD +170")).toBeNull();
    expect(screen.queryByText(/USD 150/)).toBeNull();
    expect(screen.queryByText(/42\.5%/)).toBeNull();
    expect(screen.getAllByText("••••••••").length).toBeGreaterThan(0);
    expect(screen.getByText("Based on 2 of 3 foreign-currency holdings.")).toBeTruthy();
  });

  it("explains when no holding could be attributed", () => {
    renderPanel({ included: 0, total: 2, coverage: 0, totals: null, top: [] });
    expect(screen.getByText(/Historical exchange rates are unavailable/)).toBeTruthy();
    expect(screen.getByText("Based on 0 of 2 foreign-currency holdings.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows a 12-month sparkline and signed change for currencies that have a trend", () => {
    renderPanel({ ...data, fxTrends: { AED: [1, 1, 0.9] } });
    const trend = screen.getByTestId("fx-trend-AED");
    expect(trend.querySelector("svg")).toBeTruthy();
    expect(trend.textContent).toContain("-10.0%");
    expect(screen.queryByTestId("fx-trend-EUR")).toBeNull();
  });
});
