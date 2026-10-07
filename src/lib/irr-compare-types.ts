/**
 * Shared contract of the IRR (TRI) comparison tool. Pure types, no logic: the maths
 * (`lib/irr.ts`), the holding cash-flow builder (`lib/irr-holdings.ts`, server action
 * `app/dashboard/compare/actions.ts`) and the UI (`app/dashboard/compare/*`,
 * `components/irr-compare*.tsx`) are written against this file.
 *
 * Sign convention for cash flows: NEGATIVE = money the investor pays in, POSITIVE = money
 * received (income, sale, or the current value as a terminal inflow).
 */

/** One dated cash flow, ISO date (YYYY-MM-DD), amount in `currency`. */
export type DatedFlow = { date: string; amount: number };

export type IrrFailure =
  /** Flows need at least one negative and one positive amount. */
  | "no_sign_change"
  /** Fewer than two flows / zero duration. */
  | "not_enough_flows"
  /** The solver found no rate (extreme or inconsistent flows). */
  | "no_solution";

export type IrrResult =
  | {
      ok: true;
      /** Effective annual rate as a fraction (0.0289 = 2.89 %). */
      rate: number;
      /** True when the flows change sign more than once, so another rate could also fit. */
      multipleRoots: boolean;
    }
  | { ok: false; reason: IrrFailure };

/** Headline figures of a cash-flow stream (all in the stream's currency). */
export type FlowSummary = {
  moneyIn: number; // sum of the negative flows, as a positive number (what was invested)
  moneyOut: number; // sum of the positive flows (what came back, incl. final value)
  gain: number; // moneyOut - moneyIn
  /** moneyOut / moneyIn, null when nothing was invested. */
  multiple: number | null;
  /** First to last flow, in years. */
  years: number;
};

/** The four fields of the savings-plan calculator (as in the advisor's screenshot). */
export type SavingsPlanInput = {
  initialCapital: number;
  monthlySaving: number;
  finalCapital: number;
  years: number;
};

export type SavingsPlanResult =
  | {
      ok: true;
      /** Effective annual rate (monthly rate = (1 + r)^(1/12) - 1), deposits at the END of each month. */
      effectiveAnnualRate: number;
      /** Nominal annual rate = 12 x monthly rate, for reference. */
      nominalAnnualRate: number;
      totalDeposits: number;
      totalInterest: number;
      /** The plan's final capital at the (unrounded) solved rate. */
      finalCapital: number;
    }
  | { ok: false; reason: "invalid_input" | IrrFailure };

/** Why an existing OW holding cannot be turned into a cash-flow stream. */
export type HoldingUnavailableReason =
  | "missing_purchase_price"
  | "missing_purchase_date"
  | "missing_value"
  | "unsupported_category"
  | "missing_fx"
  | "no_sign_change";

/** An existing OW holding offered in the comparison picker. */
export type ComparableHolding = {
  id: string;
  name: string;
  /** Asset category label key or plain category (Real Estate, Vehicles, Equities...). */
  category: string;
  /** The viewer's currency for all amounts below (display/base currency). */
  currency: string;
  /** Present when the flows could be built. Empty/absent otherwise. */
  flows?: DatedFlow[];
  /** What the flows include, for the explanation line under the result. */
  includes?: {
    purchase: boolean;
    income: boolean;
    currentValue: boolean;
    financing: boolean;
    /**
     * Optional (added by the data layer): true when dated running costs that ARE stored
     * (property expenses, vehicle expense ledger) were deducted as outflows.
     */
    costs?: boolean;
  };
  /** Set when `flows` could not be built. */
  unavailable?: HoldingUnavailableReason;
};

/** One side of the comparison. */
export type CompareSource =
  | { kind: "manual"; input: SavingsPlanInput }
  | { kind: "holding"; holdingId: string };

/** Computed card for one side. */
export type CompareSideResult = {
  label: string;
  currency: string;
  irr: IrrResult;
  summary: FlowSummary | null;
  /** Savings-plan extras (manual side only). */
  plan?: Extract<SavingsPlanResult, { ok: true }>;
  /** Cumulative value over time for the chart (ISO date, running net position). */
  series: { date: string; value: number }[];
  warnings: ("multiple_roots" | "different_currency" | "income_excluded" | "financing_excluded")[];
};
