import { companyStakeValue, type CompanyMetadata } from "@/lib/companies";
import { changeOver, daysBetween, isIsoDay, isNum, type Change, type DatedValue } from "./common";

export type CompanyAnalysis = {
  /** Ownership as a fraction (0.4 = 40 %), null when not recorded. */
  ownership: number | null;
  /** The 100 % company value as entered. */
  companyValue: number | null;
  /** Stake value from the entered company value x ownership (before any co-ownership scaling). */
  stakeValue: number | null;
  valuationMethod: string;
  valuationDate: string | null;
  /** Days from the valuation date to today, null when the date is unknown. */
  valuationAgeDays: number | null;
  /** Recorded stake value over time. */
  change: Change | null;
  /** Assets recorded as held through this company. */
  heldAssets: number;
  /** Bank accounts linked through metadata.company_id. */
  linkedAccounts: { count: number; total: number } | null;
  /** True when the company holds none of its own history yet. */
  noHistory: boolean;
};

/** Valuation, ownership and linked accounts of a company holding. Dividends are not tracked for companies. */
export function companyAnalysis(input: {
  metadata: CompanyMetadata;
  history: DatedValue[];
  today: string;
  linkedAccounts?: { value: number }[] | null;
}): CompanyAnalysis {
  const { metadata, history, today } = input;
  const own = isNum(metadata.ownership_percentage) && metadata.ownership_percentage > 0 ? metadata.ownership_percentage : null;
  const value = isNum(metadata.company_value) && metadata.company_value > 0 ? metadata.company_value : null;
  const vDate = isIsoDay(metadata.valuation_date) ? metadata.valuation_date : null;
  const linked = input.linkedAccounts ?? null;
  return {
    ownership: own != null ? own / 100 : null,
    companyValue: value,
    stakeValue: value != null && own != null ? companyStakeValue(value, own) : null,
    valuationMethod: metadata.valuation_method,
    valuationDate: vDate,
    valuationAgeDays: vDate ? daysBetween(vDate, today) : null,
    change: changeOver(history),
    heldAssets: metadata.held_asset_ids.length,
    linkedAccounts: linked ? { count: linked.length, total: linked.reduce((s, a) => s + a.value, 0) } : null,
    noHistory: history.length < 2,
  };
}
