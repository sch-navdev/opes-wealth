import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import { BankingOverview, type BankingAccountRow } from "@/components/banking-overview";

vi.mock("@/components/bank-connect-dialog", () => ({ BankConnectDialog: () => null }));
vi.mock("@/components/bank-statement-import-dialog", () => ({ BankStatementImportDialog: () => null }));

const row = (key: string, institution: string, balanceAsOf: string | null | undefined, extra: Partial<BankingAccountRow> = {}): BankingAccountRow => ({
  key,
  name: `Account ${key}`,
  institution,
  masked: "••••1234",
  currency: "USD",
  balance: 100,
  baseBalance: 100,
  kind: "manual",
  status: null,
  lastSyncedAt: null,
  lastError: null,
  balanceAsOf,
  ...extra,
});

function renderOverview(rows: BankingAccountRow[]) {
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <BankingOverview rows={rows} baseCurrency="USD" mode="sandbox" statementAccounts={[]} connectableCash={[]} today="2026-10-09" />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

describe("Banking overview: balance as-of marker", () => {
  it("shows the as-of date on every account and the legend", () => {
    renderOverview([row("a", "Wio Bank", "2026-10-01")]);
    expect(screen.getByText(/Balance as of/)).toHaveTextContent("2026");
    expect(screen.getByText(/more than one month \(31 days\) old/)).toBeInTheDocument();
    expect(screen.queryByText(/Stale: d+ days old/)).toBeNull();
  });

  it("marks a balance older than 31 days in red with a text label", () => {
    renderOverview([row("a", "Wio Bank", "2026-08-01")]);
    const label = screen.getByText(/Stale: 69 days old/);
    expect(label).toBeInTheDocument();
    expect(label.closest("p")).toHaveAttribute("data-stale", "true");
    expect(label.closest("p")?.className).toContain("text-destructive");
  });

  it("does not mark a balance that is exactly 31 days old", () => {
    renderOverview([row("a", "Wio Bank", "2026-09-08")]);
    expect(screen.queryByText(/Stale: d+ days old/)).toBeNull();
  });

  it("flags the institution total when any of its accounts is stale", () => {
    renderOverview([row("a", "Wio Bank", "2026-10-08"), row("b", "Wio Bank", "2026-06-01"), row("c", "ADCB", "2026-10-08")]);
    expect(screen.getAllByText("1 out of date")).toHaveLength(1);
    const wioCard = screen.getByText("Wio Bank").closest("[data-slot=card]") as HTMLElement;
    expect(within(wioCard).getByText("1 out of date")).toBeInTheDocument();
  });

  it("says the date is unknown rather than guessing, and skips sandbox rows", () => {
    renderOverview([row("a", "Wio Bank", null), row("s", "Wio Bank", "2020-01-01", { kind: "sandbox" })]);
    expect(screen.getByText("Balance date unknown")).toBeInTheDocument();
    expect(screen.queryByText(/Stale: d+ days old/)).toBeNull();
  });
});
