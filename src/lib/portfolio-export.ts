/**
 * Full portfolio spreadsheet (.xlsx) — one workbook, one sheet per view:
 * Summary, Assets, Liabilities, Real Estate, Brokerage, REIT (+ dividends),
 * Private Equity (+ cash flows), Companies and the complete Valuation History.
 * Numbers are written as real numeric cells (not formatted strings) so the
 * file can be summed, filtered and charted. Values are given in each asset's
 * own currency AND in the Base Currency. Built server-side by
 * `app/dashboard/export/route.ts`.
 */
import * as XLSX from "xlsx";
import { convertToBaseCurrency } from "@/lib/fx";
import { assetLiability, grossAssetValue } from "@/lib/liabilities";
import {
  calculateTotalCost,
  calculateUnrealizedGain,
  findActiveTenancyContract,
  parseRealEstateMetadata,
} from "@/lib/real-estate";
import { parseEquityMetadata } from "@/lib/equities";
import { parseCompanyMetadata } from "@/lib/companies";
import {
  calledCapital,
  fundReturns,
  parsePrivateEquityMetadata,
  unfundedCommitment,
} from "@/lib/private-equity";
import {
  parseScpiMetadata,
  scpiAverageYield,
  scpiEntryFees,
  scpiInvested,
  scpiReceived,
  scpiTrailingYield,
  scpiWithdrawalValue,
} from "@/lib/scpi";
import { parseLiabilityMetadata } from "@/lib/liability";

export type ExportAsset = {
  id: string;
  name: string;
  category_id: string;
  quantity: number;
  current_value: number;
  currency: string;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  ticker_symbol: string | null;
  purchase_date: string;
  asset_categories: { name: string } | null;
};

export type ExportHistoryRow = {
  asset_id: string;
  recorded_date: string;
  value: number;
  net_equity: number | null;
};

type Row = Record<string, string | number | boolean | null>;

function sheet(rows: Row[], headers: string[]): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(12, Math.min(38, h.length + 4)) }));
  return ws;
}

export function buildPortfolioWorkbook(input: {
  assets: ExportAsset[];
  history: ExportHistoryRow[];
  baseCurrency: string;
  rates: Record<string, number>;
  today: string;
  ownerName: string;
}): Buffer {
  const { assets, history, baseCurrency, rates, today } = input;
  // Totals sum UNROUNDED conversions (like the dashboard); only displayed cells are rounded.
  const baseRaw = (n: number, currency: string) =>
    convertToBaseCurrency(n, currency, baseCurrency, rates);
  const base = (n: number, currency: string) => Math.round(baseRaw(n, currency) * 100) / 100;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const category = (a: ExportAsset) => a.asset_categories?.name ?? "—";

  // ---- Assets ----------------------------------------------------------
  let totalAssets = 0;
  let totalLiabilities = 0;
  const assetRows: Row[] = assets.map((a) => {
    const gross = a.is_liability ? 0 : grossAssetValue(a);
    const liability = assetLiability(a);
    totalAssets += baseRaw(gross, a.currency);
    totalLiabilities += baseRaw(liability, a.currency);
    return {
      Name: a.name,
      Category: category(a),
      Ticker: a.ticker_symbol ?? "",
      Quantity: a.quantity,
      Currency: a.currency,
      "Gross value": r2(gross),
      "Debt / owed": r2(liability),
      "Net value": r2(gross - liability),
      [`Net value (${baseCurrency})`]: base(gross - liability, a.currency),
      "Purchase / start date": a.purchase_date,
    };
  });

  // ---- Summary ---------------------------------------------------------
  const byCategory = new Map<string, number>();
  for (const a of assets) {
    const net = baseRaw((a.is_liability ? 0 : grossAssetValue(a)) - assetLiability(a), a.currency);
    byCategory.set(category(a), (byCategory.get(category(a)) ?? 0) + net);
  }
  const summaryRows: Row[] = [
    { Item: "Owner", Value: input.ownerName },
    { Item: "Generated on", Value: today },
    { Item: "Base currency", Value: baseCurrency },
    { Item: "Total assets", Value: r2(totalAssets) },
    { Item: "Total liabilities", Value: r2(totalLiabilities) },
    { Item: "Net worth", Value: r2(totalAssets - totalLiabilities) },
    { Item: "", Value: "" },
    ...Array.from(byCategory, ([name, value]): Row => ({ Item: `Net — ${name}`, Value: r2(value) })),
  ];

  // ---- Liabilities (every source of debt) ---------------------------------
  const liabilityRows: Row[] = [];
  for (const a of assets) {
    const owed = assetLiability(a);
    if (owed <= 0) continue;
    let type = "Liability";
    let detail = "";
    if (a.is_liability) {
      const md = parseLiabilityMetadata(a.metadata);
      type = md.liability_type;
      detail = md.lender_name;
    } else if (category(a) === "Real Estate") {
      const md = parseRealEstateMetadata(a.metadata);
      type = md.is_offplan ? "Off-plan balance" : "Property loan";
      detail = md.linked_loan.lender_name;
    } else if (category(a) === "Private Equity") {
      type = "Pending capital calls";
      detail = parsePrivateEquityMetadata(a.metadata).manager;
    }
    liabilityRows.push({
      Name: a.name,
      Type: type,
      "Lender / detail": detail,
      Currency: a.currency,
      "Amount owed": r2(owed),
      [`Amount owed (${baseCurrency})`]: base(owed, a.currency),
    });
  }

  // ---- Real Estate -------------------------------------------------------
  const realEstateRows: Row[] = assets
    .filter((a) => category(a) === "Real Estate")
    .map((a) => {
      const md = parseRealEstateMetadata(a.metadata);
      const market = md.market_valuation ?? a.current_value;
      const cost = calculateTotalCost(md, market);
      const gain = calculateUnrealizedGain(market, cost);
      const contract = findActiveTenancyContract(md.tenancy_contracts, today);
      return {
        Name: a.name,
        Currency: a.currency,
        "Market value": r2(market),
        "Total cost (incl. fees)": r2(cost),
        "Unrealized gain": r2(gain.amount),
        "Off-plan": md.is_offplan,
        "Outstanding developer balance": r2(md.is_offplan ? md.outstanding_balance : 0),
        "Loan lender": md.linked_loan.lender_name,
        "Loan amount": md.linked_loan.amount ?? "",
        "Loan rate %": md.linked_loan.interest_rate ?? "",
        "Loan monthly payment": md.linked_loan.monthly_payment ?? "",
        "Outstanding debt": r2(assetLiability(a)),
        "Annual rent (active contract)": contract?.annual_rent ?? "",
        "Purchase date": a.purchase_date,
      };
    });

  // ---- Brokerage -----------------------------------------------------------
  const brokerageRows: Row[] = assets
    .filter((a) => category(a) === "Equities")
    .map((a) => {
      const md = parseEquityMetadata(a.metadata);
      return {
        Name: a.name,
        Ticker: a.ticker_symbol ?? "",
        ISIN: md.isin ?? "",
        Exchange: md.exchange,
        Account: md.account_name ?? "",
        Quantity: a.quantity,
        Currency: a.currency,
        "Last price": md.last_unit_price ?? "",
        "Price date": md.last_priced_at ?? "",
        Value: r2(a.current_value),
        [`Value (${baseCurrency})`]: base(a.current_value, a.currency),
        "Income received": md.total_income ?? 0,
      };
    });

  // ---- SCPI ----------------------------------------------------------------
  const scpiAssets = assets.filter((a) => category(a) === "SCPI");
  const scpiRows: Row[] = scpiAssets.map((a) => {
    const md = parseScpiMetadata(a.metadata);
    return {
      Name: a.name,
      "Management company": md.management_company,
      Sector: md.sector,
      Geography: md.geography,
      "Holding mode": md.holding_mode,
      Shares: a.quantity,
      Currency: a.currency,
      "Subscription price": md.subscription_price ?? "",
      "Entry fee %": md.entry_fee_pct ?? "",
      "Capital invested": r2(scpiInvested(md, a.quantity)),
      "Entry fees paid": r2(scpiEntryFees(md, a.quantity)),
      "Withdrawal value / share": scpiWithdrawalValue(md) ?? "",
      "Current value": r2(a.current_value),
      "Dividends received": r2(scpiReceived(md)),
      "Realised yield 12m %": scpiTrailingYield(md, a.quantity, today)?.toFixed(2) ?? "",
      "Target yield %": md.target_yield_pct ?? "",
      "Average distribution rate %": scpiAverageYield(md)?.toFixed(2) ?? "",
      "Financed by loan": md.financed_by_credit,
      "Start of income": md.jouissance_date,
    };
  });
  const scpiDividendRows: Row[] = scpiAssets.flatMap((a) =>
    parseScpiMetadata(a.metadata).dividends.map(
      (d): Row => ({
        REIT: a.name,
        Quarter: d.quarter,
        "Payment date": d.date,
        Amount: d.amount,
        Currency: a.currency,
        Status: d.status,
      }),
    ),
  );

  // ---- Private Equity ----------------------------------------------------------
  const peAssets = assets.filter((a) => category(a) === "Private Equity");
  const peRows: Row[] = peAssets.map((a) => {
    const md = parsePrivateEquityMetadata(a.metadata);
    const returns = fundReturns(md);
    return {
      Name: a.name,
      Manager: md.manager,
      Entity: md.entity_name,
      Strategy: md.strategy,
      Vintage: md.vintage_year,
      Stage: md.lifecycle_stage,
      Currency: a.currency,
      Commitment: md.commitment_amount ?? "",
      "Called capital": r2(calledCapital(md)),
      "Unfunded commitment": r2(unfundedCommitment(md)),
      NAV: r2(a.current_value),
      "Distributions received": md.distributions_to_date ?? "",
      "Pending calls (liability)": r2(assetLiability(a)),
      "Expected multiple": returns.multiple != null ? Number(returns.multiple.toFixed(2)) : "",
      "Expected IRR %": returns.irr != null ? Number((returns.irr * 100).toFixed(1)) : "",
      "Schedule source": md.projection_mode,
    };
  });
  const peFlowRows: Row[] = peAssets.flatMap((a) => {
    const md = parsePrivateEquityMetadata(a.metadata);
    return [
      ...md.capital_calls.map(
        (c): Row => ({ Fund: a.name, Type: "Capital call", Date: c.due_date, Amount: -c.amount, Status: c.status }),
      ),
      ...md.projected_distributions.map(
        (d): Row => ({ Fund: a.name, Type: "Projected distribution", Date: d.due_date, Amount: d.amount, Status: "projected" }),
      ),
    ].sort((x, y) => String(x.Date).localeCompare(String(y.Date)));
  });

  // ---- Companies -----------------------------------------------------------------
  const companyRows: Row[] = assets
    .filter((a) => category(a) === "Companies")
    .map((a) => {
      const md = parseCompanyMetadata(a.metadata);
      return {
        Name: a.name,
        "Legal name": md.legal_name,
        "Entity type": md.entity_type,
        Jurisdiction: md.jurisdiction,
        "Registration no.": md.registration_number,
        Industry: md.industry,
        "Held via": md.held_via === "holding" ? `Holding${md.holding_name ? ` (${md.holding_name})` : ""}` : "Personally",
        "Ownership %": md.ownership_percentage ?? "",
        Currency: a.currency,
        "Equity value (100%)": md.company_value ?? "",
        "Your stake": r2(a.current_value),
        [`Your stake (${baseCurrency})`]: base(a.current_value, a.currency),
      };
    });

  // ---- History -------------------------------------------------------------------
  const byId = new Map(assets.map((a) => [a.id, a]));
  const historyRows: Row[] = history
    .map((h): Row | null => {
      const a = byId.get(h.asset_id);
      if (!a) return null;
      return {
        Date: h.recorded_date,
        Asset: a.name,
        Category: category(a),
        Currency: a.currency,
        Value: h.value,
        "Net value": h.net_equity ?? h.value,
      };
    })
    .filter((r): r is Row => r !== null)
    .sort((x, y) => String(x.Date).localeCompare(String(y.Date)) || String(x.Asset).localeCompare(String(y.Asset)));

  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: Row[], headers: string[]) => {
    if (rows.length === 0 && name !== "Summary" && name !== "Assets") return;
    XLSX.utils.book_append_sheet(wb, sheet(rows, headers), name);
  };
  add("Summary", summaryRows, ["Item", "Value"]);
  add("Assets", assetRows, Object.keys(assetRows[0] ?? { Name: "" }));
  add("Liabilities", liabilityRows, ["Name", "Type", "Lender / detail", "Currency", "Amount owed", `Amount owed (${baseCurrency})`]);
  add("Real Estate", realEstateRows, Object.keys(realEstateRows[0] ?? {}));
  add("Brokerage", brokerageRows, Object.keys(brokerageRows[0] ?? {}));
  add("REIT", scpiRows, Object.keys(scpiRows[0] ?? {}));
  add("REIT Dividends", scpiDividendRows, ["REIT", "Quarter", "Payment date", "Amount", "Currency", "Status"]);
  add("Private Equity", peRows, Object.keys(peRows[0] ?? {}));
  add("PE Cash Flows", peFlowRows, ["Fund", "Type", "Date", "Amount", "Status"]);
  add("Companies", companyRows, Object.keys(companyRows[0] ?? {}));
  add("Valuation History", historyRows, ["Date", "Asset", "Category", "Currency", "Value", "Net value"]);

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
