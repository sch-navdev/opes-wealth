import { exoticGain, type ExoticAssetMetadata } from "@/lib/exotic-assets";
import { cagr, changeOver, isNum, yearsBetween, type Change, type DatedValue } from "./common";

export type ExoticAnalysis = {
  purchasePrice: number | null;
  /** Market value minus purchase price and its percentage (percent as in `exoticGain`). */
  gain: { amount: number; percent: number | null } | null;
  /** Years from the purchase date to today, null without a purchase date in the past. */
  holdingYears: number | null;
  /** Compound annual growth of the value since purchase, fraction; null under one month or without a price. */
  annualisedGrowth: number | null;
  /** Insured value when the record carries one (`metadata.insured_value`); not captured by the form today. */
  insuredValue: number | null;
  /** insured - market (positive = insured above the market value), null without an insured value. */
  insuredGap: number | null;
  /** Appraisals as recorded in the history. */
  appraisals: DatedValue[];
  sinceFirstAppraisal: Change | null;
};

/** Appraisal history, gain against purchase price, holding period and insured versus market value of an exotic asset. */
export function exoticAnalysis(input: {
  metadata: ExoticAssetMetadata;
  /** The raw metadata object, used only to read an optional `insured_value`. */
  rawMetadata?: Record<string, unknown> | null;
  marketValue: number;
  purchaseDate: string | null | undefined;
  history: DatedValue[];
  today: string;
}): ExoticAnalysis {
  const { metadata, marketValue, purchaseDate, today } = input;
  const price = isNum(metadata.purchase_price) && metadata.purchase_price > 0 ? metadata.purchase_price : null;
  const years = purchaseDate && purchaseDate <= today ? yearsBetween(purchaseDate, today) : null;
  const rawInsured = input.rawMetadata?.insured_value;
  const insured = isNum(rawInsured) && rawInsured > 0 ? rawInsured : null;
  return {
    purchasePrice: price,
    gain: exoticGain(marketValue, price),
    holdingYears: years,
    annualisedGrowth: price != null && years != null ? cagr(price, marketValue, years) : null,
    insuredValue: insured,
    insuredGap: insured != null ? insured - marketValue : null,
    appraisals: input.history,
    sinceFirstAppraisal: changeOver(input.history),
  };
}
