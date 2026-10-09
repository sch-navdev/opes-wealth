import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import { BankingOverview, type BankingAccountRow } from "@/components/banking-overview";
import { BANKING_COUNTRY_FILTER_KEY } from "@/lib/banking/account-country";

vi.mock("@/components/bank-connect-dialog", () => ({ BankConnectDialog: () => null }));
vi.mock("@/components/bank-statement-import-dialog", () => ({ BankStatementImportDialog: () => null }));

const row = (key: string, institution: string, country?: string): BankingAccountRow => ({
  key,
  name: `Account ${key}`,
  institution,
  masked: "",
  currency: "USD",
  balance: 100,
  baseBalance: 100,
  kind: "manual",
  status: null,
  lastSyncedAt: null,
  lastError: null,
  balanceAsOf: "2026-10-08",
  country,
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

const rows = [row("a", "Wio Bank", "AE"), row("b", "BoursoBank", "FR"), row("c", "ADCB", "AE")];

beforeEach(() => window.localStorage.clear());

describe("Banking overview: country grouping and filter", () => {
  it("groups by country with headings and offers All plus one chip per country", () => {
    renderOverview(rows);
    expect(screen.getAllByTestId("banking-country-heading")).toHaveLength(2);
    const chips = screen.getByRole("group", { name: "Country" });
    expect(within(chips).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(within(chips).getAllByRole("button")).toHaveLength(3);
  });

  it("filters to one country and remembers the choice", async () => {
    const user = userEvent.setup();
    renderOverview(rows);
    const chips = screen.getByRole("group", { name: "Country" });
    await user.click(within(chips).getAllByRole("button")[2]);
    expect(screen.getAllByTestId("banking-country-heading")).toHaveLength(1);
    expect(window.localStorage.getItem(BANKING_COUNTRY_FILTER_KEY)).not.toBe("all");
  });

  it("restores the remembered filter and tolerates unavailable storage", () => {
    window.localStorage.setItem(BANKING_COUNTRY_FILTER_KEY, "FR");
    renderOverview(rows);
    expect(screen.getAllByTestId("banking-country-heading")).toHaveLength(1);
    expect(screen.getByText("BoursoBank")).toBeInTheDocument();
    expect(screen.queryByText("Wio Bank")).toBeNull();
  });

  it("shows no country UI when no account has a country", () => {
    renderOverview([row("a", "Wio Bank"), row("b", "ADCB")]);
    expect(screen.queryByTestId("banking-country-heading")).toBeNull();
    expect(screen.queryByRole("group", { name: "Country" })).toBeNull();
  });
});
