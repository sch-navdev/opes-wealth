import { ASSURANCE_VIE_CONFIG, addYearsToIso, computeMilestone, holdingsByType, scheduledAnnualAmount, type AssuranceVieMetadata, type HoldingsTypeTotal } from "@/lib/assurance-vie";
import { daysBetween, isIsoDay, isNum } from "./common";

export type AvTimeline = {
  opened: string;
  /** Date of the milestone (opening date + the configured number of years). */
  target: string;
  /** Elapsed share of the milestone period, 0 to 1 (1 once reached). */
  elapsed: number;
  reached: boolean;
  daysRemaining: number | null;
  daysSince: number | null;
};

export type AssuranceVieAnalysis = {
  premiumsPaid: number | null;
  value: number;
  /** value - premiums paid (a difference, not a performance figure: timing of premiums is not known). */
  difference: number | null;
  differencePct: number | null;
  scheduledAnnual: number | null;
  timeline: AvTimeline | null;
  /** Holdings by instrument type; empty when no holdings were entered (the share split is then the stated one). */
  holdings: HoldingsTypeTotal[];
  statedAllocation: { euro: number; uc: number };
};

/** Premiums versus value, the milestone timeline and the holdings split of a life-insurance contract. Reuses the contract rules in `lib/assurance-vie.ts`. */
export function assuranceVieAnalysis(input: { metadata: AssuranceVieMetadata; value: number; today: string }): AssuranceVieAnalysis {
  const { metadata, value, today } = input;
  const paid = isNum(metadata.premiums_paid_total) && metadata.premiums_paid_total > 0 ? metadata.premiums_paid_total : null;
  let timeline: AvTimeline | null = null;
  if (isIsoDay(metadata.opened_on)) {
    const status = computeMilestone(metadata.opened_on, metadata.household, today);
    const target = addYearsToIso(metadata.opened_on, ASSURANCE_VIE_CONFIG.milestoneYears);
    if (target && status.kind !== "unknown") {
      const span = daysBetween(metadata.opened_on, target);
      const done = daysBetween(metadata.opened_on, today);
      timeline = {
        opened: metadata.opened_on,
        target,
        elapsed: span > 0 ? Math.min(1, Math.max(0, done / span)) : 0,
        reached: status.kind === "reached",
        daysRemaining: status.kind === "before" ? status.daysRemaining : null,
        daysSince: status.kind === "reached" ? status.daysSince : null,
      };
    }
  }
  return {
    premiumsPaid: paid,
    value,
    difference: paid != null ? value - paid : null,
    differencePct: paid != null ? value / paid - 1 : null,
    scheduledAnnual: scheduledAnnualAmount(metadata),
    timeline,
    holdings: holdingsByType(metadata.holdings),
    statedAllocation: { euro: metadata.euro_fund_pct, uc: metadata.uc_pct },
  };
}
