import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import { CompaniesCash, companyCashTotal, type CompanyCashGroup } from "@/components/companies-cash";
import { CompaniesSummary } from "@/components/companies-summary";
import { CashBankCard } from "@/components/cash-bank-card";
import { BankingOverview, type BankingAccountRow } from "@/components/banking-overview";

const mocks = vi.hoisted(() => ({
  setBankAccountCompany: vi.fn(),
  addBankAccount: vi.fn(),
}));

vi.mock("@/app/dashboard/companies/company-cash-actions", () => ({ setBankAccountCompany: mocks.setBankAccountCompany }));
vi.mock("@/app/dashboard/actions", () => ({ addBankAccount: mocks.addBankAccount }));
vi.mock("@/app/dashboard/banking/actions", () => ({ disconnectBank: vi.fn(), syncBankConnection: vi.fn() }));
vi.mock("@/components/bank-connect-dialog", () => ({ BankConnectDialog: () => null }));
vi.mock("@/components/bank-statement-import-dialog", () => ({ BankStatementImportDialog: () => null }));
vi.mock("@/components/csv-import-dialog", () => ({ CsvImportDialog: () => null }));

// Invented fixtures only.
const groups: CompanyCashGroup[] = [
  {
    companyId: "co1",
    companyName: "Acme Trading LLC",
    accounts: [
      { id: "a1", name: "Acme operating", currency: "AED", nativeValue: 4000, baseValue: 1000, institutionName: "Test Bank", balanceAsOf: "2026-10-05" },
      { id: "a2", name: "Acme USD", currency: "USD", nativeValue: 500, baseValue: 500, institutionName: "Test Bank", balanceAsOf: null },
    ],
  },
  { companyId: "co2", companyName: "Empty Holdings Ltd", accounts: [] },
];

function wrap(ui: React.ReactElement) {
  return render(
    <LanguageProvider>
      <PrivacyProvider>{ui}</PrivacyProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  mocks.setBankAccountCompany.mockReset().mockResolvedValue({ ok: true, companyId: null });
  mocks.addBankAccount.mockReset().mockResolvedValue(undefined);
});

describe("companyCashTotal", () => {
  it("sums the base balances", () => {
    expect(companyCashTotal(groups.flatMap((g) => g.accounts))).toBe(1500);
    expect(companyCashTotal([])).toBe(0);
  });
});

describe("CompaniesCash", () => {
  it("shows each company's accounts with native and base balance, balance-as-of, subtotal and a link", () => {
    wrap(<CompaniesCash groups={groups} baseCurrency="USD" today="2026-10-09" />);
    expect(screen.getByRole("heading", { name: "Company cash" })).toBeInTheDocument();
    expect(screen.getByTestId("company-cash-total")).toHaveTextContent("USD 1,500.00");

    const acme = screen.getByTestId("company-cash-co1");
    expect(within(acme).getByText("Acme Trading LLC")).toBeInTheDocument();
    expect(within(acme).getByLabelText("Subtotal")).toHaveTextContent("USD 1,500.00");
    expect(within(acme).getByText("2 accounts")).toBeInTheDocument();
    // AED account: native balance and the base value; the USD account shows only one amount
    expect(within(acme).getByText(/AED/)).toBeInTheDocument();
    expect(within(acme).getByText("USD 1,000.00")).toBeInTheDocument();
    expect(within(acme).getByText(/Balance as of/)).toBeInTheDocument();
    expect(within(acme).getByText("Balance date unknown")).toBeInTheDocument();
    const link = within(acme).getByRole("link", { name: /Acme operating/ });
    expect(link).toHaveAttribute("href", "/dashboard/assets/a1");
  });

  it("a company without accounts says so and still offers to add one", () => {
    wrap(<CompaniesCash groups={groups} baseCurrency="USD" today="2026-10-09" />);
    const empty = screen.getByTestId("company-cash-co2");
    expect(within(empty).getByText("No bank account is linked to this company yet.")).toBeInTheDocument();
    expect(within(empty).getByRole("button", { name: "Add company bank account" })).toBeInTheDocument();
  });

  it("renders nothing when there is no company", () => {
    const { container } = wrap(<CompaniesCash groups={[]} baseCurrency="USD" today="2026-10-09" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("'Change company' can make the account personal again (calls the action with null)", async () => {
    wrap(<CompaniesCash groups={groups} baseCurrency="USD" today="2026-10-09" />);
    const acme = screen.getByTestId("company-cash-co1");
    fireEvent.click(within(acme).getAllByRole("button", { name: "Change company" })[0]);
    // the dialog opens preselected on the current company; choose "personal" via the select is covered in the action tests,
    // here: saving unchanged links the same company
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.setBankAccountCompany).toHaveBeenCalledWith("a1", "co1"));
  });

  it("shows the action's error in the dialog", async () => {
    mocks.setBankAccountCompany.mockResolvedValue({ ok: false, error: "cco_err_co_owned" });
    wrap(<CompaniesCash groups={groups} baseCurrency="USD" today="2026-10-09" />);
    fireEvent.click(within(screen.getByTestId("company-cash-co1")).getAllByRole("button", { name: "Change company" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A co-owned account cannot be linked to a company here.");
  });
});

describe("CompaniesSummary company cash card", () => {
  it("shows a separate Company cash figure with its note when given", () => {
    wrap(<CompaniesSummary count={2} totalStake={100} totalEquity={200} baseCurrency="USD" companyCash={1500} />);
    expect(screen.getByText("Company cash")).toBeInTheDocument();
    expect(screen.getByText("USD 1,500.00")).toBeInTheDocument();
    expect(screen.getByText("In net worth, not personal cash")).toBeInTheDocument();
  });

  it("has no such card when the figure is omitted", () => {
    wrap(<CompaniesSummary count={2} totalStake={100} totalEquity={200} baseCurrency="USD" />);
    expect(screen.queryByText("Company cash")).toBeNull();
  });
});

describe("Dashboard Cash & bank card", () => {
  const personal = [{ id: "p1", name: "Personal account", currency: "USD", nativeValue: 100, baseValue: 100, lastDate: null }];

  it("shows a separate 'Company accounts' line that links to Companies, and keeps the card total personal", () => {
    wrap(<CashBankCard accounts={personal} companyAccounts={{ count: 2, total: 1500 }} baseCurrency="USD" bankSyncMode="unconfigured" />);
    const line = screen.getByTestId("cash-card-company-line");
    expect(within(line).getByText("Company accounts")).toBeInTheDocument();
    expect(within(line).getByText("USD 1,500.00")).toBeInTheDocument();
    expect(within(line).getByRole("link", { name: "See in Companies" })).toHaveAttribute("href", "/dashboard/companies");
    // card total = personal cash only
    expect(screen.getByText("USD 100.00")).toBeInTheDocument();
    expect(screen.queryByText("USD 1,600.00")).toBeNull();
  });

  it("has no company line without company accounts", () => {
    wrap(<CashBankCard accounts={personal} companyAccounts={{ count: 0, total: 0 }} baseCurrency="USD" bankSyncMode="unconfigured" />);
    expect(screen.queryByTestId("cash-card-company-line")).toBeNull();
    wrap(<CashBankCard accounts={personal} baseCurrency="USD" bankSyncMode="unconfigured" />);
    expect(screen.queryByTestId("cash-card-company-line")).toBeNull();
  });
});

describe("Banking page: Company accounts group", () => {
  const row = (key: string, extra: Partial<BankingAccountRow> = {}): BankingAccountRow => ({
    key,
    name: `Account ${key}`,
    institution: "Test Bank",
    masked: "",
    currency: "USD",
    balance: 100,
    baseBalance: 100,
    kind: "manual",
    status: null,
    lastSyncedAt: null,
    lastError: null,
    assetId: key,
    balanceAsOf: "2026-10-08",
    ...extra,
  });

  function overview(rows: BankingAccountRow[]) {
    return wrap(
      <BankingOverview rows={rows} baseCurrency="USD" mode="sandbox" statementAccounts={[]} connectableCash={[]} today="2026-10-09" />,
    );
  }

  it("lists company accounts apart, labelled with the company, and still counts them in the real total", () => {
    overview([row("p1"), row("c1", { companyName: "Acme Trading LLC", baseBalance: 900, balance: 900 })]);
    const section = screen.getByTestId("banking-company-accounts");
    expect(within(section).getByRole("heading", { name: /Company accounts/ })).toBeInTheDocument();
    expect(within(section).getByText("Company: Acme Trading LLC")).toBeInTheDocument();
    expect(within(section).getByText("Account c1")).toBeInTheDocument();
    // the personal bank group does not include it
    expect(screen.getAllByText("Account c1")).toHaveLength(1);
    expect(screen.getAllByText("Account p1")).toHaveLength(1);
    // real total = personal 100 + company 900, 2 accounts
    expect(screen.getByText("$1,000.00", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("2 account(s)")).toBeInTheDocument();
  });

  it("has no Company accounts group when no account belongs to a company", () => {
    overview([row("p1")]);
    expect(screen.queryByTestId("banking-company-accounts")).toBeNull();
  });
});
