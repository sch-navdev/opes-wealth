import { calculateIrr, type DatedCashFlow } from "@/lib/irr";

/**
 * Metadata shape for the "Private Equity" asset category, stored in
 * `assets.metadata` (same jsonb-per-category pattern as `RealEstateMetadata`
 * in `real-estate.ts` — no dedicated `private_equity` table). Consumed by
 * `private-equity-fields.tsx` (add/edit form) and the Specifications tab of
 * `asset-detail-view.tsx`.
 *
 * Modelled on the investor lifecycle of a drawdown (capital-call) fund, e.g.
 * Altaroc: an investor SUBSCRIBES a total commitment, the fund CALLS it in
 * instalments over the investment period (called = paid-in capital; the rest
 * is the unfunded commitment), later DISTRIBUTES proceeds, and finally
 * liquidates. `assets.current_value` is the position's NAV (what has been paid
 * in, marked to market) — NOT the commitment.
 *
 * Projected cash flows (Altaroc-style): calls are phased over roughly years
 * 1–5 (e.g. 20% a year, or 10% every six months) and distributions arrive
 * over roughly years 4–10, totalling `commitment × expected multiple`. The
 * "Model" mode generates both from a few parameters; "Manual" mode leaves the
 * call timeline, the distribution timeline and the expected multiple / IRR
 * entirely to the investor, for funds that follow a different pattern.
 * Projected distributions are expectations only — they never touch Net Worth.
 *
 * Liability: every capital call still marked `pending` is a forward-looking
 * obligation, exactly like an off-plan property's unpaid instalments
 * (`lib/liabilities.ts`). It reduces Net Worth until paid; a fund that should
 * not count it can switch `count_unfunded_as_liability` off.
 */
export type CapitalCall = {
  id: string;
  due_date: string;
  amount: number;
  /** Share of the total commitment, for display (derived when generated). */
  percentage: number;
  status: "paid" | "pending";
};

/** A projected (future) distribution back to the investor. */
export type ProjectedDistribution = {
  id: string;
  due_date: string;
  amount: number;
};

/** "model" = generated from parameters; "manual" = investor-defined timelines and targets. */
export type PrivateEquityProjectionMode = "model" | "manual";

export type PrivateEquityLifecycleStage =
  | "commitment"
  | "investment_period"
  | "harvest"
  | "liquidated";

export const PRIVATE_EQUITY_STAGES: PrivateEquityLifecycleStage[] = [
  "commitment",
  "investment_period",
  "harvest",
  "liquidated",
];

export type PrivateEquityMetadata = {
  share_class: string;
  ownership_percentage: number | null;
  entity_name: string;

  /** Fund manager / platform (e.g. "Altaroc"). */
  manager: string;
  strategy: string;
  vintage_year: string;
  lifecycle_stage: PrivateEquityLifecycleStage;
  /** Total capital the investor subscribed to (same currency as the asset). */
  commitment_amount: number | null;
  /** Dated capital calls; paid ones make up the called (paid-in) capital. */
  capital_calls: CapitalCall[];
  /** Called capital for funds with no schedule on file (entered by hand). */
  called_capital_manual: number | null;
  distributions_to_date: number | null;
  /** Date of the last NAV reported by the manager. */
  nav_date: string;
  /** Count still-pending capital calls in Total Liabilities (default true). */
  count_unfunded_as_liability: boolean;

  projection_mode: PrivateEquityProjectionMode;
  /** Projected future distributions (expected proceeds), see the file header. */
  projected_distributions: ProjectedDistribution[];
  /** Target total value multiple on paid-in capital (e.g. 1.8 = 1.8x). Drives the "Model" distributions; typed freely in "Manual" mode. */
  expected_multiple: number | null;
  /** Manager's target net IRR in percent — only used when typed in "Manual" mode (otherwise computed from the cash flows). */
  expected_irr_manual: number | null;
};

export const EMPTY_PRIVATE_EQUITY_METADATA: PrivateEquityMetadata = {
  share_class: "",
  ownership_percentage: null,
  entity_name: "",
  manager: "",
  strategy: "",
  vintage_year: "",
  lifecycle_stage: "investment_period",
  commitment_amount: null,
  capital_calls: [],
  called_capital_manual: null,
  distributions_to_date: null,
  nav_date: "",
  count_unfunded_as_liability: true,
  projection_mode: "model",
  projected_distributions: [],
  expected_multiple: null,
  expected_irr_manual: null,
};

/**
 * Merges a raw `assets.metadata` value into a complete
 * `PrivateEquityMetadata`, same defensive pattern as `parseRealEstateMetadata`.
 * Rows saved before the lifecycle fields existed simply get the defaults.
 */
export function parsePrivateEquityMetadata(raw: unknown): PrivateEquityMetadata {
  if (!raw || typeof raw !== "object") {
    return EMPTY_PRIVATE_EQUITY_METADATA;
  }
  const r = raw as Partial<PrivateEquityMetadata>;
  return {
    ...EMPTY_PRIVATE_EQUITY_METADATA,
    ...r,
    capital_calls: Array.isArray(r.capital_calls) ? r.capital_calls : [],
    projected_distributions: Array.isArray(r.projected_distributions)
      ? r.projected_distributions
      : [],
  };
}

/**
 * Returns every unmet requirement for a `PrivateEquityMetadata` payload
 * before it's serialized into `assets.metadata` — same "collect every error"
 * pattern as `getVehicleMetadataErrors`/`getPasswordRequirementErrors`.
 */
export function getPrivateEquityMetadataErrors(
  metadata: PrivateEquityMetadata,
): string[] {
  const errors: string[] = [];

  if (!metadata.entity_name.trim()) errors.push("entity_name_required");
  if (!metadata.share_class.trim()) errors.push("share_class_required");

  if (
    metadata.ownership_percentage === null ||
    Number.isNaN(metadata.ownership_percentage)
  ) {
    errors.push("ownership_percentage_required");
  } else if (
    metadata.ownership_percentage < 0 ||
    metadata.ownership_percentage > 100
  ) {
    errors.push("ownership_percentage_range");
  }

  if (metadata.commitment_amount != null) {
    if (!(metadata.commitment_amount >= 0)) errors.push("pe_commitment_invalid");
    const scheduled = sumCalls(metadata.capital_calls);
    // Small tolerance for rounding in generated schedules.
    if (scheduled > metadata.commitment_amount + 0.01) errors.push("pe_calls_exceed_commitment");
  }
  if (metadata.capital_calls.some((c) => !c.due_date || !(c.amount > 0))) {
    errors.push("pe_call_invalid");
  }
  if (metadata.projected_distributions.some((d) => !d.due_date || !(d.amount > 0))) {
    errors.push("pe_distribution_invalid");
  }
  if (metadata.expected_multiple != null && !(metadata.expected_multiple > 0)) {
    errors.push("pe_multiple_invalid");
  }

  return errors;
}

const sumCalls = (calls: CapitalCall[], status?: CapitalCall["status"]) =>
  calls
    .filter((c) => !status || c.status === status)
    .reduce((sum, c) => sum + c.amount, 0);

/** Paid-in capital: the paid calls, or the manual figure when no schedule exists. */
export function calledCapital(metadata: PrivateEquityMetadata): number {
  if (metadata.capital_calls.length > 0) return sumCalls(metadata.capital_calls, "paid");
  return metadata.called_capital_manual ?? 0;
}

/** Still-to-be-called commitment: total commitment − called (never negative). */
export function unfundedCommitment(metadata: PrivateEquityMetadata): number {
  if (metadata.commitment_amount == null) return sumCalls(metadata.capital_calls, "pending");
  return Math.max(0, metadata.commitment_amount - calledCapital(metadata));
}

/**
 * The forward-looking liability this fund contributes: capital calls still
 * pending (scheduled, or overdue and unpaid) — mirrors an off-plan property's
 * `outstanding_balance`. Zero when the fund opts out. With no schedule but a
 * commitment, nothing is counted: an unscheduled commitment is not yet an
 * obligation with a date.
 */
export function pendingCapitalCallsTotal(metadata: PrivateEquityMetadata): number {
  if (!metadata.count_unfunded_as_liability) return 0;
  return sumCalls(metadata.capital_calls, "pending");
}

/** Today's ISO date → whether a pending call is already past due. */
export const isOverdue = (call: CapitalCall, today: string) =>
  call.status === "pending" && call.due_date < today;

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** `date` + `months`, keeping an end-of-month anchor (31 Mar → 30 Sep → 31 Mar). */
function addMonthsAnchored(isoDate: string, months: number, anchorDay: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const day = Math.min(anchorDay, lastDayOfMonth(year, month));
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/**
 * Auto-models a capital-call schedule: `percentPerCall`% of the commitment on
 * `firstDate`, then every `intervalMonths` (6 = semi-annual, e.g. 31 March and
 * 30 September) until the whole commitment is called — the last call is
 * trimmed to what remains. Calls dated on/before `today` are marked paid (the
 * investor is assumed to have honoured them; each row stays editable), later
 * ones pending. `alreadyCalled` skips that much of the commitment (calls
 * already settled before the first generated date).
 */
export function generateCapitalCalls(opts: {
  commitment: number;
  percentPerCall: number;
  firstDate: string;
  intervalMonths: number;
  today: string;
  alreadyCalled?: number;
}): CapitalCall[] {
  const { commitment, percentPerCall, firstDate, intervalMonths, today } = opts;
  if (!(commitment > 0) || !(percentPerCall > 0) || !firstDate || !(intervalMonths > 0)) return [];

  const perCall = (commitment * percentPerCall) / 100;
  let remaining = Math.max(0, commitment - (opts.alreadyCalled ?? 0));
  const anchorDay = new Date(`${firstDate}T00:00:00Z`).getUTCDate();
  const calls: CapitalCall[] = [];

  for (let i = 0; remaining > 0.005 && i < 200; i++) {
    const amount = Math.round(Math.min(perCall, remaining) * 100) / 100;
    const due_date = i === 0 ? firstDate : addMonthsAnchored(firstDate, i * intervalMonths, anchorDay);
    calls.push({
      id: `call-${due_date}`,
      due_date,
      amount,
      percentage: Math.round((amount / commitment) * 10000) / 100,
      status: due_date <= today ? "paid" : "pending",
    });
    remaining -= amount;
  }
  return calls;
}

/** Shape of the generated distribution stream: flat, or weighted toward the later years (typical of buyout/growth funds). */
export type DistributionShape = "even" | "back_loaded";

/**
 * Projected distributions: `commitment × multiple` in total, paid once a
 * year from year `startYear` to `endYear`, where year 1 begins on the FIRST
 * capital call (so year 4 falls three years later) — Altaroc-style: roughly
 * years 4–10. `back_loaded` weights year n by n so
 * later years return more. Amounts are rounded to cents and the last one
 * absorbs the rounding, so the total is exact.
 */
export function generateProjectedDistributions(opts: {
  commitment: number;
  multiple: number;
  firstCallDate: string;
  startYear: number;
  endYear: number;
  shape: DistributionShape;
}): ProjectedDistribution[] {
  const { commitment, multiple, firstCallDate, startYear, endYear, shape } = opts;
  if (!(commitment > 0) || !(multiple > 0) || !firstCallDate) return [];
  if (!(startYear >= 1) || endYear < startYear) return [];

  const years: number[] = [];
  for (let y = Math.floor(startYear); y <= Math.floor(endYear); y++) years.push(y);
  const weights = years.map((_, i) => (shape === "back_loaded" ? i + 1 : 1));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const total = commitment * multiple;
  const anchorDay = new Date(`${firstCallDate}T00:00:00Z`).getUTCDate();

  let allocated = 0;
  return years.map((year, i) => {
    const isLast = i === years.length - 1;
    const amount = isLast
      ? Math.round((total - allocated) * 100) / 100
      : Math.round(((total * weights[i]) / weightSum) * 100) / 100;
    allocated += amount;
    const due_date = addMonthsAnchored(firstCallDate, (year - 1) * 12, anchorDay);
    return { id: `dist-${due_date}`, due_date, amount };
  });
}

/** Everything the investor expects to pay in and receive: past + future calls out, projected distributions in. */
export function projectedCashFlows(metadata: PrivateEquityMetadata): DatedCashFlow[] {
  return [
    ...metadata.capital_calls.map((c) => ({ date: c.due_date, amount: -c.amount })),
    ...metadata.projected_distributions.map((d) => ({ date: d.due_date, amount: d.amount })),
  ];
}

export type FundReturns = {
  totalCalls: number;
  totalDistributions: number;
  /** Total distributions ÷ total calls (null with no calls). */
  multiple: number | null;
  /** Annualised IRR as a fraction (0.12 = 12%), null when the flows have no sign change. */
  irr: number | null;
};

/**
 * Returns implied by the scheduled cash flows. In "Manual" mode the investor's
 * own multiple / IRR targets (when typed) replace the computed figures, for
 * funds whose manager quotes returns that don't follow from a schedule.
 */
export function fundReturns(metadata: PrivateEquityMetadata): FundReturns {
  const totalCalls = sumCalls(metadata.capital_calls);
  const totalDistributions = metadata.projected_distributions.reduce((s, d) => s + d.amount, 0);
  const computedMultiple = totalCalls > 0 ? totalDistributions / totalCalls : null;
  const computedIrr = calculateIrr(projectedCashFlows(metadata));
  const manual = metadata.projection_mode === "manual";
  return {
    totalCalls,
    totalDistributions,
    multiple: manual && metadata.expected_multiple != null ? metadata.expected_multiple : computedMultiple,
    irr:
      manual && metadata.expected_irr_manual != null
        ? metadata.expected_irr_manual / 100
        : computedIrr,
  };
}

/** Cumulative net cash position over time (calls out, distributions in) for the cash-flow chart. */
export function cumulativeCashFlowSeries(
  metadata: PrivateEquityMetadata,
): { date: string; calls: number; distributions: number; cumulative: number }[] {
  const byDate = new Map<string, { calls: number; distributions: number }>();
  for (const c of metadata.capital_calls) {
    const e = byDate.get(c.due_date) ?? { calls: 0, distributions: 0 };
    e.calls += c.amount;
    byDate.set(c.due_date, e);
  }
  for (const d of metadata.projected_distributions) {
    const e = byDate.get(d.due_date) ?? { calls: 0, distributions: 0 };
    e.distributions += d.amount;
    byDate.set(d.due_date, e);
  }
  let cumulative = 0;
  return Array.from(byDate.keys())
    .sort()
    .map((date) => {
      const e = byDate.get(date)!;
      cumulative += e.distributions - e.calls;
      return { date, calls: e.calls, distributions: e.distributions, cumulative };
    });
}
