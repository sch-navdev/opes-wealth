import { describe, expect, it } from "vitest";
import { buildAssetInvested } from "@/lib/invested-capital";

type Asset = Parameters<typeof buildAssetInvested>[0];
const asset = (over: Partial<Asset>): Asset => ({
  category: "Cash",
  purchase_date: "2024-01-01",
  metadata: null,
  current_value: 1000,
  ...over,
});

describe("buildAssetInvested: categories without cost data", () => {
  it.each(["Cash", "Crypto", "Precious Metals", "Private Equity", "Startups", "Companies", "Unknown"])(
    "%s has no invested series",
    (category) => {
      expect(buildAssetInvested(asset({ category }))).toBeUndefined();
    },
  );
});

describe("buildAssetInvested: Equities", () => {
  const trades = (list: unknown[]) => ({ trades: list });
  const t = (tradeDate: string, side: "buy" | "sell", quantity: number, price: number) => ({
    id: `${tradeDate}-${side}`,
    tradeDate,
    side,
    quantity,
    price,
    currency: "USD",
    source: "manual",
  });

  it("is the cost basis of the position still held, per trade date", () => {
    const series = buildAssetInvested(
      asset({
        category: "Equities",
        metadata: trades([t("2024-01-01", "buy", 10, 10), t("2024-02-01", "buy", 10, 20), t("2024-03-01", "sell", 10, 99)]),
      }),
    );
    expect(series).toEqual([
      ["2024-01-01", 100],
      ["2024-02-01", 300],
      ["2024-03-01", 150],
    ]);
  });

  it("undefined when there are no trades or the metadata is empty/garbage", () => {
    expect(buildAssetInvested(asset({ category: "Equities", metadata: trades([]) }))).toBeUndefined();
    expect(buildAssetInvested(asset({ category: "Equities", metadata: null }))).toBeUndefined();
    expect(buildAssetInvested(asset({ category: "Equities", metadata: "junk" }))).toBeUndefined();
  });

  it("does not depend on the asset's purchase date", () => {
    const series = buildAssetInvested(asset({ category: "Equities", purchase_date: null, metadata: trades([t("2024-05-05", "buy", 1, 7)]) }));
    expect(series).toEqual([["2024-05-05", 7]]);
  });
});

describe("buildAssetInvested: Real Estate (completed)", () => {
  it("down payment + fees: price + fees - loan, dated on the purchase date", () => {
    const series = buildAssetInvested(
      asset({
        category: "Real Estate",
        purchase_date: "2023-03-10",
        current_value: 900000,
        metadata: { purchasePrice: 500000, agencyFees: 10000, registration_fee_amount: 20000, linked_loan: { amount: 400000 } },
      }),
    );
    expect(series).toEqual([["2023-03-10", 130000]]); // 530000 - 400000
  });

  it("a contract price wins over the purchase price", () => {
    const series = buildAssetInvested(
      asset({ category: "Real Estate", metadata: { contract_price: 600000, purchasePrice: 500000 } }),
    );
    expect(series).toEqual([["2024-01-01", 600000]]);
  });

  it("without a price, the market valuation (then the current value) stands in for the base cost", () => {
    expect(buildAssetInvested(asset({ category: "Real Estate", current_value: 300000, metadata: {} }))).toEqual([["2024-01-01", 300000]]);
    expect(buildAssetInvested(asset({ category: "Real Estate", current_value: 300000, metadata: { market_valuation: 350000 } }))).toEqual([
      ["2024-01-01", 350000],
    ]);
  });

  it("a loan larger than the all-in cost never produces a negative investment", () => {
    const series = buildAssetInvested(
      asset({ category: "Real Estate", metadata: { purchasePrice: 100000, linked_loan: { amount: 150000 } } }),
    );
    expect(series).toEqual([["2024-01-01", 0]]);
  });

  it("undefined without a purchase date", () => {
    expect(buildAssetInvested(asset({ category: "Real Estate", purchase_date: null, metadata: { purchasePrice: 1 } }))).toBeUndefined();
  });

  it("loan principal repaid later is not added back (the series is a single point)", () => {
    const series = buildAssetInvested(
      asset({ category: "Real Estate", metadata: { purchasePrice: 500000, linked_loan: { amount: 400000, outstanding_principal: 100000 } } }),
    );
    expect(series).toHaveLength(1);
    expect(series?.[0][1]).toBe(100000);
  });
});

describe("buildAssetInvested: Real Estate (off-plan)", () => {
  const milestone = (due_date: string, amount: number, status: "paid" | "pending") => ({
    id: due_date,
    milestone: "m",
    due_date,
    amount,
    percentage: 0,
    status,
  });

  it("starts with the up-front fees, then steps up by each paid installment on its due date", () => {
    const series = buildAssetInvested(
      asset({
        category: "Real Estate",
        metadata: {
          is_offplan: true,
          agencyFees: 5000,
          payment_schedule: [
            milestone("2025-01-01", 10000, "paid"),
            milestone("2024-06-01", 20000, "paid"),
            milestone("2026-01-01", 30000, "pending"),
          ],
        },
      }),
    );
    expect(series).toEqual([
      ["2024-06-01", 5000],
      ["2024-06-01", 25000],
      ["2025-01-01", 35000],
    ]);
  });

  it("pending installments never add to the invested amount", () => {
    const series = buildAssetInvested(
      asset({ category: "Real Estate", metadata: { is_offplan: true, payment_schedule: [milestone("2025-01-01", 10000, "pending")] } }),
    );
    expect(series).toEqual([["2025-01-01", 0]]);
  });

  it("the last point equals the total paid plus fees", () => {
    const series = buildAssetInvested(
      asset({
        category: "Real Estate",
        metadata: {
          is_offplan: true,
          registration_fee_amount: 2000,
          payment_schedule: [milestone("2024-01-01", 10000, "paid"), milestone("2024-07-01", 15000, "paid")],
        },
      }),
    );
    expect(series?.[series.length - 1][1]).toBe(27000);
  });

  it("ignores milestones without a due date", () => {
    const series = buildAssetInvested(
      asset({
        category: "Real Estate",
        purchase_date: "2024-02-02",
        metadata: { is_offplan: true, agencyFees: 1000, paid_to_date: 4000, payment_schedule: [milestone("", 5000, "paid")] },
      }),
    );
    // No usable schedule: falls back to the single paid-to-date + fees point.
    expect(series).toEqual([["2024-02-02", 5000]]);
  });

  it("with no schedule: paid-to-date + fees on the purchase date", () => {
    const series = buildAssetInvested(
      asset({ category: "Real Estate", purchase_date: "2024-02-02", metadata: { is_offplan: true, paid_to_date: 20000, agencyFees: 1000 } }),
    );
    expect(series).toEqual([["2024-02-02", 21000]]);
  });

  it("with no schedule and no purchase date: undefined", () => {
    expect(buildAssetInvested(asset({ category: "Real Estate", purchase_date: null, metadata: { is_offplan: true, paid_to_date: 20000 } }))).toBeUndefined();
  });
});

describe("buildAssetInvested: SCPI", () => {
  it("shares x subscription price on the purchase date", () => {
    expect(
      buildAssetInvested(asset({ category: "SCPI", quantity: 50, metadata: { subscription_price: 200, entry_fee_pct: 10 } })),
    ).toEqual([["2024-01-01", 10000]]);
  });

  it("undefined without shares, a price, or a purchase date", () => {
    expect(buildAssetInvested(asset({ category: "SCPI", metadata: { subscription_price: 200 } }))).toBeUndefined(); // quantity omitted -> 0
    expect(buildAssetInvested(asset({ category: "SCPI", quantity: 0, metadata: { subscription_price: 200 } }))).toBeUndefined();
    expect(buildAssetInvested(asset({ category: "SCPI", quantity: 50, metadata: {} }))).toBeUndefined();
    expect(buildAssetInvested(asset({ category: "SCPI", quantity: 50, purchase_date: null, metadata: { subscription_price: 200 } }))).toBeUndefined();
  });
});

describe("buildAssetInvested: Vehicles", () => {
  it("purchase price plus every ownership cost, on the purchase date", () => {
    const series = buildAssetInvested(
      asset({
        category: "Vehicles",
        purchase_date: "2022-08-01",
        metadata: {
          purchase_price: 40000,
          maintenance_costs: 1000,
          modifications: 500,
          insurance_registration: 250,
          expenses: [{ id: "e", date: "2023-01-01", category: "fuel", description: "", amount: 750 }],
        },
      }),
    );
    expect(series).toEqual([["2022-08-01", 42500]]);
  });

  it("just the price when there are no other costs", () => {
    expect(buildAssetInvested(asset({ category: "Vehicles", metadata: { purchase_price: 15000 } }))).toEqual([["2024-01-01", 15000]]);
  });

  it("undefined with no (or zero / negative) purchase price, or no purchase date", () => {
    expect(buildAssetInvested(asset({ category: "Vehicles", metadata: {} }))).toBeUndefined();
    expect(buildAssetInvested(asset({ category: "Vehicles", metadata: { purchase_price: 0 } }))).toBeUndefined();
    expect(buildAssetInvested(asset({ category: "Vehicles", metadata: { purchase_price: -5 } }))).toBeUndefined();
    expect(buildAssetInvested(asset({ category: "Vehicles", purchase_date: null, metadata: { purchase_price: 15000 } }))).toBeUndefined();
  });
});
