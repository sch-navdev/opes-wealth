import { describe, expect, it } from "vitest";
import {
  EMPTY_STARTUP_METADATA,
  getFundingRoundErrors,
  getStartupMetadataErrors,
  latestRound,
  parseStartupMetadata,
  sortedRounds,
  startupCostBasis,
  startupRoundHistory,
  startupValuation,
  type FundingRound,
  type StartupMetadata,
} from "@/lib/startups";

const round = (date: string, price: number, name = date): FundingRound => ({
  id: `r-${date}`,
  date,
  name,
  price_per_share: price,
  post_money_valuation: null,
});

const meta = (over: Partial<StartupMetadata> = {}): StartupMetadata => ({
  ...EMPTY_STARTUP_METADATA,
  company_name: "Acme",
  avg_cost_per_share: 2,
  ...over,
});

describe("parseStartupMetadata", () => {
  it("returns the defaults for null, arrays and primitives", () => {
    expect(parseStartupMetadata(null)).toEqual(EMPTY_STARTUP_METADATA);
    expect(parseStartupMetadata([])).toEqual(EMPTY_STARTUP_METADATA);
    expect(parseStartupMetadata("x")).toEqual(EMPTY_STARTUP_METADATA);
  });

  it("merges stored fields and repairs a non-array funding_rounds", () => {
    const p = parseStartupMetadata({ company_name: "Acme", funding_rounds: "oops" });
    expect(p.company_name).toBe("Acme");
    expect(p.funding_rounds).toEqual([]);
    expect(p.investment_type).toBe("direct_equity");
  });

  it("keeps a valid funding_rounds array", () => {
    const rounds = [round("2024-01-01", 3)];
    expect(parseStartupMetadata({ funding_rounds: rounds }).funding_rounds).toEqual(rounds);
  });
});

describe("getStartupMetadataErrors", () => {
  it("no errors for a valid holding", () => {
    expect(getStartupMetadataErrors(meta(), 100)).toEqual([]);
  });

  it("requires a company name and positive shares", () => {
    expect(getStartupMetadataErrors(meta({ company_name: "  " }), 100)).toContain("startup_company_required");
    expect(getStartupMetadataErrors(meta(), 0)).toContain("startup_shares_required");
    expect(getStartupMetadataErrors(meta(), -5)).toContain("startup_shares_required");
    expect(getStartupMetadataErrors(meta(), NaN)).toContain("startup_shares_required");
  });

  it("cost may be null or zero but not negative", () => {
    expect(getStartupMetadataErrors(meta({ avg_cost_per_share: null }), 1)).toEqual([]);
    expect(getStartupMetadataErrors(meta({ avg_cost_per_share: 0 }), 1)).toEqual([]);
    expect(getStartupMetadataErrors(meta({ avg_cost_per_share: -0.01 }), 1)).toContain("startup_cost_invalid");
  });
});

describe("sortedRounds / latestRound", () => {
  const rounds = [round("2024-06-01", 5, "B"), round("2022-01-01", 1, "Seed"), round("2025-03-01", 9, "C")];

  it("sorts oldest to newest without mutating the input", () => {
    const copy = [...rounds];
    expect(sortedRounds(rounds).map((r) => r.name)).toEqual(["Seed", "B", "C"]);
    expect(rounds).toEqual(copy);
  });

  it("is stable for equal dates", () => {
    const same = [round("2024-01-01", 1, "first"), round("2024-01-01", 2, "second")];
    expect(sortedRounds(same).map((r) => r.name)).toEqual(["first", "second"]);
  });

  it("latestRound picks the newest by date, not by array position", () => {
    expect(latestRound(meta({ funding_rounds: rounds }))?.name).toBe("C");
  });

  it("latestRound is null without rounds", () => {
    expect(latestRound(meta())).toBeNull();
  });
});

describe("startupCostBasis", () => {
  it("is shares x average cost", () => {
    expect(startupCostBasis(meta({ avg_cost_per_share: 2.5 }), 1000)).toBe(2500);
  });

  it("is 0 when no cost is recorded, and for 0 shares", () => {
    expect(startupCostBasis(meta({ avg_cost_per_share: null }), 1000)).toBe(0);
    expect(startupCostBasis(meta(), 0)).toBe(0);
  });

  it("options carry no up-front cost basis (the 'cost' is the strike)", () => {
    expect(startupCostBasis(meta({ investment_type: "bspce_options", avg_cost_per_share: 1 }), 1000)).toBe(0);
  });
});

describe("startupValuation", () => {
  it("with no rounds, equity is valued at cost", () => {
    expect(startupValuation(meta({ avg_cost_per_share: 2 }), 100)).toBe(200);
  });

  it("with no rounds and no cost it is 0", () => {
    expect(startupValuation(meta({ avg_cost_per_share: null }), 100)).toBe(0);
  });

  it("uses the latest round's price per share, regardless of array order", () => {
    const m = meta({ funding_rounds: [round("2025-01-01", 8), round("2023-01-01", 3), round("2024-01-01", 5)] });
    expect(startupValuation(m, 100)).toBe(800);
  });

  it("a down round lowers the valuation", () => {
    const m = meta({ avg_cost_per_share: 5, funding_rounds: [round("2023-01-01", 8), round("2024-01-01", 1)] });
    expect(startupValuation(m, 100)).toBe(100);
  });

  it("SAFEs and convertible notes are valued like equity: at cost until a priced round exists", () => {
    for (const investment_type of ["safe", "convertible_note"] as const) {
      expect(startupValuation(meta({ investment_type, avg_cost_per_share: 2 }), 100)).toBe(200);
      expect(startupValuation(meta({ investment_type, avg_cost_per_share: 2, funding_rounds: [round("2024-01-01", 4)] }), 100)).toBe(400);
    }
  });

  it("options: price minus strike per option, floored at 0", () => {
    const base = { investment_type: "bspce_options" as const, avg_cost_per_share: 1.5 };
    expect(startupValuation(meta({ ...base, funding_rounds: [round("2024-01-01", 4)] }), 1000)).toBe(2500);
    // Underwater (price below strike) is worth nothing, never negative.
    expect(startupValuation(meta({ ...base, funding_rounds: [round("2024-01-01", 1)] }), 1000)).toBe(0);
    // Exactly at the strike.
    expect(startupValuation(meta({ ...base, funding_rounds: [round("2024-01-01", 1.5)] }), 1000)).toBe(0);
  });

  it("options with no round yet are worth 0", () => {
    expect(startupValuation(meta({ investment_type: "bspce_options", avg_cost_per_share: 1.5 }), 1000)).toBe(0);
  });

  it("zero shares are worth zero", () => {
    expect(startupValuation(meta({ funding_rounds: [round("2024-01-01", 10)] }), 0)).toBe(0);
  });
});

describe("startupRoundHistory", () => {
  it("one point per round, oldest first, valued at shares x price", () => {
    const m = meta({ funding_rounds: [round("2024-01-01", 5, "A"), round("2022-01-01", 1, "Seed")] });
    expect(startupRoundHistory(m, 10)).toEqual([
      { date: "2022-01-01", name: "Seed", price: 1, value: 10 },
      { date: "2024-01-01", name: "A", price: 5, value: 50 },
    ]);
  });

  it("options history applies the strike and the floor at 0", () => {
    const m = meta({
      investment_type: "bspce_options",
      avg_cost_per_share: 2,
      funding_rounds: [round("2022-01-01", 1, "Seed"), round("2024-01-01", 5, "A")],
    });
    expect(startupRoundHistory(m, 10).map((p) => p.value)).toEqual([0, 30]);
  });

  it("its last point equals the current valuation", () => {
    const m = meta({ funding_rounds: [round("2022-01-01", 1), round("2024-01-01", 7)] });
    const h = startupRoundHistory(m, 25);
    expect(h[h.length - 1].value).toBe(startupValuation(m, 25));
  });

  it("is empty without rounds", () => {
    expect(startupRoundHistory(meta(), 10)).toEqual([]);
  });
});

describe("getFundingRoundErrors", () => {
  const valid = { date: "2024-05-01", name: "Seed", price_per_share: 1.2, post_money_valuation: null };

  it("no errors for a valid round", () => {
    expect(getFundingRoundErrors(valid)).toEqual([]);
    expect(getFundingRoundErrors({ ...valid, post_money_valuation: 5_000_000 })).toEqual([]);
  });

  it("requires an ISO date (YYYY-MM-DD)", () => {
    for (const date of ["", "2024-5-1", "05/01/2024", "2024-05-01T00:00:00Z"]) {
      expect(getFundingRoundErrors({ ...valid, date })).toContain("startup_round_date_required");
    }
  });

  it("requires a name and a positive price", () => {
    expect(getFundingRoundErrors({ ...valid, name: " " })).toContain("startup_round_name_required");
    for (const price_per_share of [0, -1, NaN]) {
      expect(getFundingRoundErrors({ ...valid, price_per_share })).toContain("startup_round_price_required");
    }
  });

  it("post-money may be null but must be positive when given", () => {
    expect(getFundingRoundErrors({ ...valid, post_money_valuation: 0 })).toContain("startup_round_post_money_invalid");
    expect(getFundingRoundErrors({ ...valid, post_money_valuation: -1 })).toContain("startup_round_post_money_invalid");
  });
});
