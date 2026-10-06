import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { RatiosPanel } from "@/components/dashboard-expert-panels";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import { tileEntranceStyle } from "@/lib/dashboard-tiers";
import type { ExpertPanelsData, FinancialRatios } from "@/lib/dashboard-expert";

const totals = {
  annualYield: 49_000,
  totalAssets: 1_000_000,
  totalLiabilities: 370_000,
  netWorth: 630_000,
  cashAssets: 100_000,
  otherLiabilities: 50_000,
  investedCapital: 850_000,
};

function renderPanel(ratios: Partial<FinancialRatios>) {
  const data = {
    ratios: { roa: null, debtToEquity: null, roic: null, totals, ...ratios },
  } as unknown as ExpertPanelsData;
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <RatiosPanel data={data} className="" style={tileEntranceStyle({ staggerMs: 0, durationMs: 0, offsetPx: 0 } as never, 0)} baseCurrency="USD" fmtMoney={(n) => `$${n}`} />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe("RatiosPanel", () => {
  it("renders ROA and ROIC as percentages and D/E as a multiple", () => {
    renderPanel({ roa: 0.049, debtToEquity: 1.374, roic: 0.0576 });
    expect(within(screen.getByRole("region", { name: /ROA/ })).getByText("4.9%")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: /D\/E/ })).getByText("1.37x")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: /ROIC/ })).getByText("5.8%")).toBeTruthy();
  });

  it("shows an en dash with an accessible explanation for unavailable ratios", () => {
    renderPanel({ roa: 0.049 });
    const de = screen.getByRole("region", { name: /D\/E/ });
    const value = within(de).getByLabelText(/Not available/);
    expect(value.textContent).toBe("–");
    expect(within(de).queryByText(/\d\.\d\dx/)).toBeNull();
  });

  it("offers a focusable explanation button per ratio", () => {
    renderPanel({ roa: 0.049, debtToEquity: 1.374, roic: 0.0576 });
    expect(screen.getAllByRole("button", { name: /How .* is calculated/ })).toHaveLength(3);
  });

  it("masks ratio values in Privacy Mode but keeps an en dash visible", () => {
    localStorage.setItem("opes_privacy_mode", "true");
    renderPanel({ roa: 0.049 });
    expect(screen.queryByText("4.9%")).toBeNull();
    expect(within(screen.getByRole("region", { name: /ROA/ })).getAllByText("••••••••").length).toBeGreaterThan(0);
    expect(within(screen.getByRole("region", { name: /D\/E/ })).getByLabelText(/Not available/).textContent).toBe("–");
  });
});
