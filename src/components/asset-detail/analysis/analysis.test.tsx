import { cloneElement, type ReactElement, type ReactNode } from "react";
import { configure, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssetAnalysis } from "@/components/asset-detail/analysis";
import type { AnalysisAsset, AssetAnalysisProps } from "@/components/asset-detail/analysis/types";
import { TierProvider } from "@/components/tier-provider";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import type { ExpertiseLevel } from "@/stores/useUiTierStore";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) => (
      <div style={{ width: 600, height: 240 }}>{cloneElement(children, { width: 600, height: 240 })}</div>
    ),
  };
});

// Invented fixtures only.
function asset(category: string, over: Partial<AnalysisAsset> = {}): AnalysisAsset {
  return {
    id: "a1",
    name: "Test asset",
    quantity: 10,
    current_value: 10_000,
    currency: "USD",
    is_liability: false,
    metadata: null,
    ticker_symbol: null,
    purchase_date: "2024-01-01",
    asset_categories: { name: category },
    ...over,
  };
}

const HISTORY = [
  { recorded_date: "2024-01-01", value: 9_000, net_equity: 9_000 },
  { recorded_date: "2024-06-01", value: 9_500, net_equity: 9_500 },
  { recorded_date: "2025-01-01", value: 10_000, net_equity: 10_000 },
];

function props(a: AnalysisAsset, over: Partial<AssetAnalysisProps> = {}): AssetAnalysisProps {
  return { asset: a, rawAsset: a, history: HISTORY, transactions: [], ratesFromUsd: { USD: 1, EUR: 0.9 }, ownerFactor: 1, today: "2025-02-01", portfolio: null, ...over };
}

function renderAnalysis(p: AssetAnalysisProps, tier: ExpertiseLevel = "professional", children?: ReactNode) {
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <TierProvider initialTier={tier}>
          <AssetAnalysis {...p} />
          {children}
        </TierProvider>
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

// The views are lazy chunks: on a busy machine (whole suite in parallel) the first dynamic import is slow.
configure({ asyncUtilTimeout: 15000 });
vi.setConfig({ testTimeout: 30000 });

beforeEach(() => localStorage.clear());

const CASES: [string, Partial<AnalysisAsset>, string][] = [
  ["Cash", {}, "analysis-cash"],
  ["Equities", {}, "analysis-equity"],
  ["Crypto", {}, "analysis-crypto"],
  ["Precious Metals", {}, "analysis-metals"],
  ["Vehicles", {}, "analysis-vehicle"],
  ["Real Estate", {}, "analysis-real-estate"],
  ["Private Equity", {}, "analysis-private-equity"],
  ["SCPI", {}, "analysis-scpi"],
  ["Companies", {}, "analysis-company"],
  ["Startups", {}, "analysis-startup"],
  ["Exotic Assets", {}, "analysis-exotic"],
  ["Liabilities", { is_liability: true }, "analysis-liability"],
  ["Assurance-Vie", {}, "analysis-assurance-vie"],
  ["A Category Added Later", {}, "analysis-generic"],
];

describe("AssetAnalysis dispatcher", () => {
  it.each(CASES)("%s renders its own analysis, never the old placeholder and never NaN", async (category, over, testId) => {
    renderAnalysis(props(asset(category, over)));
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
    expect(screen.queryByText(/analysis_unavailable/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("covers every category the app creates plus a fallback", () => {
    expect(CASES.map((c) => c[0])).toEqual(
      expect.arrayContaining(["Cash", "Equities", "Crypto", "Precious Metals", "Vehicles", "Real Estate", "Private Equity", "SCPI", "Companies", "Startups", "Exotic Assets", "Liabilities", "Assurance-Vie"]),
    );
  });
});

describe("Cash analysis", () => {
  const TXS = [
    { booked_date: "2024-12-02", amount: 5000, currency: "USD", description: "Salary", source: "csv", fingerprint: null, created_at: null },
    { booked_date: "2024-12-05", amount: -1500, currency: "USD", description: "Rent December", source: "csv", fingerprint: null, created_at: null },
    { booked_date: "2025-01-03", amount: "-800", currency: "USD", description: "Supermarket", source: "csv", fingerprint: null, created_at: null },
  ];

  it("explains what is missing and how to add it when no statement was imported", async () => {
    renderAnalysis(props(asset("Cash")));
    const empties = await screen.findAllByTestId("analysis-empty");
    expect(empties.some((e) => /No imported transactions/.test(e.textContent ?? ""))).toBe(true);
    expect(screen.getAllByText(/Import a bank statement/).length).toBeGreaterThan(0);
    // no flows card with zeros: the runway only appears once there are outflows to base it on
    expect(screen.queryByTestId("an-cash-runway")).toBeNull();
  });

  it("computes the runway from the imported outflows", async () => {
    // 2 complete months before 2025-02-01 with data: Dec (1500) and Jan (800) -> average 1,150; balance 10,000 -> 8.7 months
    renderAnalysis(props(asset("Cash"), { transactions: TXS }));
    expect(await screen.findByTestId("an-cash-runway")).toHaveTextContent("8.7");
  });

  it("is tier-aware: Standard shows the key cards, Professional adds top spending", async () => {
    const { unmount } = renderAnalysis(props(asset("Cash"), { transactions: TXS }), "standard");
    await screen.findByTestId("an-cash-flows");
    expect(screen.queryByTestId("an-cash-spend")).toBeNull();
    unmount();
    renderAnalysis(props(asset("Cash"), { transactions: TXS }), "professional");
    expect(await screen.findByTestId("an-cash-spend")).toBeInTheDocument();
  });

  it("masks amounts in Privacy Mode", async () => {
    localStorage.setItem("opes_privacy_mode", "true");
    renderAnalysis(props(asset("Cash"), { transactions: TXS }));
    await screen.findByTestId("an-cash-flows");
    expect(document.body.textContent).toContain("••••••••");
    expect(screen.getByTestId("analysis-cash").textContent).not.toMatch(/5,000|10,000/);
  });
});

describe("Equity analysis", () => {
  const md = {
    exchange: "NASDAQ",
    trades: [{ id: "b1", side: "buy", tradeDate: "2024-01-01", quantity: 10, price: 100, currency: "USD", source: "manual" }],
  };

  it("shows performance against cost and the money-weighted return", async () => {
    // 10 shares at 100 = cost 1,000; value 1,200 -> +200 (+20 %)
    renderAnalysis(props(asset("Equities", { quantity: 10, current_value: 1200, metadata: md })));
    const gain = await screen.findByTestId("an-eq-gain");
    expect(gain).toHaveTextContent("20");
    expect(screen.getByTestId("an-eq-xirr-rate")).not.toHaveTextContent("–");
    expect(screen.getByRole("region", { name: "Tax lots" })).toBeInTheDocument();
  });

  it("says why the return is unavailable when no trade is recorded", async () => {
    renderAnalysis(props(asset("Equities", { metadata: { exchange: "NASDAQ", trades: [] } })));
    expect(await screen.findByText(/No trades recorded/)).toBeInTheDocument();
    expect(await screen.findByText(/No buy trades recorded/)).toBeInTheDocument();
  });
});

describe("Vehicle analysis", () => {
  it("draws the Blue Book carried forward and the residual value", async () => {
    const md = { make: "Acme", model: "R", purchase_price: 20_000, blue_book_log: [{ id: "b", date: "2024-06-01", amount: 15_000, currency: "", source: "", document: "" }] };
    renderAnalysis(props(asset("Vehicles", { current_value: 14_000, metadata: md })));
    expect(await screen.findByTestId("bluebook-carried-note")).toBeInTheDocument();
    expect(screen.getByTestId("an-vehicle-residual-pct")).toHaveTextContent("70");
  });
});

describe("Liability and private equity analysis", () => {
  it("projects the payoff of a loan and names the missing input otherwise", async () => {
    const md = { liability_type: "loan", interest_rate: 0, monthly_payment: 500 };
    const { unmount } = renderAnalysis(props(asset("Liabilities", { is_liability: true, current_value: 2000, metadata: md })));
    expect(await screen.findByTestId("an-li-months")).toHaveTextContent("4");
    unmount();
    renderAnalysis(props(asset("Liabilities", { is_liability: true, current_value: 2000, metadata: { liability_type: "loan" } })));
    expect(await screen.findAllByText(/No monthly payment entered/)).not.toHaveLength(0);
  });

  it("shows DPI / RVPI / TVPI for a fund with paid capital", async () => {
    const md = {
      commitment_amount: 100_000,
      capital_calls: [{ id: "c", due_date: "2023-01-01", amount: 50_000, percentage: 50, status: "paid" }],
      distributions: [{ id: "d", date: "2024-01-01", amount: 10_000, kind: "income" }],
    };
    renderAnalysis(props(asset("Private Equity", { current_value: 60_000, metadata: md })));
    expect(await screen.findByTestId("an-pe-dpi")).toHaveTextContent("0.20x");
  });
});
