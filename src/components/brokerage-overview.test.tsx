import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import { BrokerageOverview } from "@/components/brokerage-overview";
import type { BrokerageHolding } from "@/lib/brokerage-accounts";

vi.mock("@/components/brokerage-holdings-table", () => ({
  BrokerageHoldingsTable: ({ assets }: { assets: { id: string }[] }) => <div data-testid="table">{assets.length} rows</div>,
}));

const holding = (id: string, account: string, value: number, priced?: string): BrokerageHolding => ({
  id,
  name: id,
  quantity: 5,
  current_value: value,
  currency: "USD",
  ticker_symbol: id,
  purchase_date: "2025-01-01",
  metadata: { account_name: account, ...(priced ? { last_priced_at: priced } : {}) },
});

const renderIt = (holdings: BrokerageHolding[]) =>
  render(
    <LanguageProvider>
      <PrivacyProvider>
        <BrokerageOverview holdings={holdings} baseCurrency="USD" rates={{ USD: 1 }} />
      </PrivacyProvider>
    </LanguageProvider>,
  );

describe("BrokerageOverview", () => {
  it("renders one card with its own holdings table per account, plus the grand total", () => {
    renderIt([holding("AAA", "Broker Acc. # 1", 100, "2026-10-05T08:00:00Z"), holding("BBB", "Broker Acc. # 1", 50), holding("CCC", "Other Acc. # 2", 25)]);
    expect(screen.getAllByTestId("brokerage-account")).toHaveLength(2);
    expect(screen.getAllByTestId("table").map((n) => n.textContent)).toEqual(["2 rows", "1 rows"]);
    expect(screen.getByText("$175.00")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
    expect(screen.getByText(/Prices updated/)).toBeInTheDocument();
    expect(screen.getByText("Prices not refreshed yet")).toBeInTheDocument();
  });

  it("shows an empty state with the import hint", () => {
    renderIt([]);
    expect(screen.getByText("No brokerage accounts yet.")).toBeInTheDocument();
    expect(screen.getByText(/Import a broker trade file/)).toBeInTheDocument();
    expect(screen.queryByTestId("brokerage-account")).toBeNull();
  });
});
