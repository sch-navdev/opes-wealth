import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildPortfolioWorkbook,
  type ExportAsset,
  type ExportHistoryRow,
} from "@/lib/portfolio-export";

// buildPortfolioWorkbook is pure (no DOM / network / DB): it returns the .xlsx bytes, which are
// read back here with SheetJS and checked cell by cell.

type Cell = Record<string, string | number | boolean>;

const asset = (patch: Partial<ExportAsset> & { id: string; name: string; category: string | null }): ExportAsset => {
  const { category, ...rest } = patch;
  return {
    category_id: "cat",
    quantity: 1,
    current_value: 0,
    currency: "USD",
    is_liability: false,
    metadata: {},
    ticker_symbol: null,
    purchase_date: "2020-01-01",
    asset_categories: category ? { name: category } : null,
    ...rest,
  };
};

const rates = { USD: 1, AED: 4, EUR: 0.5 };

function build(assets: ExportAsset[], history: ExportHistoryRow[] = [], baseCurrency = "USD") {
  const buf = buildPortfolioWorkbook({ assets, history, baseCurrency, rates, today: "2025-06-15", ownerName: "Jane Doe" });
  return XLSX.read(buf, { type: "buffer" });
}

const rows = (wb: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<Cell>(wb.Sheets[name]);
const summary = (wb: XLSX.WorkBook) => Object.fromEntries(rows(wb, "Summary").map((r) => [r.Item, r.Value]));

const cash = asset({ id: "c", name: "Savings", category: "Cash", current_value: 1000 });
const home = asset({
  id: "re",
  name: "Marina Flat",
  category: "Real Estate",
  currency: "AED",
  current_value: 400_000, // equity: market value minus the loan
  metadata: {
    market_valuation: 1_000_000,
    purchasePrice: 900_000,
    agencyFees: 20_000,
    linked_loan: { lender_name: "ENBD", amount: 600_000, outstanding_principal: 600_000, interest_rate: 4 },
  },
});
const card = asset({
  id: "l",
  name: "Car loan",
  category: "Liabilities",
  is_liability: true,
  current_value: 5_000,
  metadata: { liability_type: "loan", lender_name: "Mashreq" },
});
const stock = asset({
  id: "e",
  name: "Apple",
  category: "Equities",
  currency: "EUR",
  current_value: 2_000,
  ticker_symbol: "AAPL",
  quantity: 10,
  metadata: { exchange: "NASDAQ" },
});

describe("buildPortfolioWorkbook", () => {
  it("returns a readable xlsx buffer", () => {
    const buf = buildPortfolioWorkbook({ assets: [cash], history: [], baseCurrency: "USD", rates, today: "2025-06-15", ownerName: "J" });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(100);
    expect(XLSX.read(buf, { type: "buffer" }).SheetNames).toContain("Summary");
  });

  it("still produces Summary and Assets sheets for an empty portfolio, with zero totals", () => {
    const wb = build([]);
    expect(wb.SheetNames).toEqual(["Summary", "Assets"]);
    const s = summary(wb);
    expect(s["Total assets"]).toBe(0);
    expect(s["Total liabilities"]).toBe(0);
    expect(s["Net worth"]).toBe(0);
    expect(rows(wb, "Assets")).toEqual([]);
  });

  it("only emits sheets that have rows", () => {
    expect(build([cash]).SheetNames).toEqual(["Summary", "Assets"]);
    const full = build([cash, home, card, stock], [{ asset_id: "c", recorded_date: "2025-01-01", value: 1, net_equity: null }]);
    expect(full.SheetNames).toEqual(["Summary", "Assets", "Liabilities", "Real Estate", "Brokerage", "Valuation History"]);
  });

  describe("Summary", () => {
    const wb = build([cash, home, card, stock]);
    const s = summary(wb);

    it("records owner, date and base currency", () => {
      expect(s.Owner).toBe("Jane Doe");
      expect(s["Generated on"]).toBe("2025-06-15");
      expect(s["Base currency"]).toBe("USD");
    });

    it("converts every asset into the base currency and splits assets from liabilities", () => {
      // assets: 1000 + 1,000,000 AED / 4 + 2000 EUR / 0.5 ; liabilities: 600,000 AED / 4 + 5000
      expect(s["Total assets"]).toBe(1_000 + 250_000 + 4_000);
      expect(s["Total liabilities"]).toBe(150_000 + 5_000);
      expect(s["Net worth"]).toBe(100_000);
    });

    it("net worth equals the sum of the per-category net lines", () => {
      const perCategory = Object.entries(s)
        .filter(([k]) => k.startsWith("Net — "))
        .reduce((sum, [, v]) => sum + (v as number), 0);
      expect(perCategory).toBe(s["Net worth"]);
      expect(s["Net — Real Estate"]).toBe(100_000);
      expect(s["Net — Liabilities"]).toBe(-5_000);
      expect(s["Net — Equities"]).toBe(4_000);
      expect(s["Net — Cash"]).toBe(1_000);
    });
  });

  describe("Assets sheet", () => {
    const wb = build([cash, home, card, stock]);
    const r = Object.fromEntries(rows(wb, "Assets").map((x) => [x.Name, x]));

    it("splits Real Estate into gross market value, outstanding debt and net equity", () => {
      expect(r["Marina Flat"]["Gross value"]).toBe(1_000_000);
      expect(r["Marina Flat"]["Debt / owed"]).toBe(600_000);
      expect(r["Marina Flat"]["Net value"]).toBe(400_000);
      expect(r["Marina Flat"]["Net value (USD)"]).toBe(100_000);
    });

    it("shows a standalone liability as debt with a negative net value and no gross value", () => {
      expect(r["Car loan"]["Gross value"]).toBe(0);
      expect(r["Car loan"]["Debt / owed"]).toBe(5_000);
      expect(r["Car loan"]["Net value"]).toBe(-5_000);
    });

    it("keeps the asset's own currency and writes numbers as numeric cells", () => {
      expect(r.Apple.Currency).toBe("EUR");
      expect(r.Apple["Net value"]).toBe(2_000);
      expect(r.Apple["Net value (USD)"]).toBe(4_000);
      expect(typeof r.Apple.Quantity).toBe("number");
      expect(r.Apple.Ticker).toBe("AAPL");
    });

    it("labels the base-currency column with the chosen base currency", () => {
      const eur = build([home], [], "EUR");
      const [row] = rows(eur, "Assets");
      expect(Object.keys(row)).toContain("Net value (EUR)");
      // AED 400,000 equity -> EUR: / 4 * 0.5
      expect(row["Net value (EUR)"]).toBe(50_000);
    });

    it("rounds displayed cells to cents", () => {
      const wb2 = build([asset({ id: "x", name: "Odd", category: "Cash", currency: "AED", current_value: 100.005 })]);
      const [row] = rows(wb2, "Assets");
      expect(row["Gross value"]).toBeCloseTo(100.01, 2);
      expect(row["Net value (USD)"]).toBe(25);
    });
  });

  describe("category fallback", () => {
    it("uses an em dash for assets without a category", () => {
      const wb = build([asset({ id: "u", name: "Mystery", category: null, current_value: 5 })]);
      expect(rows(wb, "Assets")[0].Category).toBe("—");
      expect(summary(wb)["Net — —"]).toBe(5);
    });
  });

  describe("Liabilities sheet", () => {
    it("lists every source of debt with its type and lender, in own and base currency", () => {
      const offplan = asset({
        id: "op",
        name: "Off-plan Tower",
        category: "Real Estate",
        current_value: 200_000,
        metadata: { is_offplan: true, market_valuation: 500_000, outstanding_balance: 300_000 },
      });
      const fund = asset({
        id: "pe",
        name: "Growth Fund",
        category: "Private Equity",
        current_value: 1_000,
        metadata: {
          manager: "Altaroc",
          capital_calls: [
            { id: "1", due_date: "2025-09-01", amount: 100, percentage: 10, status: "pending" },
            { id: "2", due_date: "2024-09-01", amount: 300, percentage: 30, status: "paid" },
          ],
        },
      });
      const wb = build([cash, home, card, offplan, fund]);
      const byName = Object.fromEntries(rows(wb, "Liabilities").map((x) => [x.Name, x]));
      expect(Object.keys(byName).sort()).toEqual(["Car loan", "Growth Fund", "Marina Flat", "Off-plan Tower"]);
      expect(byName["Car loan"]).toMatchObject({ Type: "loan", "Lender / detail": "Mashreq", "Amount owed": 5_000 });
      expect(byName["Marina Flat"]).toMatchObject({ Type: "Property loan", "Lender / detail": "ENBD", Currency: "AED", "Amount owed": 600_000, "Amount owed (USD)": 150_000 });
      expect(byName["Off-plan Tower"]).toMatchObject({ Type: "Off-plan balance", "Amount owed": 300_000 });
      expect(byName["Growth Fund"]).toMatchObject({ Type: "Pending capital calls", "Lender / detail": "Altaroc", "Amount owed": 100 });
    });

    it("omits assets that owe nothing", () => {
      const wb = build([cash, stock]);
      expect(wb.SheetNames).not.toContain("Liabilities");
    });
  });

  describe("Real Estate sheet", () => {
    it("reports market value, all-in cost (price + fees), unrealized gain and debt", () => {
      const wb = build([home]);
      const [r] = rows(wb, "Real Estate");
      expect(r["Market value"]).toBe(1_000_000);
      expect(r["Total cost (incl. fees)"]).toBe(920_000);
      expect(r["Unrealized gain"]).toBe(80_000);
      expect(r["Off-plan"]).toBe(false);
      expect(r["Outstanding developer balance"]).toBe(0);
      expect(r["Outstanding debt"]).toBe(600_000);
      expect(r["Loan lender"]).toBe("ENBD");
      expect(r["Loan amount"]).toBe(600_000);
      expect(r["Loan rate %"]).toBe(4);
    });

    it("picks the annual rent from the contract active on the export date", () => {
      const rented = asset({
        id: "r",
        name: "Rented",
        category: "Real Estate",
        current_value: 100,
        metadata: {
          market_valuation: 100,
          tenancy_contracts: [
            { id: "1", tenant_name: "A", start_date: "2024-01-01", end_date: "2024-12-31", annual_rent: 10_000, contract_value: null, imported_from_file: "", uploaded_at: "" },
            { id: "2", tenant_name: "B", start_date: "2025-01-01", end_date: "2025-12-31", annual_rent: 12_000, contract_value: null, imported_from_file: "", uploaded_at: "" },
          ],
        },
      });
      const [r] = rows(build([rented]), "Real Estate");
      expect(r["Annual rent (active contract)"]).toBe(12_000);
    });

    it("an off-plan unit shows its developer balance; a zero cost basis does not blow up", () => {
      const op = asset({
        id: "op",
        name: "Tower",
        category: "Real Estate",
        current_value: 0,
        metadata: { is_offplan: true, market_valuation: 0, outstanding_balance: 250 },
      });
      const [r] = rows(build([op]), "Real Estate");
      expect(r["Outstanding developer balance"]).toBe(250);
      expect(r["Off-plan"]).toBe(true);
      expect(Number.isFinite(r["Unrealized gain"] as number)).toBe(true);
    });
  });

  describe("Brokerage sheet", () => {
    it("lists equities with value in own and base currency", () => {
      const [r] = rows(build([stock]), "Brokerage");
      expect(r).toMatchObject({ Name: "Apple", Ticker: "AAPL", Exchange: "NASDAQ", Quantity: 10, Currency: "EUR", Value: 2_000, "Value (USD)": 4_000, "Income received": 0 });
    });
  });

  describe("REIT (SCPI) and Private Equity sheets", () => {
    const scpi = asset({
      id: "s",
      name: "Corum",
      category: "SCPI",
      currency: "EUR",
      quantity: 10,
      current_value: 900,
      metadata: {
        subscription_price: 100,
        entry_fee_pct: 10,
        dividends: [
          { id: "d1", date: "2025-04-01", amount: 20, status: "received", quarter: "T1 2025" },
          { id: "d2", date: "2025-01-01", amount: 15, status: "received", quarter: "T4 2024" },
        ],
      },
    });
    const pe = asset({
      id: "p",
      name: "Fund I",
      category: "Private Equity",
      current_value: 800,
      metadata: {
        manager: "Altaroc",
        commitment_amount: 1_000,
        capital_calls: [
          { id: "1", due_date: "2025-03-01", amount: 300, percentage: 30, status: "paid" },
          { id: "2", due_date: "2025-09-01", amount: 200, percentage: 20, status: "pending" },
        ],
        projected_distributions: [{ id: "x", due_date: "2026-01-01", amount: 50 }],
      },
    });

    it("writes REIT rows and one dividend row per payment", () => {
      const wb = build([scpi]);
      const [r] = rows(wb, "REIT");
      expect(r).toMatchObject({ Name: "Corum", Shares: 10, "Capital invested": 1_000, "Entry fees paid": 100, "Current value": 900, "Dividends received": 35 });
      expect(rows(wb, "REIT Dividends")).toHaveLength(2);
    });

    it("writes Private Equity rows and a date-ordered cash-flow sheet (calls negative)", () => {
      const wb = build([pe]);
      const [r] = rows(wb, "Private Equity");
      expect(r).toMatchObject({ Name: "Fund I", Manager: "Altaroc", Commitment: 1_000, "Called capital": 300, "Unfunded commitment": 700, NAV: 800, "Pending calls (liability)": 200 });
      const flows = rows(wb, "PE Cash Flows");
      expect(flows.map((f) => f.Date)).toEqual(["2025-03-01", "2025-09-01", "2026-01-01"]);
      expect(flows.map((f) => f.Amount)).toEqual([-300, -200, 50]);
      expect(flows[2].Type).toBe("Projected distribution");
    });
  });

  describe("Companies sheet", () => {
    it("shows the company stake and how it is held", () => {
      const co = asset({
        id: "co",
        name: "Acme FZE",
        category: "Companies",
        current_value: 500,
        metadata: { legal_name: "Acme FZE LLC", held_via: "holding", holding_name: "Opes Holdings", ownership_percentage: 50, company_value: 1_000 },
      });
      const [r] = rows(build([co]), "Companies");
      expect(r).toMatchObject({ Name: "Acme FZE", "Legal name": "Acme FZE LLC", "Held via": "Holding (Opes Holdings)", "Ownership %": 50, "Equity value (100%)": 1_000, "Your stake": 500 });
    });
  });

  describe("Assurance-Vie sheet", () => {
    it("writes the contract, allocation and premium summary", () => {
      const av = asset({
        id: "av",
        name: "My AV",
        category: "Assurance-Vie",
        currency: "EUR",
        current_value: 1_000,
        metadata: {
          insurer: "Insurer X",
          opened_on: "2018-03-01",
          household: "couple",
          euro_fund_pct: 70,
          uc_pct: 30,
          deposit_type: "scheduled",
          scheduled_amount: 100,
          scheduled_frequency: "monthly",
          scheduled_day: 5,
          premiums_paid_total: 800,
        },
      });
      const [r] = rows(build([av]), "Assurance-Vie");
      expect(r).toMatchObject({
        Name: "My AV",
        Insurer: "Insurer X",
        "Opened on": "2018-03-01",
        Household: "Couple (joint)",
        "Euro fund %": 70,
        "Unit-linked %": 30,
        "Deposit type": "Scheduled",
        "Premiums paid": 800,
        "Scheduled per year": 1_200,
        "Contract value": 1_000,
      });
    });
    it("is omitted when there is no Assurance-Vie asset", () => {
      expect(build([cash]).SheetNames).not.toContain("Assurance-Vie");
    });
  });

  describe("Valuation History sheet", () => {
    const history: ExportHistoryRow[] = [
      { asset_id: "e", recorded_date: "2025-02-01", value: 10, net_equity: null },
      { asset_id: "c", recorded_date: "2025-02-01", value: 20, net_equity: 18 },
      { asset_id: "c", recorded_date: "2024-12-31", value: 30, net_equity: 0 },
      { asset_id: "ghost", recorded_date: "2025-03-01", value: 99, net_equity: 99 },
    ];

    it("sorts by date then asset name, drops rows for unknown assets and falls back to value for net value", () => {
      const out = rows(build([cash, stock], history), "Valuation History");
      expect(out.map((r) => [r.Date, r.Asset])).toEqual([
        ["2024-12-31", "Savings"],
        ["2025-02-01", "Apple"],
        ["2025-02-01", "Savings"],
      ]);
      expect(out[1]["Net value"]).toBe(10);
      expect(out[2]["Net value"]).toBe(18);
    });

    it("keeps a legitimate net equity of 0 rather than substituting the value", () => {
      const out = rows(build([cash, stock], history), "Valuation History");
      expect(out[0].Value).toBe(30);
      expect(out[0]["Net value"]).toBe(0);
    });

    it("is omitted when no history row matches an asset", () => {
      expect(build([cash], [{ asset_id: "nope", recorded_date: "2025-01-01", value: 1, net_equity: 1 }]).SheetNames).not.toContain("Valuation History");
    });
  });
});
