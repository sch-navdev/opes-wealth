import { computeHoldingMetrics, parseEquityMetadata } from "@/lib/equities";
import { convertAmount } from "@/lib/fx";
import { grossAssetValue } from "@/lib/liabilities";
import {
  buildPassiveIncome,
  rentInWindow,
  type PassiveIncomeAsset,
  type PassiveIncomeRow,
  type PassiveIncomeSource,
} from "@/lib/passive-income";
import { calledCapital, parsePrivateEquityMetadata } from "@/lib/private-equity";
import { earnedGroupOf, expandIncomeStreams, type EarnedGroup, type IncomeStream } from "@/lib/income-streams";
import { calculateTotalCost, parseRealEstateMetadata } from "@/lib/real-estate";
import { parseScpiMetadata, scpiInvested } from "@/lib/scpi";

/**
 * Forward 12-month passive-income calendar. It reuses `buildPassiveIncome`
 * for the projected ANNUAL figure of each holding (same inputs the dashboard's
 * passive-income card gets: already ownership-scaled, so nothing is scaled
 * again here) and only decides WHICH MONTH each euro lands in:
 *
 *  - rental          tenancy contracts, pro-rated per calendar month with
 *                    `rentInWindow` (basis `contract`). The model stores no
 *                    cheque count / payment frequency, so rent is spread by days.
 *  - stocks / reit   the holding's recorded receipts of the SAME month a year
 *                    earlier; the holding's projected annual figure is split in
 *                    proportion to those (basis `history`). With no receipts to
 *                    copy (e.g. a REIT projected from a target yield) it is
 *                    split evenly over 4 quarterly payments, in months 3, 6, 9
 *                    and 12 of the window (basis `estimate`). A REIT whose only
 *                    source is dated "expected" ledger entries uses them at
 *                    their dates (basis `contract`).
 *  - private_equity  the recorded `projected_distributions`, at their due date
 *                    (basis `contract`).
 *  - fixed income    NOT modelled in the app (no bond/coupon/deposit-interest
 *                    fields), so it is not part of the calendar.
 *
 * The 12 buckets are whole calendar months starting with the month of
 * `startDate`, so the total can differ slightly from the card's rolling
 * "next 12 months" figure.
 *
 * Yield on cost = annual projected income ÷ cost basis of the income-producing
 * holdings. Cost basis: equities = average buy cost × shares held; REIT = shares
 * × subscription price; real estate = `calculateTotalCost` (price + acquisition
 * fees); private equity = called capital, else the commitment. Current yield =
 * the same income ÷ their market value. Only holdings with a known cost basis
 * (> 0) are in numerator and denominator of both ratios; both are `null` when
 * there are none (zero cost never divides).
 */
export type IncomeCalendarBasis = "contract" | "history" | "estimate";

export type IncomeCalendarItem = {
  assetId: string;
  name: string;
  source: PassiveIncomeSource;
  /** Base Currency. */
  amount: number;
  date?: string;
  basis: IncomeCalendarBasis;
};

/** One earned-income payment (a salary, a bonus...) in a month. Never part of the passive totals. */
export type EarnedCalendarItem = {
  streamId: string;
  name: string;
  /** Who pays it (employer / source name); may be empty. */
  source: string;
  group: EarnedGroup;
  /** Base Currency, NET. */
  amount: number;
  date: string;
};

export type IncomeCalendarMonth = {
  /** "YYYY-MM". */
  month: string;
  total: number;
  bySource: Record<PassiveIncomeSource, number>;
  items: IncomeCalendarItem[];
  /** Earned-income layer (only present when `streams` were given). NOT included in `total`. */
  earned?: Record<EarnedGroup, number>;
  earnedItems?: EarnedCalendarItem[];
};

export type IncomeCalendar = {
  months: IncomeCalendarMonth[];
  annualTotal: number;
  monthlyAverage: number;
  /** Month with the highest total; null when nothing is projected. */
  peakMonth: string | null;
  /** Annual income ÷ cost basis, percent (see file header). */
  yieldOnCostPct: number | null;
  /** Annual income ÷ market value, percent. */
  currentYieldPct: number | null;
  /** Sum of the cost basis used, Base Currency. */
  costBasis: number;
  /** Market value of the holdings in the yield figures, Base Currency. */
  marketValue: number;
};

export type IncomeCalendarInput = {
  assets: PassiveIncomeAsset[];
  rates: Record<string, number>;
  baseCurrency: string;
  /** ISO date (YYYY-MM-DD); the calendar starts with this date's month. */
  startDate: string;
  /** Optional earned-income streams (salary, bonus...) for the separate earned-income layer. */
  streams?: IncomeStream[];
};

const MONTHS = 12;
const QUARTER_INDEXES = [2, 5, 8, 11];

const emptyBySource = (): Record<PassiveIncomeSource, number> => ({
  reit: 0,
  stocks: 0,
  rental: 0,
  private_equity: 0,
});

function monthKey(year: number, monthIndex: number): string {
  const y = year + Math.floor(monthIndex / 12);
  const m = ((monthIndex % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function monthBounds(key: string): { from: string; to: string } {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
}

function yearAgoKey(key: string): string {
  const [y, m] = key.split("-");
  return `${Number(y) - 1}-${m}`;
}

function shiftYear(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

type Receipt = { date: string; amount: number };

function receiptsOf(asset: PassiveIncomeAsset, source: PassiveIncomeSource): Receipt[] {
  if (source === "stocks") {
    return (parseEquityMetadata(asset.metadata).income ?? []).filter((e) => Number.isFinite(e.amount));
  }
  return parseScpiMetadata(asset.metadata).dividends.filter((d) => Number.isFinite(d.amount));
}

function costOf(asset: PassiveIncomeAsset, source: PassiveIncomeSource): number {
  if (source === "reit") return scpiInvested(parseScpiMetadata(asset.metadata), asset.quantity);
  if (source === "stocks") {
    return (
      computeHoldingMetrics({
        quantity: asset.quantity,
        currentValue: asset.current_value,
        metadata: parseEquityMetadata(asset.metadata),
      }).cost ?? 0
    );
  }
  if (source === "rental") {
    const md = parseRealEstateMetadata(asset.metadata);
    return calculateTotalCost(md, md.market_valuation ?? asset.current_value);
  }
  const md = parsePrivateEquityMetadata(asset.metadata);
  return calledCapital(md) > 0 ? calledCapital(md) : (md.commitment_amount ?? 0);
}

export function buildIncomeCalendar(input: IncomeCalendarInput): IncomeCalendar {
  const { assets, rates, baseCurrency, startDate } = input;
  const toBase = (amount: number, currency: string) => convertAmount(amount, currency, baseCurrency, rates);

  const startYear = Number(startDate.slice(0, 4));
  const startMonth = Number(startDate.slice(5, 7)) - 1;
  const months: IncomeCalendarMonth[] = Array.from({ length: MONTHS }, (_, i) => ({
    month: monthKey(startYear, startMonth + i),
    total: 0,
    bySource: emptyBySource(),
    items: [],
  }));
  const keys = months.map((m) => m.month);
  const windowFrom = monthBounds(keys[0]).from;
  const windowTo = monthBounds(keys[MONTHS - 1]).to;

  const summary = buildPassiveIncome(assets, startDate, toBase, (a) => toBase(grossAssetValue(a), a.currency));
  const rowById = new Map<string, PassiveIncomeRow>(summary.rows.map((r) => [r.id, r]));

  const add = (item: IncomeCalendarItem, index: number) => {
    if (!(item.amount > 0)) return;
    const bucket = months[index];
    bucket.items.push(item);
    bucket.total += item.amount;
    bucket.bySource[item.source] += item.amount;
  };

  const producing: { asset: PassiveIncomeAsset; source: PassiveIncomeSource; annual: number }[] = [];

  for (const asset of assets) {
    const row = rowById.get(asset.id);
    if (!row || asset.is_liability) continue;
    const base = { assetId: asset.id, name: asset.name, source: row.source };
    let annual = 0;

    if (row.source === "rental") {
      const contracts = parseRealEstateMetadata(asset.metadata).tenancy_contracts ?? [];
      keys.forEach((key, i) => {
        const { from, to } = monthBounds(key);
        const amount = toBase(rentInWindow(contracts, from, to), asset.currency);
        add({ ...base, amount, date: from, basis: "contract" }, i);
        annual += amount;
      });
    } else if (row.source === "private_equity") {
      for (const d of parsePrivateEquityMetadata(asset.metadata).projected_distributions) {
        if (d.due_date < windowFrom || d.due_date > windowTo) continue;
        const amount = toBase(d.amount, asset.currency);
        add({ ...base, amount, date: d.due_date, basis: "contract" }, keys.indexOf(d.due_date.slice(0, 7)));
        annual += amount;
      }
    } else if (row.method === "scheduled") {
      for (const d of parseScpiMetadata(asset.metadata).dividends) {
        if (d.status !== "expected" || d.date < windowFrom || d.date > windowTo) continue;
        const amount = toBase(d.amount, asset.currency);
        add({ ...base, amount, date: d.date, basis: "contract" }, keys.indexOf(d.date.slice(0, 7)));
        annual += amount;
      }
    } else if (row.projected > 0) {
      const receipts = receiptsOf(asset, row.source);
      const perMonth = keys.map((key) => {
        const prev = yearAgoKey(key);
        const hits = receipts.filter((r) => r.date.slice(0, 7) === prev && r.amount > 0);
        return {
          amount: hits.reduce((s, r) => s + r.amount, 0),
          date: hits.length ? shiftYear(hits.map((h) => h.date).sort().at(-1) as string, 1) : undefined,
        };
      });
      const histTotal = perMonth.reduce((s, m) => s + m.amount, 0);
      if (histTotal > 0) {
        perMonth.forEach((m, i) => {
          const amount = (row.projected * m.amount) / histTotal;
          add({ ...base, amount, date: m.date, basis: "history" }, i);
          annual += amount;
        });
      } else {
        for (const i of QUARTER_INDEXES) {
          const amount = row.projected / QUARTER_INDEXES.length;
          add({ ...base, amount, basis: "estimate" }, i);
          annual += amount;
        }
      }
    }

    if (annual > 0) producing.push({ asset, source: row.source, annual });
  }

  const annualTotal = months.reduce((s, m) => s + m.total, 0);
  let peakMonth: string | null = null;
  let peak = 0;
  for (const m of months) {
    if (m.total > peak) {
      peak = m.total;
      peakMonth = m.month;
    }
  }

  let costBasis = 0;
  let marketValue = 0;
  let costedIncome = 0;
  for (const p of producing) {
    const cost = toBase(costOf(p.asset, p.source), p.asset.currency);
    if (!(cost > 0)) continue;
    costBasis += cost;
    marketValue += toBase(grossAssetValue(p.asset), p.asset.currency);
    costedIncome += p.annual;
  }

  // Earned-income layer: attached to the months but kept out of every passive figure above.
  if (input.streams && input.streams.length > 0) {
    for (const m of months) {
      m.earned = { salary: 0, bonus: 0, gratuity: 0, other: 0 };
      m.earnedItems = [];
    }
    for (const o of expandIncomeStreams(input.streams, keys[0], rates, baseCurrency, MONTHS)) {
      const bucket = months[keys.indexOf(o.month)];
      if (!bucket?.earned || !bucket.earnedItems) continue;
      const group = earnedGroupOf(o.kind);
      bucket.earned[group] += o.baseAmount;
      bucket.earnedItems.push({ streamId: o.streamId, name: o.label, source: o.source, group, amount: o.baseAmount, date: o.date });
    }
  }

  return {
    months,
    annualTotal,
    monthlyAverage: annualTotal / MONTHS,
    peakMonth,
    yieldOnCostPct: costBasis > 0 ? (costedIncome / costBasis) * 100 : null,
    currentYieldPct: marketValue > 0 ? (costedIncome / marketValue) * 100 : null,
    costBasis,
    marketValue,
  };
}
