import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  otherRegisteredOwners,
  ownershipFactor,
  scaleAssetForOwner,
  scaleHistoryValue,
  timeLeft,
  validateOwners,
  type OwnerInput,
} from "@/lib/ownership";

const creator = (percentage: number, over: Partial<OwnerInput> = {}): OwnerInput => ({
  profileId: "p1",
  name: "Creator",
  email: "creator@example.com",
  percentage,
  isCreator: true,
  ...over,
});
const co = (percentage: number, email: string, over: Partial<OwnerInput> = {}): OwnerInput => ({
  name: "Co Owner",
  email,
  percentage,
  ...over,
});

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  Foo@Example.COM ")).toBe("foo@example.com");
  });
});

describe("validateOwners", () => {
  it("accepts a single 100% creator", () => {
    expect(validateOwners([creator(100)])).toEqual([]);
  });

  it("accepts a valid 60/40 split", () => {
    expect(validateOwners([creator(60), co(40, "b@example.com")])).toEqual([]);
  });

  it("requires at least one owner", () => {
    expect(validateOwners([])).toEqual(["owners_required"]);
  });

  it("rejects percentages that do not total 100", () => {
    expect(validateOwners([creator(60), co(30, "b@example.com")])).toContain("owners_total_must_be_100");
    expect(validateOwners([creator(60), co(50, "b@example.com")])).toContain("owners_total_must_be_100");
  });

  it("tolerates rounding up to 0.005 around 100 (33 + 33 + 34, 33.33 x 3 fails, 33.335 x 3 ok)", () => {
    expect(validateOwners([creator(33), co(33, "b@example.com"), co(34, "c@example.com")])).toEqual([]);
    expect(validateOwners([creator(33.33), co(33.33, "b@example.com"), co(33.33, "c@example.com")])).toContain(
      "owners_total_must_be_100",
    ); // 99.99 is 0.01 off: outside the 0.005 tolerance
    expect(validateOwners([creator(33.334), co(33.333, "b@example.com"), co(33.333, "c@example.com")])).toEqual([]);
  });

  it.each([0, -10, 100.01, 150, NaN, Infinity])("flags an invalid percentage %s", (pct) => {
    expect(validateOwners([creator(100), co(pct, "b@example.com")])).toContain("owners_percentage_invalid");
  });

  it("reports the invalid-percentage error once even with several bad rows", () => {
    const errors = validateOwners([creator(0), co(0, "b@example.com"), co(-1, "c@example.com")]);
    expect(errors.filter((e) => e === "owners_percentage_invalid")).toHaveLength(1);
  });

  it("co-owners need a name and a valid email; the creator does not", () => {
    expect(validateOwners([creator(50, { name: "", email: "" }), co(50, "b@example.com")])).toEqual([]);
    expect(validateOwners([creator(50), co(50, "b@example.com", { name: "   " })])).toContain("owners_name_required");
    for (const bad of ["", "nope", "a@b", "a b@c.com", "@c.com"]) {
      expect(validateOwners([creator(50), co(50, bad)])).toContain("owners_email_invalid");
    }
  });

  it("flags duplicate co-owner emails, case/space-insensitively", () => {
    const errors = validateOwners([creator(40), co(30, "dup@example.com"), co(30, "  DUP@example.com ")]);
    expect(errors).toContain("owners_email_duplicate");
  });

  it("requires exactly one creator", () => {
    expect(validateOwners([co(50, "a@example.com"), co(50, "b@example.com")])).toContain("owners_creator_required");
    expect(validateOwners([creator(50), creator(50, { profileId: "p2" })])).toContain("owners_creator_required");
  });

  it("collects every error rather than stopping at the first", () => {
    const errors = validateOwners([co(0, "bad"), co(0, "bad")]);
    expect(errors).toEqual(
      expect.arrayContaining([
        "owners_percentage_invalid",
        "owners_total_must_be_100",
        "owners_email_invalid",
        "owners_email_duplicate",
        "owners_creator_required",
      ]),
    );
  });
});

describe("ownershipFactor", () => {
  it("no owner rows: the asset's profile owns all of it, anyone else owns none", () => {
    expect(ownershipFactor("me", undefined, "me")).toBe(1);
    expect(ownershipFactor("me", [], "me")).toBe(1);
    expect(ownershipFactor("me", [], "someone")).toBe(0);
    expect(ownershipFactor("me", undefined, "someone")).toBe(0);
  });

  it("with owner rows: the viewer's percentage / 100", () => {
    const rows = [
      { profile_id: "a", ownership_percentage: 60 },
      { profile_id: "b", ownership_percentage: 40 },
    ];
    expect(ownershipFactor("a", rows, "a")).toBeCloseTo(0.6, 12);
    expect(ownershipFactor("a", rows, "b")).toBeCloseTo(0.4, 12);
  });

  it("factors across all owners sum to 1", () => {
    const rows = [
      { profile_id: "a", ownership_percentage: 33.5 },
      { profile_id: "b", ownership_percentage: 33.5 },
      { profile_id: "c", ownership_percentage: 33 },
    ];
    const total = ["a", "b", "c"].reduce((s, id) => s + ownershipFactor("a", rows, id), 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it("a viewer who is not an owner, or only has an unlinked invitation, gets 0", () => {
    const rows = [
      { profile_id: "a", ownership_percentage: 70 },
      { profile_id: null, ownership_percentage: 30 },
    ];
    expect(ownershipFactor("a", rows, "z")).toBe(0);
    // The creator profile is not an owner row here, so it does not fall back to 1.
    expect(ownershipFactor("creator", rows, "creator")).toBe(0);
  });
});

describe("otherRegisteredOwners", () => {
  it("excludes the caller and unregistered (null profile) rows", () => {
    const rows = [
      { profile_id: "a", name: "A" },
      { profile_id: "b", name: "B" },
      { profile_id: null, name: "Invitee" },
    ];
    expect(otherRegisteredOwners(rows, "a")).toEqual([{ profile_id: "b", name: "B" }]);
  });

  it("empty or undefined input gives an empty list", () => {
    expect(otherRegisteredOwners(undefined, "a")).toEqual([]);
    expect(otherRegisteredOwners([], "a")).toEqual([]);
  });
});

describe("timeLeft", () => {
  const now = Date.parse("2026-01-10T12:00:00Z");
  const at = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  const H = 3_600_000;

  it("is expired for past, exactly-now, and unparsable dates", () => {
    expect(timeLeft(at(-1), now)).toEqual({ unit: "expired", n: 0 });
    expect(timeLeft(at(0), now)).toEqual({ unit: "expired", n: 0 });
    expect(timeLeft("garbage", now)).toEqual({ unit: "expired", n: 0 });
  });

  it("whole days (rounded down) when 24 hours or more remain", () => {
    expect(timeLeft(at(24 * H), now)).toEqual({ unit: "days", n: 1 });
    expect(timeLeft(at(47 * H), now)).toEqual({ unit: "days", n: 1 });
    expect(timeLeft(at(48 * H), now)).toEqual({ unit: "days", n: 2 });
    expect(timeLeft(at(7 * 24 * H + 5 * H), now)).toEqual({ unit: "days", n: 7 });
  });

  it("hours rounded up for the last 24 hours, minimum 1", () => {
    expect(timeLeft(at(23 * H + 1), now)).toEqual({ unit: "hours", n: 24 });
    expect(timeLeft(at(90 * 60_000), now)).toEqual({ unit: "hours", n: 2 });
    expect(timeLeft(at(H), now)).toEqual({ unit: "hours", n: 1 });
    expect(timeLeft(at(1), now)).toEqual({ unit: "hours", n: 1 });
  });
});

describe("scaleAssetForOwner", () => {
  type Asset = Parameters<typeof scaleAssetForOwner>[0];
  const asset = (over: Partial<Asset>): Asset => ({
    category: "Cash",
    quantity: 1,
    current_value: 1000,
    metadata: null,
    ...over,
  });

  it("f === 1 returns the very same asset object", () => {
    const a = asset({});
    expect(scaleAssetForOwner(a, 1)).toBe(a);
  });

  it("scales current_value and rounds to cents", () => {
    expect(scaleAssetForOwner(asset({ current_value: 1000 }), 0.5).current_value).toBe(500);
    expect(scaleAssetForOwner(asset({ current_value: 100 }), 1 / 3).current_value).toBe(33.33);
    expect(scaleAssetForOwner(asset({ current_value: 100 }), 2 / 3).current_value).toBe(66.67);
  });

  it("f === 0 zeroes the value", () => {
    expect(scaleAssetForOwner(asset({ current_value: 1234.56 }), 0).current_value).toBe(0);
  });

  it("does not mutate the input", () => {
    const a = asset({ category: "Equities", quantity: 10, metadata: { total_income: 100, trades: [{ quantity: 10, price: 5 }] } });
    const snapshot = JSON.parse(JSON.stringify(a));
    scaleAssetForOwner(a, 0.25);
    expect(a).toEqual(snapshot);
  });

  it("shares of the same asset add back up to the original value (60/40)", () => {
    const a = asset({ current_value: 1_000_000 });
    const sum = scaleAssetForOwner(a, 0.6).current_value + scaleAssetForOwner(a, 0.4).current_value;
    expect(sum).toBe(1_000_000);
  });

  it("scales quantity only for unit-based categories", () => {
    for (const category of ["Equities", "Crypto", "Precious Metals", "SCPI", "Startups"]) {
      expect(scaleAssetForOwner(asset({ category, quantity: 10 }), 0.5).quantity).toBe(5);
    }
    for (const category of ["Cash", "Real Estate", "Vehicles", "Private Equity"]) {
      expect(scaleAssetForOwner(asset({ category, quantity: 10 }), 0.5).quantity).toBe(10);
    }
  });

  it("leaves a null-metadata asset's metadata null", () => {
    expect(scaleAssetForOwner(asset({ category: "Real Estate", metadata: null }), 0.5).metadata).toBeNull();
  });

  it("Real Estate: scales money fields, the loan, and dated ledgers; keeps areas, percentages, dates", () => {
    const a = asset({
      category: "Real Estate",
      current_value: 1_000_000,
      metadata: {
        purchasePrice: 800_000,
        market_valuation: 1_000_000,
        agencyFees: 16_000,
        surfaceArea: 120,
        completion_percentage: 40,
        address: "Somewhere",
        linked_loan: { amount: 600_000, outstanding_principal: 500_000, monthly_payment: 3_000, interest_rate: 3.99, start_date: "2024-01-01" },
        payment_schedule: [{ id: "m1", due_date: "2025-01-01", amount: 10_000, percentage: 10, status: "paid" }],
        tenancy_contracts: [{ id: "t1", annual_rent: 60_000, contract_value: 120_000, start_date: "2024-01-01" }],
        property_expenses: [{ id: "e1", amount: 200, description: "Fix" }],
      },
    });
    const out = scaleAssetForOwner(a, 0.5);
    const md = out.metadata as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(md.purchasePrice).toBe(400_000);
    expect(md.market_valuation).toBe(500_000);
    expect(md.agencyFees).toBe(8_000);
    expect(md.surfaceArea).toBe(120);
    expect(md.completion_percentage).toBe(40);
    expect(md.address).toBe("Somewhere");
    expect(md.linked_loan).toMatchObject({ amount: 300_000, outstanding_principal: 250_000, monthly_payment: 1_500, interest_rate: 3.99, start_date: "2024-01-01" });
    expect(md.payment_schedule[0]).toMatchObject({ amount: 5_000, percentage: 10, due_date: "2025-01-01" });
    expect(md.tenancy_contracts[0]).toMatchObject({ annual_rent: 30_000, contract_value: 60_000 });
    expect(md.property_expenses[0].amount).toBe(100);
  });

  it("Real Estate: ignores null/absent money fields without crashing", () => {
    const out = scaleAssetForOwner(asset({ category: "Real Estate", metadata: { purchasePrice: null } }), 0.5);
    expect((out.metadata as Record<string, unknown>).purchasePrice).toBeNull();
  });

  it("Vehicles: scales cost fields and the expense ledger", () => {
    const out = scaleAssetForOwner(
      asset({
        category: "Vehicles",
        metadata: { purchase_price: 40_000, maintenance_costs: 1_000, mileage: 50_000, expenses: [{ id: "x", amount: 300 }] },
      }),
      0.25,
    );
    const md = out.metadata as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(md.purchase_price).toBe(10_000);
    expect(md.maintenance_costs).toBe(250);
    expect(md.mileage).toBe(50_000);
    expect(md.expenses[0].amount).toBe(75);
  });

  it("Private Equity: scales commitment, called capital, distributions, calls and projections; keeps the ownership %", () => {
    const out = scaleAssetForOwner(
      asset({
        category: "Private Equity",
        metadata: {
          commitment_amount: 100_000,
          called_capital_manual: 40_000,
          distributions_to_date: 5_000,
          ownership_percentage: 12,
          expected_multiple: 1.8,
          capital_calls: [{ id: "c", amount: 20_000, percentage: 20 }],
          projected_distributions: [{ id: "d", amount: 50_000 }],
        },
      }),
      0.5,
    );
    const md = out.metadata as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(md.commitment_amount).toBe(50_000);
    expect(md.called_capital_manual).toBe(20_000);
    expect(md.distributions_to_date).toBe(2_500);
    expect(md.ownership_percentage).toBe(12);
    expect(md.expected_multiple).toBe(1.8);
    expect(md.capital_calls[0]).toMatchObject({ amount: 10_000, percentage: 20 });
    expect(md.projected_distributions[0].amount).toBe(25_000);
  });

  it("Equities: scales trade quantity/booked amount/brokerage and income but never the unit price", () => {
    const out = scaleAssetForOwner(
      asset({
        category: "Equities",
        quantity: 100,
        current_value: 10_000,
        metadata: {
          total_income: 200,
          last_unit_price: 100,
          trades: [{ id: "t", side: "buy", quantity: 100, price: 80, bookedAmount: 8_000, brokerage: 10 }],
          income: [{ date: "2025-01-01", amount: 50 }],
        },
      }),
      0.5,
    );
    const md = out.metadata as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(out.quantity).toBe(50);
    expect(out.current_value).toBe(5_000);
    expect(md.total_income).toBe(100);
    expect(md.last_unit_price).toBe(100);
    expect(md.trades[0]).toMatchObject({ quantity: 50, price: 80, bookedAmount: 4_000, brokerage: 5, side: "buy" });
    expect(md.income[0].amount).toBe(25);
  });

  it("SCPI: scales dividends only", () => {
    const out = scaleAssetForOwner(
      asset({
        category: "SCPI",
        quantity: 10,
        metadata: { subscription_price: 200, dividends: [{ id: "d", date: "2025-04-15", amount: 100, status: "received" }] },
      }),
      0.5,
    );
    const md = out.metadata as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(md.subscription_price).toBe(200);
    expect(md.dividends[0]).toMatchObject({ amount: 50, status: "received" });
  });

  it("other categories keep their metadata values untouched", () => {
    const out = scaleAssetForOwner(asset({ category: "Crypto", quantity: 2, metadata: { coingecko_id: "bitcoin" } }), 0.5);
    expect(out.metadata).toEqual({ coingecko_id: "bitcoin" });
    expect(out.quantity).toBe(1);
  });

  it("skips non-numeric and non-finite values in a money field", () => {
    const out = scaleAssetForOwner(
      asset({ category: "Vehicles", metadata: { purchase_price: "40000", maintenance_costs: Infinity, modifications: 100 } }),
      0.5,
    );
    const md = out.metadata as Record<string, unknown>;
    expect(md.purchase_price).toBe("40000");
    expect(md.maintenance_costs).toBe(Infinity);
    expect(md.modifications).toBe(50);
  });
});

describe("scaleHistoryValue", () => {
  it("returns the value unchanged for f === 1 and scales + rounds otherwise", () => {
    expect(scaleHistoryValue(123.456, 1)).toBe(123.456);
    expect(scaleHistoryValue(1000, 0.5)).toBe(500);
    expect(scaleHistoryValue(100, 1 / 3)).toBe(33.33);
    expect(scaleHistoryValue(1000, 0)).toBe(0);
    expect(scaleHistoryValue(-1000, 0.25)).toBe(-250);
  });
});
