import { describe, expect, it } from "vitest";
import {
  CONSTRUCTION_YEARS,
  EMPTY_REAL_ESTATE_METADATA,
  calculateCashInvestedToDate,
  calculateEquity,
  calculateTotalArea,
  calculateTotalCost,
  calculateUnrealizedGain,
  findActiveTenancyContract,
  nextMilestoneId,
  nextPropertyExpenseId,
  nextTenancyContractId,
  parseRealEstateMetadata,
  resolveOutstandingLoanBalance,
  resolveRegistrationFee,
  sumAcquisitionFees,
  sumPropertyExpenses,
  type LinkedLoan,
  type RealEstateMetadata,
  type TenancyContract,
} from "@/lib/real-estate";

const meta = (patch: Partial<RealEstateMetadata> = {}): RealEstateMetadata => ({
  ...EMPTY_REAL_ESTATE_METADATA,
  ...patch,
});

const loan = (patch: Partial<LinkedLoan> = {}): LinkedLoan => ({
  ...EMPTY_REAL_ESTATE_METADATA.linked_loan,
  ...patch,
});

const contract = (patch: Partial<TenancyContract>): TenancyContract => ({
  id: "t",
  tenant_name: "Tenant",
  start_date: "2025-01-01",
  end_date: "2025-12-31",
  annual_rent: 12000,
  contract_value: 12000,
  imported_from_file: "",
  uploaded_at: "",
  ...patch,
});

describe("parseRealEstateMetadata", () => {
  it("returns defaults for null, undefined and non-objects", () => {
    for (const raw of [null, undefined, "x", 42, false]) {
      expect(parseRealEstateMetadata(raw)).toEqual(EMPTY_REAL_ESTATE_METADATA);
    }
  });

  it("returns a complete shape for an empty object", () => {
    const m = parseRealEstateMetadata({});
    expect(m).toEqual(EMPTY_REAL_ESTATE_METADATA);
    expect(m.emirate).toBe("dubai");
  });

  it("merges a partial older save over defaults, including nested objects", () => {
    const m = parseRealEstateMetadata({
      address: "Marina",
      purchasePrice: 900_000,
      condition: { kitchen: "Good" },
      linked_loan: { lender_name: "ENBD", amount: 500_000 },
    });
    expect(m.address).toBe("Marina");
    expect(m.condition).toEqual({ ...EMPTY_REAL_ESTATE_METADATA.condition, kitchen: "Good" });
    expect(m.linked_loan.lender_name).toBe("ENBD");
    expect(m.linked_loan.rate_type).toBe("fixed");
    expect(m.linked_loan.salary_transfer_active).toBe(true);
    expect(m.registration_fee_type).toBe("Notary");
  });

  it("falls back to defaults for malformed arrays", () => {
    const m = parseRealEstateMetadata({
      ownership: [],
      payment_schedule: "nope",
      property_expenses: {},
      tenancy_contracts: 5,
      condition: null,
      linked_loan: null,
    });
    expect(m.ownership).toEqual([{ name: "", percentage: 100 }]);
    expect(m.payment_schedule).toEqual([]);
    expect(m.property_expenses).toEqual([]);
    expect(m.tenancy_contracts).toEqual([]);
    expect(m.condition).toEqual(EMPTY_REAL_ESTATE_METADATA.condition);
    expect(m.linked_loan).toEqual(EMPTY_REAL_ESTATE_METADATA.linked_loan);
  });

  it("keeps valid arrays as stored", () => {
    const schedule = [
      { id: "1", milestone: "Down", due_date: "2025-01-01", amount: 10, percentage: 10, status: "paid" as const },
    ];
    const m = parseRealEstateMetadata({
      payment_schedule: schedule,
      ownership: [{ name: "A", percentage: 60 }, { name: "B", percentage: 40 }],
    });
    expect(m.payment_schedule).toEqual(schedule);
    expect(m.ownership).toHaveLength(2);
  });

  it("migrates a legacy single tenancy contract when no tenancy_contracts array exists", () => {
    const m = parseRealEstateMetadata({
      tenant_name: "  Jane ",
      tenancy_start_date: "2024-01-01",
      tenancy_end_date: "2024-12-31",
      tenancy_contract_value: 50_000,
      annual_rent: 48_000,
    });
    expect(m.tenancy_contracts).toEqual([
      {
        id: "legacy-tenancy-contract",
        tenant_name: "  Jane ",
        start_date: "2024-01-01",
        end_date: "2024-12-31",
        annual_rent: 48_000,
        contract_value: 50_000,
        imported_from_file: "",
        uploaded_at: "",
      },
    ]);
  });

  it("does not migrate a blank tenant, and prefers an existing tenancy_contracts array", () => {
    expect(parseRealEstateMetadata({ tenant_name: "   " }).tenancy_contracts).toEqual([]);
    const existing = [contract({ id: "keep" })];
    const m = parseRealEstateMetadata({ tenant_name: "Legacy", tenancy_contracts: existing });
    expect(m.tenancy_contracts).toEqual(existing);
  });

  it("legacy migration tolerates missing/invalid fields", () => {
    const [c] = parseRealEstateMetadata({ tenant_name: "X", annual_rent: "12" }).tenancy_contracts;
    expect(c.start_date).toBe("");
    expect(c.end_date).toBe("");
    expect(c.annual_rent).toBeNull();
    expect(c.contract_value).toBeNull();
  });
});

describe("registration fee and acquisition fees", () => {
  it("resolveRegistrationFee prefers registration_fee_amount", () => {
    expect(resolveRegistrationFee(meta({ registration_fee_amount: 4000, notaryFees: 1, adm_fee_amount: 2 }))).toBe(4000);
  });

  it("falls back to the sum of legacy notary + ADM fields", () => {
    expect(resolveRegistrationFee(meta({ registration_fee_amount: 0, notaryFees: 500, adm_fee_amount: 250 }))).toBe(750);
    expect(resolveRegistrationFee(meta({ registration_fee_amount: 0, notaryFees: null, adm_fee_amount: null }))).toBe(0);
  });

  it("sumAcquisitionFees adds every one-time fee and ignores nulls", () => {
    expect(sumAcquisitionFees(meta())).toBe(0);
    const m = meta({
      registration_fee_amount: 100,
      agencyFees: 200,
      renovationFees: 300,
      furnishingFees: 400,
      transfer_trustee_fees: 500,
      agent_sales_progression_fees: 600,
      rera_title_deed_processing_fees: 700,
      rera_mortgage_registration_fees: 800,
      rera_knowledge_fee: 900,
      in_principle_bank_approval_fee: 1000,
      property_valuation_fee: 1100,
      bank_processing_fees: 1200,
    });
    expect(sumAcquisitionFees(m)).toBe(7800);
  });

  it("excludes the recurring yearly insurance fee and the purchase price", () => {
    expect(sumAcquisitionFees(meta({ yearly_insurance_fee: 5000, purchasePrice: 1_000_000 }))).toBe(0);
  });
});

describe("outstanding loan balance, equity and cost basis", () => {
  it("prefers outstanding_principal, then amount, then 0", () => {
    expect(resolveOutstandingLoanBalance(loan({ outstanding_principal: 300, amount: 500 }))).toBe(300);
    expect(resolveOutstandingLoanBalance(loan({ outstanding_principal: null, amount: 500 }))).toBe(500);
    expect(resolveOutstandingLoanBalance(loan())).toBe(0);
  });

  it("treats a fully repaid loan (principal 0) as 0, not the original amount", () => {
    expect(resolveOutstandingLoanBalance(loan({ outstanding_principal: 0, amount: 500 }))).toBe(0);
  });

  it("calculateEquity = market value minus outstanding balance (can be negative)", () => {
    expect(calculateEquity(1_000_000, 600_000)).toBe(400_000);
    expect(calculateEquity(1_000_000, 0)).toBe(1_000_000);
    expect(calculateEquity(500_000, 650_000)).toBe(-150_000);
  });

  it("calculateTotalCost uses contract_price, then purchasePrice, then the fallback, plus fees", () => {
    const fees = { agencyFees: 10, registration_fee_amount: 5 };
    expect(calculateTotalCost(meta({ ...fees, contract_price: 100, purchasePrice: 90 }), 80)).toBe(115);
    expect(calculateTotalCost(meta({ ...fees, purchasePrice: 90 }), 80)).toBe(105);
    expect(calculateTotalCost(meta(fees), 80)).toBe(95);
  });

  it("calculateCashInvestedToDate = paid_to_date + fees (off-plan cash out)", () => {
    expect(calculateCashInvestedToDate(meta({ paid_to_date: 200_000, agencyFees: 8_000, registration_fee_amount: 4_000 }))).toBe(212_000);
    expect(calculateCashInvestedToDate(meta())).toBe(0);
  });

  it("calculateUnrealizedGain returns amount and percent of cost basis", () => {
    expect(calculateUnrealizedGain(1_100_000, 1_000_000)).toEqual({ amount: 100_000, percent: 10 });
    const loss = calculateUnrealizedGain(900_000, 1_000_000);
    expect(loss.amount).toBe(-100_000);
    expect(loss.percent).toBe(-10);
  });

  it("guards against a zero cost basis (percent is null, never Infinity/NaN)", () => {
    expect(calculateUnrealizedGain(500, 0)).toEqual({ amount: 500, percent: null });
    expect(calculateUnrealizedGain(0, 0)).toEqual({ amount: 0, percent: null });
  });

  it("net equity for an off-plan unit: valuation minus the outstanding developer balance and loan", () => {
    const m = meta({ is_offplan: true, market_valuation: 1_200_000, outstanding_balance: 700_000 });
    expect(calculateEquity(m.market_valuation ?? 0, m.outstanding_balance + resolveOutstandingLoanBalance(m.linked_loan))).toBe(500_000);
  });
});

describe("calculateTotalArea", () => {
  it("sums internal and terrace areas, treating null as 0", () => {
    expect(calculateTotalArea(80, 20)).toBe(100);
    expect(calculateTotalArea(80, null)).toBe(80);
    expect(calculateTotalArea(null, null)).toBe(0);
  });
});

describe("findActiveTenancyContract", () => {
  const c2025 = contract({ id: "2025", start_date: "2025-01-01", end_date: "2025-12-31" });
  const c2026 = contract({ id: "2026", start_date: "2026-01-01", end_date: "2026-12-31" });

  it("returns null with no contracts", () => {
    expect(findActiveTenancyContract([], "2025-06-01")).toBeNull();
  });

  it("picks the contract whose dates bracket the day, inclusive of both ends", () => {
    expect(findActiveTenancyContract([c2025, c2026], "2025-06-01")?.id).toBe("2025");
    expect(findActiveTenancyContract([c2025, c2026], "2025-12-31")?.id).toBe("2025");
    expect(findActiveTenancyContract([c2025, c2026], "2026-01-01")?.id).toBe("2026");
    expect(findActiveTenancyContract([c2025, c2026], "2025-01-01")?.id).toBe("2025");
  });

  it("treats a contract without an end date as still running", () => {
    const open = contract({ id: "open", start_date: "2024-01-01", end_date: "" });
    expect(findActiveTenancyContract([open], "2030-01-01")?.id).toBe("open");
  });

  it("falls back to the most recently started contract between leases", () => {
    const early = contract({ id: "early", start_date: "2023-01-01", end_date: "2023-12-31" });
    const late = contract({ id: "late", start_date: "2024-01-01", end_date: "2024-12-31" });
    expect(findActiveTenancyContract([early, late], "2025-06-01")?.id).toBe("late");
    expect(findActiveTenancyContract([late, early], "2025-06-01")?.id).toBe("late");
  });

  it("ignores contracts with no start date when looking for the active one", () => {
    const nostart = contract({ id: "nostart", start_date: "", end_date: "" });
    const real = contract({ id: "real", start_date: "2025-01-01", end_date: "2025-12-31" });
    expect(findActiveTenancyContract([nostart, real], "2025-03-01")?.id).toBe("real");
  });

  it("handles leap day boundaries", () => {
    const leap = contract({ id: "leap", start_date: "2024-02-29", end_date: "2025-02-28" });
    expect(findActiveTenancyContract([leap], "2024-02-29")?.id).toBe("leap");
    expect(findActiveTenancyContract([leap], "2025-02-28")?.id).toBe("leap");
  });
});

describe("sumPropertyExpenses", () => {
  it("sums amounts and treats missing/NaN amounts as 0", () => {
    expect(sumPropertyExpenses([])).toBe(0);
    expect(
      sumPropertyExpenses([
        { id: "1", description: "a", date: "2025-01-01", amount: 100 },
        { id: "2", description: "b", date: "2025-02-01", amount: 50.5 },
        { id: "3", description: "c", date: "2025-03-01", amount: Number.NaN },
      ]),
    ).toBe(150.5);
  });
});

describe("id generators and constants", () => {
  it("generate unique, prefixed ids", () => {
    const ids = [nextMilestoneId(), nextMilestoneId(), nextTenancyContractId(), nextTenancyContractId(), nextPropertyExpenseId(), nextPropertyExpenseId()];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toMatch(/^milestone-/);
    expect(ids[2]).toMatch(/^tenancy-/);
    expect(ids[4]).toMatch(/^expense-/);
  });

  it("CONSTRUCTION_YEARS runs from the current year down to 1900", () => {
    expect(CONSTRUCTION_YEARS[0]).toBe(String(new Date().getFullYear()));
    expect(CONSTRUCTION_YEARS[CONSTRUCTION_YEARS.length - 1]).toBe("1900");
    expect(new Set(CONSTRUCTION_YEARS).size).toBe(CONSTRUCTION_YEARS.length);
  });
});
