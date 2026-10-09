import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";

const equities = [
  { id: "e1", profile_id: "u1", name: "AAA", quantity: 2, current_value: 40, currency: "USD", is_liability: false, metadata: { account_name: "Broker Acc. # 1" }, ticker_symbol: "AAA", purchase_date: "2025-01-01", asset_categories: { name: "Equities" } },
];

// Minimal chainable query: every builder method returns itself; awaiting resolves per table.
function builder(table: string) {
  const result =
    table === "assets"
      ? { data: equities }
      : table === "asset_categories"
        ? { data: { id: "cat" } }
        : table === "profiles"
          ? { data: { default_currency: "USD" } }
          : { data: [] };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "returns"]) q[m] = () => q;
  q.single = () => Promise.resolve(result);
  q.maybeSingle = () => Promise.resolve(result);
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, from: builder }),
}));
vi.mock("@/utils/supabase/mfa", () => ({ needsMfaStepUp: async () => false }));
vi.mock("@/utils/supabase/mock-auth", () => ({ isMockAuthEnabled: () => false, getMockUserId: () => null, createMockAdminClient: () => null }));
vi.mock("@/lib/fx", async (orig) => ({ ...(await orig<typeof import("@/lib/fx")>()), getExchangeRatesFromUsd: async () => ({ USD: 1 }) }));
vi.mock("@/components/brokerage-holdings-table", () => ({
  BrokerageHoldingsTable: ({ assets }: { assets: { name: string }[] }) => <div data-testid="table">{assets.map((a) => a.name).join(",")}</div>,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

describe("Brokerage page", () => {
  it("lists the Equities holdings grouped by account", async () => {
    const { default: BrokeragePage } = await import("./page");
    const ui = await BrokeragePage({ searchParams: Promise.resolve({}) });
    render(
      <LanguageProvider>
        <PrivacyProvider>{ui}</PrivacyProvider>
      </LanguageProvider>,
    );
    expect(screen.getByRole("heading", { name: "Brokerage" })).toBeInTheDocument();
    expect(screen.getByText("Broker Acc. # 1")).toBeInTheDocument();
    expect(screen.getByTestId("table")).toHaveTextContent("AAA");
  });
});
