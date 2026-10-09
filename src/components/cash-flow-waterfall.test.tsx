import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { CashFlowWaterfall } from "@/components/cash-flow-waterfall";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import { clearSettings } from "@/lib/cash-flow-settings-local";
import type { IncomeStream } from "@/lib/income-streams";
import type { WaterfallTransaction } from "@/lib/cash-flow-waterfall";

const salary: IncomeStream = {
  id: "s1", kind: "salary", label: "Job", source_name: "", amount: 5000, currency: "USD", frequency: "monthly",
  pay_day: 25, pay_month: null, start_date: "2025-01-01", end_date: null, notes: "",
};
const txs: WaterfallTransaction[] = ["2026-07", "2026-08", "2026-09"].flatMap((m) => [
  { assetId: "a1", date: `${m}-02`, amount: -1000, currency: "USD", description: "Monthly rent" },
  { assetId: "a1", date: `${m}-15`, amount: -500, currency: "USD", description: "Fancy shop" },
]);
const accounts = [
  { id: "a1", name: "Everyday", currency: "USD", balance: 3000, accountType: "checking" },
  { id: "a2", name: "Fixed deposit", currency: "USD", balance: 9000, accountType: "term_deposit" },
];

function renderPanel(over: Partial<React.ComponentProps<typeof CashFlowWaterfall>> = {}) {
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <CashFlowWaterfall streams={[salary]} liabilities={[]} accounts={accounts} transactions={txs} baseCurrency="USD" rates={{ USD: 1 }} asOf="2026-10-09" {...over} />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  clearSettings();
});

describe("CashFlowWaterfall", () => {
  it("shows the ladder with net investable cash", () => {
    renderPanel();
    const ladder = screen.getByRole("list", { name: /Monthly waterfall/ });
    expect(ladder.textContent).toContain("Net investable cash");
    expect(ladder.textContent).toContain("$3,500");
    expect(ladder.textContent).toContain("Free to invest");
  });

  it("shows en dashes with a reason when there is no income and no transactions", () => {
    renderPanel({ streams: [], transactions: [], accounts: [] });
    expect(screen.getByText(/Add income streams above/)).toBeInTheDocument();
    expect(screen.getAllByText("–").length).toBeGreaterThan(2);
    expect(screen.getByText("No Cash accounts yet.")).toBeInTheDocument();
  });

  it("offers a manual estimate when there are no transactions", async () => {
    renderPanel({ transactions: [] });
    const input = screen.getByLabelText(/Estimated monthly expenses/);
    await userEvent.type(input, "2000");
    expect(screen.getByRole("list", { name: /Monthly waterfall/ }).textContent).toContain("$3,000");
  });

  it("marks a liquid account as emergency fund and counts its balance", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("checkbox", { name: "Count Everyday as emergency fund" }));
    // Target 6 x 1,000 essential = 6,000; current 3,000 -> 50 %.
    expect(screen.getByText("50 % funded")).toBeInTheDocument();
  });

  it("does not count a marked term deposit and says why", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("checkbox", { name: "Count Fixed deposit as emergency fund" }));
    expect(screen.getByText("Not instant access")).toBeInTheDocument();
    expect(screen.getByText("0 % funded")).toBeInTheDocument();
  });

  it("masks amounts in Privacy Mode", () => {
    localStorage.setItem("opes_privacy_mode", "true");
    try {
      renderPanel();
      const text = screen.getByRole("list", { name: /Monthly waterfall/ }).textContent ?? "";
      expect(text).toContain("••••••••");
      expect(text).not.toContain("$3,500");
    } finally {
      localStorage.removeItem("opes_privacy_mode");
    }
  });

  it("lets the user switch an exclusion off", async () => {
    renderPanel();
    const box = screen.getByRole("checkbox", { name: /Credit-card settlement lines/ });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(box).not.toBeChecked();
  });
});
