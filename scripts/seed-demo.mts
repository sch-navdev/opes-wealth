/**
 * Demo-account seeder: creates (or resets) demo@opeswealth.com and fills it
 * with a rich, clearly fictional portfolio — multi-currency bank accounts,
 * real estate with amortizing loans (plus an off-plan unit), private equity
 * with capital calls, a brokerage account, vehicles, a startup holding with
 * funding rounds, exotic assets (watch, fine wine, art) and standalone
 * liabilities — each with a monthly value history.
 *
 * It is a SCRIPT, not a migration, on purpose: a migration would create a
 * known-password account in every environment it reaches (including
 * production) automatically. Run it by hand, against the project you mean:
 *
 *   node --env-file=.env.local scripts/seed-demo.mts --dry-run   # build + summarize, touches nothing
 *   node --env-file=.env.local scripts/seed-demo.mts --yes       # create/reset the demo user and data
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the service
 * role bypasses RLS). Re-running is safe: it deletes ONLY the demo user's own
 * assets (history cascades) and re-inserts them. Override the credentials
 * with DEMO_EMAIL / DEMO_PASSWORD. Uses Node's built-in TypeScript support
 * (Node 22.18+/24), so only erasable syntax is allowed here.
 *
 * All names, VINs, account references and prices are invented. Quotes are
 * illustrative (the app's own price refresh will replace them with live
 * data), not market data.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@opeswealth.com";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "DemoPassword2026!";

type Json = Record<string, unknown>;
type Point = { date: string; value: number; netEquity?: number };

type SeedAsset = {
  id: string;
  category: string;
  name: string;
  ticker: string | null;
  quantity: number;
  currentValue: number;
  currency: string;
  isLiability: boolean;
  purchaseDate: string;
  metadata: Json;
  history: Point[];
};

// ---------------------------------------------------------------------------
// Dates and deterministic series (no randomness: re-runs give identical data)
// ---------------------------------------------------------------------------

const TODAY = new Date().toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** `from`, then the 1st of every following month before `to`, then `to`. */
function monthPoints(from: string, to: string): string[] {
  const out = [from];
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  while (d.toISOString().slice(0, 10) < to) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  if (to > from) out.push(to);
  return out;
}

const wiggle = (i: number, seed: number) =>
  0.6 * Math.sin(i * 1.7 + seed) + 0.4 * Math.sin(i * 0.55 + seed * 2.3);

/**
 * Monthly path from `start` to `end`: a straight line with a deterministic
 * ripple (`amp` = fraction of the level) that fades to zero at both ends, so
 * the first and last points are exact.
 */
function path(from: string, to: string, start: number, end: number, amp: number, seed: number): Point[] {
  const dates = monthPoints(from, to);
  const n = dates.length - 1;
  return dates.map((date, i) => {
    if (i === 0) return { date, value: round2(start) };
    if (i === n) return { date, value: round2(end) };
    const t = i / n;
    const base = start + (end - start) * t;
    return { date, value: round2(base * (1 + amp * wiggle(i, seed) * Math.sin(Math.PI * t))) };
  });
}

// ---------------------------------------------------------------------------
// Loan engine — a copy of src/lib/amortization.ts (this script can't import
// the app's `@/` paths). Keep the two in step if the app's maths changes.
// ---------------------------------------------------------------------------

type Loan = {
  lender_name: string;
  amount: number | null;
  interest_rate: number | null;
  duration_months: number | null;
  start_date: string;
  monthly_payment: number | null;
  outstanding_principal: number | null;
  rate_type: "fixed" | "hybrid";
  fixed_period_months: number | null;
  variable_margin: number | null;
  reference_rate: number | null;
  floor_rate: number | null;
  salary_transfer_active: boolean;
  fallback_rate: number | null;
};

function rateForMonth(loan: Loan, month: number): number {
  const fixed = loan.interest_rate ?? 0;
  if (loan.rate_type !== "hybrid") return fixed;
  if (month <= (loan.fixed_period_months ?? 0)) return fixed;
  if (!loan.salary_transfer_active) return Math.max(loan.fallback_rate ?? fixed, loan.floor_rate ?? -Infinity);
  return Math.max((loan.reference_rate ?? 0) + (loan.variable_margin ?? 0), loan.floor_rate ?? -Infinity);
}

function levelPayment(principal: number, monthlyRate: number, months: number): number {
  if (months <= 0) return principal;
  if (monthlyRate === 0) return principal / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return (principal * monthlyRate * factor) / (factor - 1);
}

function schedule(loan: Loan): { date: string; payment: number; balance: number }[] {
  const total = loan.duration_months as number;
  const rows: { date: string; payment: number; balance: number }[] = [];
  let balance = loan.amount as number;
  let payment = 0;
  let prevRate: number | null = null;
  for (let m = 1; m <= total && balance > 0.01; m++) {
    const rate = rateForMonth(loan, m);
    const mr = rate / 100 / 12;
    if (rate !== prevRate) {
      payment = levelPayment(balance, mr, total - m + 1);
      prevRate = rate;
    }
    const interest = balance * mr;
    let principal = payment - interest;
    let paid = payment;
    if (principal > balance) {
      principal = balance;
      paid = principal + interest;
    }
    balance = Math.max(0, balance - principal);
    rows.push({ date: addMonths(loan.start_date, m), payment: paid, balance });
  }
  return rows;
}

function outstandingAt(loan: Loan, date: string): number {
  if (date <= loan.start_date) return loan.amount as number;
  let balance = loan.amount as number;
  for (const row of schedule(loan)) {
    if (row.date > date) break;
    balance = row.balance;
  }
  return balance;
}

function makeLoan(partial: Partial<Loan> & Pick<Loan, "lender_name" | "amount" | "interest_rate" | "duration_months" | "start_date">): Loan {
  const loan: Loan = {
    monthly_payment: null,
    outstanding_principal: null,
    rate_type: "fixed",
    fixed_period_months: null,
    variable_margin: null,
    reference_rate: null,
    floor_rate: null,
    salary_transfer_active: true,
    fallback_rate: null,
    ...partial,
  };
  loan.monthly_payment = Math.round(schedule(loan)[0]?.payment ?? 0);
  loan.outstanding_principal = round2(outstandingAt(loan, TODAY));
  return loan;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

const assets: SeedAsset[] = [];

function addAsset(a: Omit<SeedAsset, "id" | "quantity" | "ticker" | "isLiability"> & Partial<Pick<SeedAsset, "quantity" | "ticker" | "isLiability">>) {
  assets.push({ id: randomUUID(), quantity: 1, ticker: null, isLiability: false, ...a });
}

// ---- Cash & bank accounts (logos come from `bank_key`) ---------------------

type CashDef = { bank: string; key: string; name: string; type: string; currency: string; balance: number; opened: string; ref: string };

const cashAccounts: CashDef[] = [
  { bank: "Emirates NBD", key: "enbd", name: "Emirates NBD Current Account", type: "checking", currency: "AED", balance: 285400, opened: "2022-01-10", ref: "4471" },
  { bank: "Wio Bank", key: "wio", name: "Wio Savings Space", type: "savings", currency: "AED", balance: 640000, opened: "2023-04-02", ref: "9023" },
  { bank: "First Abu Dhabi Bank", key: "fab", name: "FAB USD Account", type: "checking", currency: "USD", balance: 120000, opened: "2022-09-15", ref: "6612" },
  { bank: "ADCB", key: "adcb", name: "ADCB 12-Month Term Deposit", type: "term_deposit", currency: "AED", balance: 500000, opened: "2025-11-01", ref: "3308" },
  { bank: "BNP Paribas", key: "bnp_paribas", name: "BNP Paribas Compte Courant", type: "checking", currency: "EUR", balance: 48750, opened: "2019-09-01", ref: "2210" },
  { bank: "BoursoBank", key: "boursobank", name: "BoursoBank Livret Épargne", type: "savings", currency: "EUR", balance: 62300, opened: "2021-06-20", ref: "7745" },
];

cashAccounts.forEach((c, i) => {
  const from = addMonths(TODAY, c.type === "term_deposit" ? -11 : -30);
  const start = c.opened > from ? c.opened : from;
  const startBalance = c.type === "term_deposit" ? c.balance : c.balance * (0.78 + 0.02 * (i % 3));
  addAsset({
    category: "Cash",
    name: c.name,
    currentValue: c.balance,
    currency: c.currency,
    purchaseDate: start,
    metadata: {
      institution_name: c.bank,
      bank_key: c.key,
      account_type: c.type,
      account_ref: c.ref,
      bank_profile: c.key,
    },
    history: path(start, TODAY, startBalance, c.balance, c.type === "checking" ? 0.06 : 0.015, i + 1),
  });
});

// ---- Real estate -----------------------------------------------------------

const person = [{ name: "Demo Investor", percentage: 100 }];
const noCondition = { kitchen: "", bathrooms: "", flooring: "", windows: "", general: "" };

type PropertyDef = {
  name: string;
  address: string;
  propertyType: string;
  currency: string;
  purchaseDate: string;
  purchasePrice: number;
  market: number;
  fees: number;
  feeType: "Notary" | "RERA" | "ADM";
  agency: number;
  loan: Loan;
  area: number;
  rooms: number;
  year: string;
  epc: string;
  seed: number;
};

const properties: PropertyDef[] = [
  {
    name: "Palm Jumeirah Villa (Frond K)",
    address: "Frond K, Palm Jumeirah, Dubai, UAE",
    propertyType: "Villa",
    currency: "AED",
    purchaseDate: "2021-03-15",
    purchasePrice: 8200000,
    market: 10450000,
    fees: 328000,
    feeType: "RERA",
    agency: 164000,
    area: 4200,
    rooms: 5,
    year: "2009",
    epc: "",
    seed: 11,
    loan: makeLoan({
      lender_name: "Emirates NBD",
      amount: 5740000,
      interest_rate: 3.99,
      duration_months: 300,
      start_date: "2021-04-01",
      rate_type: "hybrid",
      fixed_period_months: 60,
      variable_margin: 1.79,
      reference_rate: 3.9,
      floor_rate: 3.5,
    }),
  },
  {
    name: "Downtown Apartment (Burj Vista)",
    address: "Burj Vista Tower 1, Downtown Dubai, UAE",
    propertyType: "Apartment",
    currency: "AED",
    purchaseDate: "2022-06-01",
    purchasePrice: 2150000,
    market: 2780000,
    fees: 86000,
    feeType: "RERA",
    agency: 43000,
    area: 1380,
    rooms: 2,
    year: "2017",
    epc: "",
    seed: 23,
    loan: makeLoan({
      lender_name: "Mashreq",
      amount: 1505000,
      interest_rate: 4.25,
      duration_months: 240,
      start_date: "2022-07-01",
    }),
  },
  {
    name: "Paris 16e Apartment",
    address: "Avenue Victor Hugo, 75116 Paris, France",
    propertyType: "Apartment",
    currency: "EUR",
    purchaseDate: "2019-09-10",
    purchasePrice: 720000,
    market: 835000,
    fees: 54000,
    feeType: "Notary",
    agency: 0,
    area: 78,
    rooms: 3,
    year: "1932",
    epc: "C",
    seed: 37,
    loan: makeLoan({
      lender_name: "BNP Paribas",
      amount: 504000,
      interest_rate: 1.45,
      duration_months: 240,
      start_date: "2019-10-05",
    }),
  },
];

properties.forEach((p) => {
  const loanBalanceToday = p.loan.outstanding_principal ?? 0;
  const history = path(p.purchaseDate, TODAY, p.purchasePrice, p.market, 0.012, p.seed).map((pt) => ({
    ...pt,
    netEquity: round2(pt.value - outstandingAt(p.loan, pt.date)),
  }));
  addAsset({
    category: "Real Estate",
    name: p.name,
    currentValue: round2(p.market - loanBalanceToday),
    currency: p.currency,
    purchaseDate: p.purchaseDate,
    metadata: {
      address: p.address,
      propertyType: p.propertyType,
      automaticEstimation: false,
      elevator: p.propertyType === "Apartment",
      newConstruction: false,
      furnished: false,
      purchasePrice: p.purchasePrice,
      agencyFees: p.agency || null,
      registration_fee_type: p.feeType,
      registration_fee_amount: p.fees,
      surfaceArea: p.area,
      internal_area: p.area,
      terrace_area: null,
      floors: 1,
      rooms: p.rooms,
      garageCount: p.propertyType === "Villa" ? 2 : 1,
      yearOfConstruction: p.year,
      epcRating: p.epc,
      condition: { ...noCondition, general: "Good" },
      ownership: person,
      emirate: "dubai",
      is_offplan: false,
      market_valuation: p.market,
      paid_to_date: 0,
      outstanding_balance: 0,
      payment_schedule: [],
      linked_loan: p.loan,
      tenancy_contracts: [],
      property_expenses: [],
    },
    history,
  });
});

// Off-plan unit: 30% paid, 70% still owed in instalments (counts as a liability).
{
  const contract = 1950000;
  const pct = (p: number) => Math.round((contract * p) / 100);
  const milestones = [
    { id: "ms-1", milestone: "Booking", due_date: "2025-02-15", percentage: 10, status: "paid" },
    { id: "ms-2", milestone: "Foundation complete", due_date: "2025-08-15", percentage: 10, status: "paid" },
    { id: "ms-3", milestone: "Structure 25%", due_date: "2026-02-15", percentage: 10, status: "paid" },
    { id: "ms-4", milestone: "Structure 50%", due_date: "2027-02-15", percentage: 10, status: "pending" },
    { id: "ms-5", milestone: "Structure 75%", due_date: "2027-08-15", percentage: 10, status: "pending" },
    { id: "ms-6", milestone: "Facade complete", due_date: "2028-02-15", percentage: 10, status: "pending" },
    { id: "ms-7", milestone: "Handover", due_date: "2028-09-30", percentage: 40, status: "pending" },
  ].map((m) => ({ ...m, amount: pct(m.percentage) }));
  const paid = milestones.filter((m) => m.status === "paid").reduce((s, m) => s + m.amount, 0);
  const outstanding = contract - paid;
  const market = 2210000;
  const outstandingAtDate = (date: string) =>
    contract - milestones.filter((m) => m.status === "paid" && m.due_date <= date).reduce((s, m) => s + m.amount, 0);
  addAsset({
    category: "Real Estate",
    name: "Dubai Creek Harbour Off-Plan Unit",
    currentValue: round2(market - outstanding),
    currency: "AED",
    purchaseDate: "2025-02-15",
    metadata: {
      address: "Creek Edge Tower 2, Dubai Creek Harbour, Dubai, UAE",
      propertyType: "Apartment",
      newConstruction: true,
      purchasePrice: contract,
      registration_fee_type: "RERA",
      registration_fee_amount: Math.round(contract * 0.04),
      surfaceArea: 1120,
      internal_area: 1120,
      rooms: 2,
      yearOfConstruction: "2028",
      ownership: person,
      emirate: "dubai",
      is_offplan: true,
      market_valuation: market,
      contract_price: contract,
      paid_to_date: paid,
      outstanding_balance: outstanding,
      payment_schedule: milestones,
      completion_percentage: 38,
      escrow_balance_status: "Active",
    },
    history: path("2025-02-15", TODAY, contract, market, 0.01, 51).map((pt) => ({
      ...pt,
      netEquity: round2(pt.value - outstandingAtDate(pt.date)),
    })),
  });
}

// ---- Private equity --------------------------------------------------------

type CallDef = { date: string; pct: number; status: "paid" | "pending" };

function privateEquity(opts: {
  name: string;
  entity: string;
  manager: string;
  strategy: string;
  vintage: string;
  stage: string;
  commitment: number;
  calls: CallDef[];
  nav: number;
  distributions: number;
  multiple: number;
  ownership: number;
  start: string;
  seed: number;
}) {
  const calls = opts.calls.map((c, i) => ({
    id: `call-${i + 1}`,
    due_date: c.date,
    amount: Math.round((opts.commitment * c.pct) / 100),
    percentage: c.pct,
    status: c.status,
  }));
  const paidIn = calls.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);
  addAsset({
    category: "Private Equity",
    name: opts.name,
    currentValue: opts.nav,
    currency: "USD",
    purchaseDate: opts.start,
    metadata: {
      share_class: "Class A",
      ownership_percentage: opts.ownership,
      entity_name: opts.entity,
      manager: opts.manager,
      strategy: opts.strategy,
      vintage_year: opts.vintage,
      lifecycle_stage: opts.stage,
      commitment_amount: opts.commitment,
      capital_calls: calls,
      called_capital_manual: null,
      distributions_to_date: opts.distributions,
      nav_date: addMonths(TODAY, -3),
      count_unfunded_as_liability: true,
      projection_mode: "model",
      projected_distributions: [],
      expected_multiple: opts.multiple,
      expected_irr_manual: null,
    },
    // NAV tracks paid-in capital early on, then drifts up toward the reported NAV.
    history: path(opts.start, TODAY, calls[0] ? calls[0].amount : paidIn, opts.nav, 0.02, opts.seed),
  });
}

privateEquity({
  name: "Apex Global Private Equity Fund IV",
  entity: "Apex PE IV Feeder SPV",
  manager: "Apex Capital Partners",
  strategy: "Mid-market buyout, global",
  vintage: "2023",
  stage: "investment_period",
  commitment: 500000,
  calls: [
    { date: "2023-06-30", pct: 25, status: "paid" },
    { date: "2024-03-31", pct: 25, status: "paid" },
    { date: "2025-09-30", pct: 20, status: "paid" },
    { date: "2026-12-31", pct: 15, status: "pending" },
    { date: "2027-06-30", pct: 15, status: "pending" },
  ],
  nav: 412000,
  distributions: 0,
  multiple: 1.8,
  ownership: 2.5,
  start: "2023-06-30",
  seed: 61,
});

privateEquity({
  name: "Gulf Growth Equity Partners II",
  entity: "Gulf Growth II Co-Invest LP",
  manager: "Gulf Growth Partners",
  strategy: "Growth equity, MENA technology and healthcare",
  vintage: "2021",
  stage: "harvest",
  commitment: 250000,
  calls: [
    { date: "2021-09-30", pct: 40, status: "paid" },
    { date: "2022-06-30", pct: 40, status: "paid" },
    { date: "2023-03-31", pct: 20, status: "paid" },
  ],
  nav: 268000,
  distributions: 85000,
  multiple: 2.1,
  ownership: 1.2,
  start: "2021-09-30",
  seed: 73,
});

// ---- Brokerage (Equities) --------------------------------------------------

type TradeDef = { date: string; side: "buy" | "sell"; qty: number; price: number };
type EquityDef = {
  ticker: string;
  name: string;
  isin: string;
  exchange: string;
  mic: string;
  currency: string;
  trades: TradeDef[];
  last: number;
  income?: { date: string; perShare: number }[];
  seed: number;
};

const equities: EquityDef[] = [
  { ticker: "AAPL", name: "Apple Inc.", isin: "US0378331005", exchange: "NASDAQ", mic: "XNAS", currency: "USD", last: 228.4, seed: 3,
    trades: [{ date: "2023-03-14", side: "buy", qty: 80, price: 142.5 }, { date: "2024-01-22", side: "buy", qty: 40, price: 171.2 }],
    income: [{ date: "2025-02-13", perShare: 0.25 }, { date: "2025-08-14", perShare: 0.26 }] },
  { ticker: "MSFT", name: "Microsoft Corporation", isin: "US5949181045", exchange: "NASDAQ", mic: "XNAS", currency: "USD", last: 468, seed: 5,
    trades: [{ date: "2022-11-08", side: "buy", qty: 45, price: 285 }, { date: "2024-06-03", side: "buy", qty: 15, price: 402 }] },
  { ticker: "NVDA", name: "NVIDIA Corporation", isin: "US67066G1040", exchange: "NASDAQ", mic: "XNAS", currency: "USD", last: 182, seed: 7,
    trades: [{ date: "2023-06-12", side: "buy", qty: 150, price: 46.8 }, { date: "2025-02-10", side: "sell", qty: 30, price: 138 }] },
  { ticker: "ASML", name: "ASML Holding N.V.", isin: "NL0010273215", exchange: "EURONEXT", mic: "XAMS", currency: "EUR", last: 745, seed: 9,
    trades: [{ date: "2023-09-05", side: "buy", qty: 12, price: 598 }, { date: "2025-04-02", side: "buy", qty: 8, price: 702 }] },
  { ticker: "MC", name: "LVMH Moët Hennessy Louis Vuitton", isin: "FR0000121014", exchange: "EURONEXT", mic: "XPAR", currency: "EUR", last: 640, seed: 13,
    trades: [{ date: "2022-10-03", side: "buy", qty: 20, price: 805 }] },
  { ticker: "TTE", name: "TotalEnergies SE", isin: "FR0000120271", exchange: "EURONEXT", mic: "XPAR", currency: "EUR", last: 58.9, seed: 17,
    trades: [{ date: "2023-02-20", side: "buy", qty: 300, price: 54.2 }],
    income: [{ date: "2025-03-28", perShare: 0.79 }, { date: "2025-07-03", perShare: 0.85 }, { date: "2025-10-02", perShare: 0.85 }] },
];

equities.forEach((e, idx) => {
  const trades = e.trades.map((t, i) => ({
    id: `${e.ticker.toLowerCase()}-${i + 1}`,
    tradeDate: t.date,
    side: t.side,
    quantity: t.qty,
    price: t.price,
    currency: e.currency,
    source: "manual",
  }));
  const qtyAt = (date: string) =>
    e.trades.filter((t) => t.date <= date).reduce((q, t) => q + (t.side === "buy" ? t.qty : -t.qty), 0);
  const quantity = qtyAt(TODAY);
  const first = e.trades[0];
  const prices = path(first.date, TODAY, first.price, e.last, 0.09, e.seed);
  const income = (e.income ?? []).map((inc, i) => ({
    id: `${e.ticker.toLowerCase()}-div-${i + 1}`,
    date: inc.date,
    amount: round2(qtyAt(inc.date) * inc.perShare),
  }));
  addAsset({
    category: "Equities",
    name: e.name,
    ticker: e.ticker,
    quantity,
    currentValue: round2(quantity * e.last),
    currency: e.currency,
    purchaseDate: first.date,
    metadata: {
      account_id: "DEMO-100200",
      account_name: "Demo Brokerage Account",
      instrument_name: e.name,
      isin: e.isin,
      exchange: e.exchange,
      exchange_mic: e.mic,
      last_unit_price: e.last,
      last_priced_at: null,
      last_price_source: null,
      trades,
      income,
      total_income: round2(income.reduce((s, i) => s + i.amount, 0)),
    },
    history: prices.map((pt) => ({ date: pt.date, value: round2(qtyAt(pt.date) * pt.value) })),
  });
  void idx;
});

// ---- Vehicles --------------------------------------------------------------

type VehicleDef = { name: string; make: string; model: string; year: string; plate: string; vin: string; currency: string; price: number; market: number; date: string; km: number; seed: number };

const vehicles: VehicleDef[] = [
  { name: "Porsche 911 Carrera S (992)", make: "Porsche", model: "911 Carrera S", year: "2023", plate: "DXB A 4471", vin: "WP0ZZZ992PS000101", currency: "AED", price: 640000, market: 575000, date: "2023-02-10", km: 21500, seed: 81 },
  { name: "Mercedes-Benz G 63 AMG", make: "Mercedes-Benz", model: "G 63 AMG", year: "2022", plate: "DXB B 9020", vin: "W1NYC7HJ5NX000202", currency: "AED", price: 720000, market: 690000, date: "2022-08-18", km: 38200, seed: 83 },
  { name: "Tesla Model Y Long Range", make: "Tesla", model: "Model Y Long Range", year: "2024", plate: "GH-482-KL", vin: "7SAYGDEE5RA000303", currency: "EUR", price: 52000, market: 38500, date: "2024-03-05", km: 27800, seed: 85 },
];

vehicles.forEach((v) => {
  // A dated expense ledger (metadata.expenses): a few entries a year since purchase.
  const plan: [number, string, string, number][] = [
    [4, "maintenance", "Annual service", 0.006],
    [7, "tires", "Tire replacement", 0.008],
    [10, "insurance", "Insurance renewal", 0.03],
    [14, "fuel", "Fuel and charging, quarter", 0.005],
    [16, "registration", "Registration renewal", 0.004],
    [22, "maintenance", "Brake service", 0.007],
    [26, "insurance", "Insurance renewal", 0.03],
  ];
  const expenses = plan
    .map(([months, category, description, pct], i) => ({
      id: `vexp-demo-${v.seed}-${i + 1}`,
      date: addMonths(v.date, months),
      category,
      description,
      amount: Math.round(v.price * pct),
    }))
    .filter((e) => e.date <= TODAY);
  addAsset({
    category: "Vehicles",
    name: v.name,
    currentValue: v.market,
    currency: v.currency,
    purchaseDate: v.date,
    metadata: {
      vin: v.vin,
      make: v.make,
      model: v.model,
      year: v.year,
      license_plate: v.plate,
      purchase_price: v.price,
      mileage: v.km,
      maintenance_costs: Math.round(v.price * 0.012),
      modifications: 0,
      insurance_registration: Math.round(v.price * 0.03),
      market_valuation: v.market,
      last_valuation_source: "manual",
      last_valuation_date: TODAY,
      expenses,
    },
    history: path(v.date, TODAY, v.price, v.market, 0.004, v.seed),
  });
});

// ---- Startups & unlisted (src/lib/startups.ts) -----------------------------
//
// Shares live in `quantity`; value = shares × the latest round's price. The
// funding rounds are metadata (no table), and the history steps at each round
// date, exactly as `startup-actions.ts` writes it.

{
  const shares = 25000;
  const avgCost = 0.8;
  const rounds = [
    { id: "round-demo-seed", date: "2023-03-15", name: "Seed", price_per_share: 1.2, post_money_valuation: 8000000 },
    { id: "round-demo-series-a", date: "2024-11-20", name: "Series A", price_per_share: 3.5, post_money_valuation: 42000000 },
  ];
  const purchaseDate = "2022-09-01";
  const latest = rounds[rounds.length - 1];
  const value = round2(shares * latest.price_per_share);
  addAsset({
    category: "Startups",
    name: "Lumen AI",
    quantity: shares,
    currentValue: value,
    currency: "USD",
    purchaseDate,
    metadata: {
      company_name: "Lumen AI (fictional)",
      sector: "Artificial intelligence / SaaS",
      investment_type: "direct_equity",
      avg_cost_per_share: avgCost,
      funding_rounds: rounds,
    },
    history: [
      { date: purchaseDate, value: round2(shares * avgCost) },
      ...rounds.map((r) => ({ date: r.date, value: round2(shares * r.price_per_share) })),
      { date: TODAY, value },
    ],
  });
}

// ---- Exotic assets (src/lib/exotic-assets.ts) ------------------------------
//
// One flat metadata shape with a `kind`; `purchase_price` is PER UNIT, and
// `current_value` is the total (units × unit value). Values are illustrative.

const exoticMetadata = (m: Json): Json => ({
  kind: "watch",
  brand: "",
  model: "",
  reference_number: "",
  year: null,
  condition: "very_good",
  box_papers: "full_set",
  serial_number: "",
  storage_location: "",
  producer: "",
  vintage: null,
  region: "",
  artist: "",
  title: "",
  art_year: null,
  medium: "",
  purchase_price: null,
  // Left empty on purpose so "Refresh market value" (live API) can be demoed.
  last_market_value: null,
  last_priced_at: null,
  last_price_source: null,
  ...m,
});

// a) Watch: a real reference (Rolex Submariner Date 126610LN) so the live
//    valuation fallback has something to look up; the serial number is invented.
addAsset({
  category: "Exotic Assets",
  name: "Rolex Submariner Date 126610LN",
  currentValue: 14200,
  currency: "USD",
  purchaseDate: "2022-06-10",
  metadata: exoticMetadata({
    kind: "watch",
    brand: "Rolex",
    model: "Submariner Date",
    reference_number: "126610LN",
    year: 2022,
    condition: "very_good",
    box_papers: "full_set",
    serial_number: "DEMO-0000-126610",
    storage_location: "Home safe, Dubai",
    purchase_price: 10250,
  }),
  history: path("2022-06-10", TODAY, 10250, 14200, 0.015, 91),
});

// b) Fine wine: 24 bottles of a Bordeaux first growth (quantity = bottles).
addAsset({
  category: "Exotic Assets",
  name: "Château Margaux 2015 (case collection)",
  quantity: 24,
  currentValue: 18720,
  currency: "EUR",
  purchaseDate: "2020-11-05",
  metadata: exoticMetadata({
    kind: "wine",
    producer: "Château Margaux",
    vintage: 2015,
    region: "Margaux, Bordeaux",
    storage_location: "Bonded wine storage, Bordeaux",
    purchase_price: 520,
  }),
  history: path("2020-11-05", TODAY, 24 * 520, 18720, 0.01, 93),
});

// c) Art: an invented artist and work.
addAsset({
  category: "Exotic Assets",
  name: "Horizon Bleu (Élise Marchand)",
  currentValue: 15500,
  currency: "EUR",
  purchaseDate: "2021-04-22",
  metadata: exoticMetadata({
    kind: "art",
    artist: "Élise Marchand (fictional)",
    title: "Horizon Bleu",
    art_year: 2019,
    medium: "Oil on canvas",
    storage_location: "Living room, Paris",
    purchase_price: 12000,
  }),
  history: path("2021-04-22", TODAY, 12000, 15500, 0.01, 97),
});

// ---- Standalone liabilities (balance owed is stored positive) ---------------

type DebtDef = { name: string; type: "loan" | "mortgage" | "credit_card"; lender: string; key?: string; currency: string; owed: number; rate: number | null; monthly: number | null; limit?: number; start: string; startOwed: number; ref?: string; seed: number };

const debts: DebtDef[] = [
  { name: "Personal Loan", type: "loan", lender: "Emirates NBD", currency: "AED", owed: 142000, rate: 5.49, monthly: 6150, start: "2024-05-01", startOwed: 260000, seed: 91 },
  { name: "Business Term Loan", type: "loan", lender: "Mashreq", currency: "AED", owed: 380000, rate: 6.1, monthly: 9800, start: "2023-10-01", startOwed: 600000, seed: 93 },
  { name: "G 63 Auto Finance", type: "loan", lender: "Mercedes-Benz Financial Services", currency: "AED", owed: 285000, rate: 3.2, monthly: 5300, start: "2022-09-01", startOwed: 432000, seed: 95 },
  { name: "Lyon Rental Flat Mortgage", type: "mortgage", lender: "Crédit Agricole", key: "credit_agricole", currency: "EUR", owed: 186000, rate: 2.35, monthly: 1120, start: "2020-03-01", startOwed: 245000, seed: 97 },
  { name: "Emirates NBD Credit Card", type: "credit_card", lender: "Emirates NBD", key: "enbd", currency: "AED", owed: 18430, rate: null, monthly: null, limit: 60000, start: addMonths(TODAY, -12), startOwed: 9200, ref: "8830", seed: 99 },
];

debts.forEach((d) => {
  addAsset({
    category: "Liabilities",
    name: d.name,
    currentValue: d.owed,
    currency: d.currency,
    isLiability: true,
    purchaseDate: d.start,
    metadata: {
      liability_type: d.type,
      lender_name: d.lender,
      interest_rate: d.rate,
      monthly_payment: d.monthly,
      credit_limit: d.limit ?? null,
      ...(d.key ? { bank_key: d.key, institution_name: d.lender } : {}),
      ...(d.type === "credit_card" ? { account_type: "credit_card", account_ref: d.ref } : {}),
    },
    history: path(d.start, TODAY, d.startOwed, d.owed, d.type === "credit_card" ? 0.3 : 0, d.seed).map((pt) => ({
      ...pt,
      netEquity: -pt.value,
    })),
  });
});

// ---------------------------------------------------------------------------
// Summary (rough USD view with fixed FX, only to sanity-check the picture)
// ---------------------------------------------------------------------------

const FX_TO_USD: Record<string, number> = { USD: 1, AED: 1 / 3.6725, EUR: 1.08 };
const usd = (amount: number, currency: string) => amount * (FX_TO_USD[currency] ?? 1);

function summarize() {
  let gross = 0;
  let debt = 0;
  const byCategory = new Map<string, number>();
  for (const a of assets) {
    if (a.isLiability) {
      debt += usd(a.currentValue, a.currency);
      continue;
    }
    const meta = a.metadata;
    if (a.category === "Real Estate") {
      const mv = (meta.market_valuation as number) ?? a.currentValue;
      gross += usd(mv, a.currency);
      debt += usd(mv - a.currentValue, a.currency);
      byCategory.set(a.category, (byCategory.get(a.category) ?? 0) + usd(mv, a.currency));
      continue;
    }
    if (a.category === "Private Equity") {
      const pending = ((meta.capital_calls as { status: string; amount: number }[]) ?? [])
        .filter((c) => c.status === "pending")
        .reduce((s, c) => s + c.amount, 0);
      debt += usd(pending, a.currency);
    }
    gross += usd(a.currentValue, a.currency);
    byCategory.set(a.category, (byCategory.get(a.category) ?? 0) + usd(a.currentValue, a.currency));
  }
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
  console.log(`Assets: ${assets.length}  History rows: ${assets.reduce((s, a) => s + a.history.length, 0)}`);
  for (const [cat, v] of byCategory) console.log(`  ${cat.padEnd(16)} ~USD ${fmt(v)}`);
  console.log(`Gross assets ~USD ${fmt(gross)}  Liabilities ~USD ${fmt(debt)}  Net worth ~USD ${fmt(gross - debt)}`);
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

async function seed() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use --env-file=.env.local).");

  console.log(`Target project: ${new URL(url).host}`);
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. The demo user (create, or reset the password of the existing one).
  let userId: string | null = null;
  for (let page = 1; !userId; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === DEMO_EMAIL.toLowerCase())?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (userId) {
    const { error } = await db.auth.admin.updateUserById(userId, { password: DEMO_PASSWORD, email_confirm: true });
    if (error) throw error;
    console.log(`Demo user exists (${userId}); password reset.`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: "Demo", last_name: "Investor" },
    });
    if (error || !data.user) throw error ?? new Error("createUser returned no user.");
    userId = data.user.id;
    console.log(`Demo user created (${userId}).`);
  }

  // 2. Profile (the signup trigger normally makes it; upsert covers the rest).
  const { error: profileError } = await db.from("profiles").upsert({
    id: userId,
    first_name: "Demo",
    last_name: "Investor",
    default_currency: "USD",
    address_city: "Dubai",
    address_country: "United Arab Emirates",
  });
  if (profileError) throw profileError;

  // 3. Reset ONLY this user's assets (asset_history and bank links cascade).
  const { error: wipeError } = await db.from("assets").delete().eq("profile_id", userId);
  if (wipeError) throw wipeError;

  // 4. Insert.
  const { data: categories, error: catError } = await db.from("asset_categories").select("id, name");
  if (catError) throw catError;
  const categoryId = (name: string) => {
    const found = categories?.find((c: { id: string; name: string }) => c.name === name);
    if (!found) throw new Error(`Category "${name}" is missing — apply the category migrations first.`);
    return found.id as string;
  };

  const { error: assetError } = await db.from("assets").insert(
    assets.map((a) => ({
      id: a.id,
      profile_id: userId,
      category_id: categoryId(a.category),
      name: a.name,
      ticker_symbol: a.ticker,
      quantity: a.quantity,
      current_value: a.currentValue,
      currency: a.currency,
      is_liability: a.isLiability,
      purchase_date: a.purchaseDate,
      metadata: a.metadata,
      images: [],
    })),
  );
  if (assetError) throw assetError;

  const historyRows = assets.flatMap((a) =>
    a.history.map((p) => ({
      asset_id: a.id,
      recorded_date: p.date,
      value: p.value,
      net_equity: p.netEquity ?? null,
      source: "manual",
    })),
  );
  for (let i = 0; i < historyRows.length; i += 500) {
    const { error } = await db.from("asset_history").insert(historyRows.slice(i, i + 500));
    if (error) throw error;
  }
  console.log(`Inserted ${assets.length} assets and ${historyRows.length} history rows.`);
  console.log(`Sign in as ${DEMO_EMAIL}.`);
}

const args = new Set(process.argv.slice(2));
summarize();
if (args.has("--dry-run")) {
  console.log("Dry run: nothing written.");
} else if (args.has("--yes")) {
  await seed();
} else {
  console.log("Not writing anything. Re-run with --yes to seed the project in your env file, or --dry-run to only preview.");
  process.exitCode = 1;
}
