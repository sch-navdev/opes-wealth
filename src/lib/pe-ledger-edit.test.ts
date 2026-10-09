import { describe, expect, it } from "vitest";
import {
  addDistribution,
  addPaidCall,
  ledgerRows,
  removeDistribution,
  removePaidCall,
  updateDistribution,
  updatePaidCall,
} from "@/lib/pe-ledger-edit";
import { calledCapital, EMPTY_PRIVATE_EQUITY_METADATA, parsePrivateEquityMetadata, type PrivateEquityMetadata } from "@/lib/private-equity";

const base: PrivateEquityMetadata = {
  ...EMPTY_PRIVATE_EQUITY_METADATA,
  entity_name: "Invented Fund I",
  share_class: "A",
  ownership_percentage: 5,
  commitment_amount: 1000,
  capital_calls: [
    { id: "c1", due_date: "2022-03-31", paid_date: "2022-04-05", amount: 200, percentage: 20, status: "paid" },
    { id: "c2", due_date: "2099-03-31", amount: 300, percentage: 30, status: "pending" },
  ],
  distributions: [{ id: "d1", date: "2024-06-30", amount: 50, kind: "income" }],
};

function ok(r: ReturnType<typeof addPaidCall>): PrivateEquityMetadata {
  if (!r.ok) throw new Error(`unexpected ${r.code}`);
  return r.metadata;
}

describe("ledgerRows", () => {
  it("lists paid calls (at their paid date) and distributions, oldest first, without pending calls", () => {
    expect(ledgerRows(base).map((r) => [r.type, r.id, r.date])).toEqual([
      ["call", "c1", "2022-04-05"],
      ["distribution", "d1", "2024-06-30"],
    ]);
  });
});

describe("paid calls", () => {
  it("adds a paid call dated by its payment, with its share of the commitment, and feeds paid-in capital", () => {
    const next = ok(addPaidCall(base, { date: "2023-01-15", amount: 100 }));
    const added = next.capital_calls.find((c) => c.paid_date === "2023-01-15")!;
    expect(added).toMatchObject({ status: "paid", due_date: "2023-01-15", amount: 100, percentage: 10 });
    expect(calledCapital(next)).toBe(300);
    expect(base.capital_calls).toHaveLength(2); // input untouched
  });

  it("rejects a missing or impossible date and a non-positive amount", () => {
    expect(addPaidCall(base, { date: "", amount: 10 })).toEqual({ ok: false, code: "pe_paid_date_invalid" });
    expect(addPaidCall(base, { date: "2023-02-30", amount: 10 })).toEqual({ ok: false, code: "pe_paid_date_invalid" });
    expect(addPaidCall(base, { date: "2023-01-15", amount: 0 })).toEqual({ ok: false, code: "pe_call_invalid" });
    expect(addPaidCall(base, { date: "2023-01-15", amount: Number.NaN })).toEqual({ ok: false, code: "pe_call_invalid" });
  });

  it("refuses a call that pushes the schedule beyond the commitment", () => {
    expect(addPaidCall(base, { date: "2023-01-15", amount: 600 })).toEqual({ ok: false, code: "pe_calls_exceed_commitment" });
  });

  it("refuses more than 200 rows", () => {
    const full: PrivateEquityMetadata = {
      ...base,
      commitment_amount: null,
      capital_calls: Array.from({ length: 200 }, (_, i) => ({
        id: `x${i}`,
        due_date: "2020-01-01",
        paid_date: "2020-01-01",
        amount: 1,
        percentage: 0,
        status: "paid" as const,
      })),
    };
    expect(addPaidCall(full, { date: "2023-01-15", amount: 1 })).toEqual({ ok: false, code: "pe_ledger_too_long" });
  });

  it("updates the paid date and amount but keeps the scheduled due date, and never touches pending calls", () => {
    const next = ok(updatePaidCall(base, "c1", { date: "2022-05-01", amount: 250 }));
    expect(next.capital_calls[0]).toMatchObject({ id: "c1", due_date: "2022-03-31", paid_date: "2022-05-01", amount: 250, percentage: 25 });
    const same = ok(updatePaidCall(base, "c2", { date: "2022-05-01", amount: 250 }));
    expect(same.capital_calls[1]).toEqual(base.capital_calls[1]);
  });

  it("removes a paid call and is not blocked by errors already in the data", () => {
    const broken: PrivateEquityMetadata = {
      ...base,
      capital_calls: [...base.capital_calls, { id: "c3", due_date: "2023-01-01", amount: 900, percentage: 0, status: "pending" }],
    };
    const next = ok(removePaidCall(broken, "c1"));
    expect(next.capital_calls.map((c) => c.id)).toEqual(["c2", "c3"]);
    expect(ok(removePaidCall(base, "c2")).capital_calls).toHaveLength(2); // a pending call is not a ledger row
  });
});

describe("actual distributions", () => {
  it("adds one in date order and the parser keeps it", () => {
    const next = ok(addDistribution(base, { date: "2023-12-31", amount: 20, kind: "gain" }));
    expect(next.distributions.map((d) => d.date)).toEqual(["2023-12-31", "2024-06-30"]);
    expect(parsePrivateEquityMetadata(JSON.parse(JSON.stringify(next))).distributions).toHaveLength(2);
  });

  it("rejects a bad date or amount with the actual-distribution code", () => {
    const bads = [
      { date: "", amount: 5 },
      { date: "2024-13-01", amount: 5 },
      { date: "2024-01-01", amount: 0 },
      { date: "2024-01-01", amount: -3 },
    ];
    for (const bad of bads) {
      expect(addDistribution(base, { ...bad, kind: "income" })).toEqual({ ok: false, code: "pe_actual_distribution_invalid" });
    }
  });

  it("updates and removes by id", () => {
    const upd = ok(updateDistribution(base, "d1", { date: "2022-01-01", amount: 75, kind: "return_of_capital" }));
    expect(upd.distributions[0]).toEqual({ id: "d1", date: "2022-01-01", amount: 75, kind: "return_of_capital" });
    expect(ok(removeDistribution(base, "d1")).distributions).toEqual([]);
  });
});
