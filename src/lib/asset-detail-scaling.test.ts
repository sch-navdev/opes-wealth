import { describe, expect, it } from "vitest";
import {
  buildDetailDisplay,
  formatShareLabel,
  isPartialShare,
  realEstateShareFigures,
  normalizeShareFactor,
  toEditPayload,
  viewerShareFactor,
} from "@/lib/asset-detail-scaling";

type Md = Record<string, unknown>;
const vehicle = () => ({
  id: "a1",
  name: "Porsche",
  category_id: "cat-v",
  quantity: 1,
  current_value: 336_000,
  currency: "AED",
  is_liability: false,
  images: null,
  ticker_symbol: null,
  purchase_date: "2024-01-01",
  asset_categories: { name: "Vehicles" } as { name: string } | null,
  metadata: {
    purchase_price: 255_000,
    mileage: 12_000,
    depreciation_annual: -8,
    expenses: [{ id: "x1", date: "2025-02-01", amount: 1_000, category: "maintenance" }],
    blue_book_log: [{ id: "b1", date: "2025-01-01", amount: 338_000, currency: "AED", source: "Argus", document: "" }],
  } as Md | null,
});
const rows = () => [
  { id: "h1", recorded_date: "2024-01-01", value: 255_000, net_equity: 255_000, source: "manual" },
  { id: "h2", recorded_date: "2025-01-01", value: 336_000, net_equity: null, source: "manual" },
];
const pe = () => ({
  ...vehicle(),
  asset_categories: { name: "Private Equity" } as { name: string } | null,
  metadata: { commitment_amount: 100_000, called_capital_manual: 40_000, ownership_percentage: 12, capital_calls: [{ id: "c", amount: 20_000, percentage: 20 }] } as Md | null,
});

describe("buildDetailDisplay", () => {
  it("factor 1 returns the identical data", () => {
    const asset = vehicle();
    const history = rows();
    const out = buildDetailDisplay({ asset, history, factor: 1 });
    expect(out.displayAsset).toBe(asset);
    expect(out.displayHistory).toBe(history);
  });

  it("factor 0.5 halves value, history, blue book, vehicle purchase price and expenses", () => {
    const { displayAsset, displayHistory } = buildDetailDisplay({ asset: vehicle(), history: rows(), factor: 0.5 });
    const md = displayAsset.metadata as Md & { expenses: { amount: number }[]; blue_book_log: { amount: number }[] };
    expect(displayAsset.current_value).toBe(168_000);
    expect(md.purchase_price).toBe(127_500);
    expect(md.expenses[0].amount).toBe(500);
    expect(md.blue_book_log[0].amount).toBe(169_000);
    expect(displayHistory.map((h) => h.value)).toEqual([127_500, 168_000]);
    expect(displayHistory.map((h) => h.net_equity)).toEqual([127_500, null]);
  });

  it("halves the private equity commitment and called capital", () => {
    const { displayAsset } = buildDetailDisplay({ asset: pe(), history: [], factor: 0.5 });
    const md = displayAsset.metadata as Md & { capital_calls: { amount: number }[] };
    expect(md.commitment_amount).toBe(50_000);
    expect(md.called_capital_manual).toBe(20_000);
    expect(md.capital_calls[0].amount).toBe(10_000);
  });

  it("leaves ratios, percentages, dates, ids and text unchanged", () => {
    const { displayAsset, displayHistory } = buildDetailDisplay({ asset: vehicle(), history: rows(), factor: 0.5 });
    const md = displayAsset.metadata as Md & { blue_book_log: Record<string, unknown>[]; expenses: Record<string, unknown>[] };
    expect(md.mileage).toBe(12_000);
    expect(md.depreciation_annual).toBe(-8);
    expect(md.blue_book_log[0]).toMatchObject({ id: "b1", date: "2025-01-01", currency: "AED", source: "Argus" });
    expect(md.expenses[0]).toMatchObject({ id: "x1", date: "2025-02-01", category: "maintenance" });
    expect(displayAsset).toMatchObject({ id: "a1", name: "Porsche", currency: "AED", purchase_date: "2024-01-01", quantity: 1 });
    expect(displayHistory.map((h) => h.recorded_date)).toEqual(["2024-01-01", "2025-01-01"]);
    const peOut = buildDetailDisplay({ asset: pe(), history: [], factor: 0.5 }).displayAsset.metadata as Md & { capital_calls: Record<string, unknown>[] };
    expect(peOut.ownership_percentage).toBe(12);
    expect(peOut.capital_calls[0].percentage).toBe(20);
  });

  it("does not mutate its inputs: the raw asset keeps its 100% values", () => {
    const asset = vehicle();
    const history = rows();
    buildDetailDisplay({ asset, history, factor: 0.5 });
    expect(asset).toEqual(vehicle());
    expect(history).toEqual(rows());
    expect(asset.current_value).toBe(336_000);
    expect((asset.metadata as Md).purchase_price).toBe(255_000);
  });

  it("falls back to the whole asset for an unusable factor", () => {
    for (const f of [0, -1, 1.5, Number.NaN]) {
      const asset = vehicle();
      expect(buildDetailDisplay({ asset, history: [], factor: f }).displayAsset).toBe(asset);
    }
  });
});

describe("viewerShareFactor / normalizeShareFactor", () => {
  it("uses the owner share, defaulting to 1 when unusable", () => {
    expect(viewerShareFactor({ factor: 0.5 })).toBe(0.5);
    expect(viewerShareFactor({ factor: 0.25 })).toBe(0.25);
    expect(viewerShareFactor({ factor: 0 })).toBe(1);
    expect(normalizeShareFactor(undefined)).toBe(1);
    expect(normalizeShareFactor(null)).toBe(1);
  });
});

describe("formatShareLabel / isPartialShare", () => {
  it("formats percentages without trailing zeros", () => {
    expect(formatShareLabel(0.5)).toBe("50");
    expect(formatShareLabel(1 / 3)).toBe("33.33");
    expect(formatShareLabel(0.6)).toBe("60");
    expect(formatShareLabel(1)).toBe("100");
  });
  it("is partial only below 100%", () => {
    expect(isPartialShare(0.5)).toBe(true);
    expect(isPartialShare(1)).toBe(false);
    expect(isPartialShare(0)).toBe(false);
  });
});

describe("write path regression (scaled-edit bug)", () => {
  it("the edit dialog payload carries the raw whole-asset values, not the displayed share", () => {
    const raw = vehicle();
    const { displayAsset } = buildDetailDisplay({ asset: raw, history: rows(), factor: 0.5 });
    expect(displayAsset.current_value).toBe(168_000); // what the page shows

    const payload = toEditPayload(raw); // what the dialog prefills and saves
    expect(payload.current_value).toBe(336_000);
    expect((payload.metadata as Md).purchase_price).toBe(255_000);
    expect(((payload.metadata as Md).expenses as { amount: number }[])[0].amount).toBe(1_000);
    expect(((payload.metadata as Md).blue_book_log as { amount: number }[])[0].amount).toBe(338_000);
    expect(payload.metadata).toBe(raw.metadata);
  });

  it("only passes the dialog's own fields", () => {
    expect(Object.keys(toEditPayload(vehicle())).sort()).toEqual(
      ["category_id", "currency", "current_value", "id", "images", "metadata", "name", "purchase_date", "quantity", "ticker_symbol"],
    );
  });
});

describe("realEstateShareFigures", () => {
  const base = { marketValuation: 1_000_000, netEquity: 400_000, surfaceArea: 100 };
  it("sole owner keeps the legacy behaviour", () => {
    expect(realEstateShareFigures({ ...base, factor: 1, legacyPercent: 100 })).toEqual({
      ownershipPercent: 100, grossShare: 1_000_000, netShare: 400_000, valuePerSqm: 10_000,
    });
    expect(realEstateShareFigures({ ...base, factor: 1, legacyPercent: 50 })).toMatchObject({
      ownershipPercent: 50, grossShare: 500_000, netShare: 200_000, valuePerSqm: 10_000,
    });
  });
  it("co-owner at 50% with the default legacy percent: label and amount agree, price per m2 is whole-property", () => {
    const out = realEstateShareFigures({ marketValuation: 500_000, netEquity: 200_000, surfaceArea: 100, factor: 0.5, legacyPercent: 100 });
    expect(out).toEqual({ ownershipPercent: 50, grossShare: 500_000, netShare: 200_000, valuePerSqm: 10_000 });
  });
  it("does not compound a legacy 50% with the co-ownership share", () => {
    const out = realEstateShareFigures({ marketValuation: 500_000, netEquity: 200_000, surfaceArea: 100, factor: 0.5, legacyPercent: 50 });
    expect(out.ownershipPercent).toBe(50);
    expect(out.grossShare).toBe(500_000);
    expect(out.netShare).toBe(200_000);
  });
  it("no surface area gives no price per m2", () => {
    expect(realEstateShareFigures({ ...base, factor: 1, legacyPercent: 100, surfaceArea: null }).valuePerSqm).toBeNull();
  });
});
