import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AttributionCard } from "@/components/attribution-card";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import type { AssetAttributionView } from "@/lib/asset-attribution-view";
import type { AttributionFailureReason } from "@/lib/asset-attribution";
import { computeAttribution } from "@/lib/portfolio-attribution";

function ok(over: { fxAtCost?: number; fxNow?: number; value?: number } = {}, rates: Partial<Extract<AssetAttributionView, { status: "ok" }>["rates"]> = {}): AssetAttributionView {
  const result = computeAttribution({ costLocal: 1000, valueLocal: over.value ?? 1500, fxAtCost: over.fxAtCost ?? 1.08, fxNow: over.fxNow ?? 1.1 });
  if (!result) throw new Error("bad fixture");
  return {
    status: "ok",
    base: "USD",
    currency: "EUR",
    result,
    rates: { costAsOfFrom: "2024-03-15", costAsOfTo: "2024-03-15", approximate: false, pegged: false, ...rates },
  };
}

function renderCard(attribution: AssetAttributionView | null) {
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <AttributionCard attribution={attribution} />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe("AttributionCard", () => {
  it("renders nothing when there is no attribution (same-currency asset)", () => {
    const { container } = renderCard(null);
    expect(container.innerHTML).toBe("");
  });

  it("shows capital, currency and total with amounts and percentages", () => {
    renderCard(ok());
    expect(screen.getByText("Performance attribution")).toBeTruthy();
    // capital: (1500-1000)*1.08 = 540, +50.0%; currency: 1500*0.02 = 30, +1.9%; total 570, +52.8%
    expect(screen.getByTestId("attr-capital-amount").textContent).toBe("+$540.00");
    expect(screen.getByTestId("attr-capital-pct").textContent).toBe("+50.0%");
    expect(screen.getByTestId("attr-currency-amount").textContent).toBe("+$30.00");
    expect(screen.getByTestId("attr-currency-pct").textContent).toBe("+1.9%");
    expect(screen.getByTestId("attr-total-amount").textContent).toBe("+$570.00");
    expect(screen.getByTestId("attr-total-pct").textContent).toBe("+52.8%");
  });

  it("colours gains with the success token and losses with the destructive token", () => {
    // price up 20% but EUR lost 10% against USD: capital positive, currency negative, total positive
    renderCard(ok({ value: 1200, fxAtCost: 1.2, fxNow: 1.08 }));
    expect(screen.getByTestId("attr-capital-amount").className).toContain("text-success");
    expect(screen.getByTestId("attr-currency-amount").className).toContain("text-destructive");
    expect(screen.getByTestId("attr-currency-amount").textContent).toMatch(/^-\$|^−\$/);
    expect(screen.getByTestId("attr-currency-pct").className).toContain("text-destructive");
  });

  it("colours a negative total red", () => {
    renderCard(ok({ value: 800, fxAtCost: 1.1, fxNow: 1.05 }));
    expect(screen.getByTestId("attr-total-amount").className).toContain("text-destructive");
  });

  it("has an accessible split bar with screen-reader text", () => {
    renderCard(ok());
    const bar = screen.getByRole("img");
    const labelId = bar.getAttribute("aria-labelledby") as string;
    const text = document.getElementById(labelId)?.textContent ?? "";
    expect(text).toContain("+$540.00");
    expect(text).toContain("+$30.00");
    expect(document.getElementById(labelId)?.className).toContain("sr-only");
  });

  it("shows the rates used with dates and source, plus tooltips for each definition", () => {
    renderCard(ok());
    expect(screen.getByText("At cost: 1 EUR = 1.08 USD (ECB, 2024-03-15)")).toBeTruthy();
    expect(screen.getByText("Today: 1 EUR = 1.1 USD")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /How .* is calculated/ })).toHaveLength(3);
    expect(screen.queryByText(/approximations/)).toBeNull();
  });

  it("shows a date range for several lots, and the approximation and peg notes", () => {
    renderCard(ok({}, { costAsOfFrom: "2023-01-02", costAsOfTo: "2024-03-14", approximate: true, pegged: true }));
    expect(screen.getByText(/average.*2023-01-02 to 2024-03-14/)).toBeTruthy();
    expect(screen.getByText(/approximations/)).toBeTruthy();
    expect(screen.getByText(/USD-pegged/)).toBeTruthy();
    expect(screen.getByText(/ECB and USD peg/)).toBeTruthy();
  });

  it("masks amounts and percentages in Privacy Mode but keeps the rates", () => {
    localStorage.setItem("opes_privacy_mode", "true");
    renderCard(ok());
    expect(screen.queryByText("+$540.00")).toBeNull();
    expect(screen.queryByText("+50.0%")).toBeNull();
    expect(screen.getByTestId("attr-total-amount").textContent).toBe("••••••••");
    expect(document.body.textContent).not.toContain("540");
    expect(screen.getByText(/At cost: 1 EUR/)).toBeTruthy();
  });

  const reasons: [AttributionFailureReason, RegExp][] = [
    ["no_trades", /trade history/],
    ["no_open_lots", /no open position/],
    ["currency_mismatch", /different currency/],
    ["missing_purchase_price", /purchase price/],
    ["missing_purchase_date", /purchase date/],
    ["invalid_value", /not valid/],
    ["missing_fx_now", /Today's exchange rate/],
    ["missing_fx_at_cost", /historical exchange rate/],
  ];
  it.each(reasons)("explains the unavailable reason %s", (reason, re) => {
    renderCard({ status: "unavailable", reason });
    expect(screen.getByText("Performance attribution")).toBeTruthy();
    expect(screen.getByText(re)).toBeTruthy();
    expect(screen.queryByTestId("attr-total-amount")).toBeNull();
  });
});
