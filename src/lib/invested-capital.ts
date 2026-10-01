/**
 * Cumulative capital put into an asset over time, for the "invested vs
 * current valuation" comparison lines on the dashboard charts. Returned as a
 * step function `[ISO date, amount]` in the ASSET's own currency (the caller
 * converts to the Base Currency); `undefined` for categories with no cost data
 * (Cash, Crypto, Precious Metals, Private Equity…).
 *
 * Definitions (deliberately "what you paid out of pocket", matching the
 * Net-Equity-style value lines they are plotted against):
 *  - Equities: cost basis of the position still held, per trade date
 *    (`buildInvestedCapitalSeries`, average-cost method).
 *  - Real Estate: all-in cost (price + acquisition fees) minus the loan drawn,
 *    i.e. down payment + fees, on the purchase date. Off-plan: fees up front
 *    plus each installment marked paid, on its due date. Loan principal repaid
 *    later is NOT added (it already shows up as equity growth).
 *  - Vehicles: purchase price + ownership costs on the purchase date.
 */
import { buildInvestedCapitalSeries, parseEquityMetadata } from "@/lib/equities";
import {
  calculateCashInvestedToDate,
  calculateTotalCost,
  parseRealEstateMetadata,
  sumAcquisitionFees,
} from "@/lib/real-estate";
import { calculateVehicleTotalCost, parseVehicleMetadata } from "@/lib/vehicles";

export function buildAssetInvested(asset: {
  category: string;
  purchase_date: string | null;
  metadata: unknown;
  current_value: number;
}): [string, number][] | undefined {
  const purchaseDate = asset.purchase_date;

  if (asset.category === "Equities") {
    const series = buildInvestedCapitalSeries(parseEquityMetadata(asset.metadata).trades);
    return series.length > 0 ? series.map((p) => [p.date, p.value]) : undefined;
  }

  if (asset.category === "Real Estate") {
    const md = parseRealEstateMetadata(asset.metadata);
    const schedule = md.payment_schedule.filter((m) => m.due_date);

    if (md.is_offplan) {
      if (schedule.length > 0) {
        const sorted = [...schedule].sort((a, b) => a.due_date.localeCompare(b.due_date));
        const fees = sumAcquisitionFees(md);
        let paid = fees;
        const points: [string, number][] = [[sorted[0].due_date, fees]];
        for (const m of sorted) {
          if (m.status === "paid") {
            paid += m.amount;
            points.push([m.due_date, paid]);
          }
        }
        return points;
      }
      return purchaseDate ? [[purchaseDate, calculateCashInvestedToDate(md)]] : undefined;
    }

    if (!purchaseDate) return undefined;
    const marketValuation = md.market_valuation ?? asset.current_value;
    const cost = calculateTotalCost(md, marketValuation);
    const loan = md.linked_loan.amount ?? 0;
    return [[purchaseDate, Math.max(0, cost - loan)]];
  }

  if (asset.category === "Vehicles") {
    const md = parseVehicleMetadata(asset.metadata);
    if (!purchaseDate || !(md.purchase_price != null && md.purchase_price > 0)) return undefined;
    return [[purchaseDate, calculateVehicleTotalCost(md, md.purchase_price)]];
  }

  return undefined;
}
