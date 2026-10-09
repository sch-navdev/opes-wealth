import { describe, expect, it } from "vitest";
import { loadGratuityPlans } from "@/lib/gratuity-server";

function client(result: unknown) {
  const chain = { select: () => chain, eq: () => chain, order: () => Promise.resolve(result) };
  return { from: () => chain };
}
const row = {
  id: "p1",
  employer: "Invented Co",
  start_date: "2010-01-01",
  end_date: null,
  contract_type: "unlimited",
  unpaid_leave_days: 0,
  wage_history: [{ from: "2010-01-01", basicMonthly: 12000 }],
  payments: [],
  employer_stated_balance: null,
  currency: "AED",
  notes: "",
};

describe("loadGratuityPlans", () => {
  it("returns parsed plans and drops bad rows", async () => {
    const r = await loadGratuityPlans(client({ data: [row, { id: "bad" }], error: null }), "u1");
    expect(r.available).toBe(true);
    expect(r.plans.map((p) => p.id)).toEqual(["p1"]);
  });

  it("reports unavailable when the table is missing", async () => {
    expect((await loadGratuityPlans(client({ data: null, error: { code: "42P01" } }), "u1")).available).toBe(false);
    expect((await loadGratuityPlans(client({ data: null, error: { code: "PGRST205" } }), "u1")).available).toBe(false);
  });

  it("keeps available on other errors and never throws", async () => {
    expect((await loadGratuityPlans(client({ data: null, error: { code: "XX" } }), "u1")).available).toBe(true);
    const boom = {
      from: () => {
        throw new Error("x");
      },
    };
    expect(await loadGratuityPlans(boom, "u1")).toEqual({ plans: [], available: false });
  });
});
