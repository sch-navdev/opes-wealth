import { convertAmount } from "@/lib/fx";
import { expandIncomeStreams, summarizeIncomeStreams, type IncomeStream } from "@/lib/income-streams";

/**
 * Personal Cash Flow, steps 2 and 3 (pure, no I/O, never throws):
 *
 *   Net Investable Cash = (monthly income - planned liabilities per month) - daily life expenses
 *
 *  - income: monthly equivalents of the income streams (`lib/income-streams.ts`), one-offs excluded
 *    from the run-rate (they are reported separately);
 *  - planned liabilities: the monthly payments of the user's loans, mortgages and cards;
 *  - daily life expenses: the average monthly OUTFLOW of the imported bank transactions over the last
 *    N COMPLETE months, after three switchable exclusions (own-account transfers, payments of the
 *    liabilities already counted above, credit-card settlement lines), split essential / discretionary
 *    by a keyword classifier with per-merchant overrides.
 *  - emergency fund (l'epargne de precaution): target = M months x (essential expenses + planned
 *    liabilities), M between 3 and 6; while below it, 10-20 % of the Net Investable Cash is diverted.
 *
 * Informational only, not advice. Unknown inputs are `null` (the UI shows an en dash with a reason),
 * never 0.
 */

export type WaterfallTransaction = {
  assetId: string;
  /** YYYY-MM-DD */
  date: string;
  /** Signed: positive = money in. */
  amount: number;
  currency: string;
  description: string;
};

export type WaterfallLiability = {
  id: string;
  name: string;
  type: string;
  lender: string;
  /** Planned payment per month, in `currency`. */
  monthlyPayment: number;
  currency: string;
};

export type WaterfallCashAccount = {
  id: string;
  name: string;
  currency: string;
  /** Balance in the account's own currency. */
  balance: number;
  /** checking | savings | term_deposit | other | undefined (set by the Add account dialog). */
  accountType?: string;
  /** metadata.purpose; "emergency_fund" marks the account when it is stored on the asset. */
  purpose?: string;
};

export type ExclusionReason = "own_transfer_pair" | "own_transfer_text" | "card_settlement" | "liability_payment";
export type ExclusionToggle = "ownTransfers" | "cardSettlements" | "liabilityPayments";
export const EXCLUSION_TOGGLES: ExclusionToggle[] = ["ownTransfers", "liabilityPayments", "cardSettlements"];
export const REASON_TOGGLE: Record<ExclusionReason, ExclusionToggle> = {
  own_transfer_pair: "ownTransfers",
  own_transfer_text: "ownTransfers",
  card_settlement: "cardSettlements",
  liability_payment: "liabilityPayments",
};

export type ExpenseClass = "essential" | "discretionary";

export type CashFlowSettings = {
  /** Complete months averaged for the expenses, 1-12. */
  lookback: number;
  /** Emergency fund target in months, 3-6. */
  emergencyMonths: number;
  /** Share of the Net Investable Cash diverted to the emergency fund while it is not funded, 10-20. */
  divertPct: number;
  exclusions: Record<ExclusionToggle, boolean>;
  /** Per merchant key: the user's own essential / discretionary choice. */
  overrides: Record<string, ExpenseClass>;
  /** Used only when there are no transactions: essential share of the manual monthly expenses, 0-100. */
  fallbackEssentialPct: number;
  /** Monthly daily-life expenses typed in by hand (Base Currency); used only without transactions. */
  manualMonthlyExpenses: number | null;
  /** Cash accounts the user marks as "emergency fund". */
  emergencyAccountIds: string[];
};

export const DEFAULT_SETTINGS: CashFlowSettings = {
  lookback: 3,
  emergencyMonths: 6,
  divertPct: 15,
  exclusions: { ownTransfers: true, liabilityPayments: true, cardSettlements: true },
  overrides: {},
  fallbackEssentialPct: 60,
  manualMonthlyExpenses: null,
  emergencyAccountIds: [],
};

const clampInt = (v: unknown, min: number, max: number, dflt: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
};

/** Validates untrusted (stored) settings; anything unusable falls back to the default. */
export function normalizeSettings(raw: unknown): CashFlowSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ex = (r.exclusions && typeof r.exclusions === "object" ? r.exclusions : {}) as Record<string, unknown>;
  const overrides: Record<string, ExpenseClass> = {};
  if (r.overrides && typeof r.overrides === "object") {
    for (const [k, v] of Object.entries(r.overrides as Record<string, unknown>)) {
      if ((v === "essential" || v === "discretionary") && k.length > 0 && k.length <= 80) overrides[k] = v;
    }
  }
  const manualRaw = r.manualMonthlyExpenses;
  const manual = typeof manualRaw === "number" && Number.isFinite(manualRaw) && manualRaw >= 0 && manualRaw < 1e12 ? manualRaw : null;
  return {
    lookback: clampInt(r.lookback, 1, 12, DEFAULT_SETTINGS.lookback),
    emergencyMonths: clampInt(r.emergencyMonths, 3, 6, DEFAULT_SETTINGS.emergencyMonths),
    divertPct: clampInt(r.divertPct, 10, 20, DEFAULT_SETTINGS.divertPct),
    exclusions: {
      ownTransfers: ex.ownTransfers !== false,
      liabilityPayments: ex.liabilityPayments !== false,
      cardSettlements: ex.cardSettlements !== false,
    },
    overrides,
    fallbackEssentialPct: clampInt(r.fallbackEssentialPct, 0, 100, DEFAULT_SETTINGS.fallbackEssentialPct),
    manualMonthlyExpenses: manual,
    emergencyAccountIds: Array.isArray(r.emergencyAccountIds)
      ? (r.emergencyAccountIds as unknown[]).filter((x): x is string => typeof x === "string" && x.length <= 64).slice(0, 200)
      : [],
  };
}

// ---------------------------------------------------------------------------------------------
// Text helpers and keyword configuration
// ---------------------------------------------------------------------------------------------

/** Lower-case, accent-stripped, punctuation to spaces (letters and digits of any script kept). */
export function tokenize(raw: string): string {
  return (raw ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const padded = (s: string) => ` ${tokenize(s)} `;

/** True when any keyword (a word or a phrase, matched on whole words) occurs in the text. */
export function matchesAny(text: string, keywords: readonly string[]): boolean {
  const p = padded(text);
  return keywords.some((k) => p.includes(paddedKeyword(k)));
}

const keywordCache = new Map<string, string>();
function paddedKeyword(k: string): string {
  let v = keywordCache.get(k);
  if (v === undefined) {
    v = ` ${tokenize(k)} `;
    keywordCache.set(k, v);
  }
  return v;
}

/**
 * Keyword configuration. English, French and Arabic (Latin transliteration and a few Arabic-script
 * words). Whole-word matching, so "du" is only matched inside the explicit "du mobile" style phrases.
 * Anything not matched is DISCRETIONARY; the user overrides per merchant in the panel.
 */
export const ESSENTIAL_KEYWORDS: Record<string, readonly string[]> = {
  housing: ["rent", "rental", "loyer", "ejari", "ijar", "ijara", "igar", "إيجار", "service charge", "service charges", "charges de copropriete", "syndic", "taxe fonciere", "property tax", "municipality", "baladiya"],
  utilities: [
    "dewa", "sewa", "addc", "fewa", "aadc", "etisalat", "du mobile", "du telecom", "du postpaid", "du prepaid", "du bill",
    "electricity", "electricite", "edf", "engie", "veolia", "water", "eau", "gaz", "gas bill", "kahraba", "كهرباء", "utility", "utilities",
    "internet", "broadband", "wifi", "orange", "sfr", "bouygues", "free mobile", "telecom", "telephone", "mobile bill",
  ],
  groceries: [
    "grocery", "groceries", "supermarket", "supermarche", "courses", "carrefour", "lulu", "spinneys", "waitrose", "choithrams", "union coop",
    "coop", "monoprix", "leclerc", "auchan", "lidl", "aldi", "intermarche", "franprix", "picard", "naturalia", "hypermarket", "bakala", "baqala", "بقالة", "supermarket",
  ],
  insurance: ["insurance", "assurance", "axa", "allianz", "mutuelle", "takaful", "sukoon", "gig gulf", "orient insurance", "tamin", "تأمين"],
  education: ["school", "tuition", "ecole", "college", "universite", "university", "nursery", "creche", "kindergarten", "scolarite", "cantine", "khda", "madrasa", "madrassa", "مدرسة"],
  health: [
    "pharmacy", "pharmacie", "hospital", "hopital", "clinic", "clinique", "doctor", "medecin", "dentist", "dentiste", "medical", "mediclinic",
    "aster", "life pharmacy", "laboratoire", "optique", "optician", "sante", "saydaliya", "saydaliyah", "mustashfa", "mostashfa", "صيدلية", "مستشفى",
  ],
  transport: ["fuel", "petrol", "essence", "carburant", "adnoc", "enoc", "eppco", "emarat petrol", "total energies", "salik", "parking", "rta", "nol card", "navigo", "ratp", "sncf", "metro"],
  debt: ["loan", "mortgage", "pret", "emi", "credit immobilier", "echeance", "mensualite", "قرض"],
};

/** The loan-payment vocabulary used to recognise a liability payment (EN / FR / AR translit.). */
export const LOAN_KEYWORDS: readonly string[] = [
  "loan", "mortgage", "emi", "instalment", "installment", "pret", "credit immobilier", "echeance", "mensualite", "remboursement",
  "repayment", "finance", "financing", "tamweel", "qard", "قرض",
];

/** Phrases of a credit-card settlement line on a current-account statement. */
export const CARD_SETTLEMENT_KEYWORDS: readonly string[] = [
  "credit card payment", "credit card pmt", "card settlement", "cc payment", "payment to credit card", "payment to card",
  "visa card payment", "mastercard payment", "amex payment", "creditcard", "cr card payment", "card bill", "card repayment",
  "paiement carte de credit", "paiement carte credit", "reglement carte", "releve carte", "carte differe", "cb differe", "remboursement carte",
  "بطاقة ائتمان", "سداد بطاقة",
];

/** Phrases that explicitly say "to / from my own account". A bare "transfer" is NOT enough (it may pay a third party). */
export const OWN_TRANSFER_KEYWORDS: readonly string[] = [
  "own account", "own accounts", "between my accounts", "between accounts", "internal transfer", "transfer to savings", "transfer from savings",
  "transfer to own", "transfer from own", "to my account", "from my account", "savings transfer", "virement interne", "virement entre comptes",
  "virement compte a compte", "vers mon compte", "depuis mon compte", "vers livret", "depuis livret", "tahwil dakhili", "تحويل داخلي", "تحويل بين الحسابات",
];

/** Everything that decides the class of a merchant, by keyword group. */
export function essentialGroupOf(description: string): string | null {
  for (const [group, kws] of Object.entries(ESSENTIAL_KEYWORDS)) if (matchesAny(description, kws)) return group;
  return null;
}

const NOISE_TOKENS = new Set([
  "pos", "purchase", "card", "payment", "paiement", "carte", "cb", "to", "from", "ref", "dubai", "uae", "debit", "credit", "the", "de", "du", "la", "le",
  "achat", "prelevement", "sepa", "vir", "virement", "transfer", "online", "atm", "txn", "trx", "no", "number",
]);

/** A stable, human-readable key for a merchant: digits, reference noise and the usual prefixes removed, first 3 words. */
export function merchantKey(description: string): string {
  const tokens = tokenize(description)
    .split(" ")
    .filter((t) => t.length > 0 && !/\d/.test(t) && !NOISE_TOKENS.has(t));
  const key = tokens.slice(0, 3).join(" ");
  return key.slice(0, 60);
}

export function classifyExpense(description: string, overrides: Record<string, ExpenseClass> = {}): { class: ExpenseClass; key: string; group: string | null; overridden: boolean } {
  const key = merchantKey(description);
  const group = essentialGroupOf(description);
  const o = key ? overrides[key] : undefined;
  if (o) return { class: o, key, group, overridden: true };
  return { class: group ? "essential" : "discretionary", key, group, overridden: false };
}

// ---------------------------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------------------------

/** "YYYY-MM" keys of the `n` complete months before the month of `asOf` (YYYY-MM-DD), oldest first. */
export function lastCompleteMonths(asOf: string, n: number): string[] {
  const y = Number(asOf.slice(0, 4));
  const m = Number(asOf.slice(5, 7)) - 1;
  const out: string[] = [];
  for (let i = n; i >= 1; i--) {
    const idx = y * 12 + m - i;
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------------------------

export type ClassifiedTransaction = WaterfallTransaction & {
  index: number;
  /** Base-currency amount (signed). */
  base: number;
  month: string;
  /** Why the line is not part of the daily expenses, or null when it is counted. */
  reason: ExclusionReason | null;
  /** Matched liability for `liability_payment`. */
  liabilityId?: string;
};

/**
 * Pairs own-account transfers: two lines of DIFFERENT accounts, the same booked date, the same currency
 * and exactly opposite amounts. Each line is used once. Different-currency legs are not paired (too
 * easy to confuse with two unrelated payments).
 */
export function detectOwnTransferPairs(txs: WaterfallTransaction[]): Set<number> {
  const out = new Set<number>();
  const byKey = new Map<string, number[]>();
  txs.forEach((t, i) => {
    if (!(Math.abs(t.amount) > 0)) return;
    const k = `${t.date}|${t.currency}|${Math.abs(Math.round(t.amount * 100))}`;
    const list = byKey.get(k);
    if (list) list.push(i);
    else byKey.set(k, [i]);
  });
  for (const idxs of byKey.values()) {
    const outs = idxs.filter((i) => txs[i].amount < 0);
    const ins = idxs.filter((i) => txs[i].amount > 0);
    for (const o of outs) {
      const j = ins.findIndex((i) => !out.has(i) && txs[i].assetId !== txs[o].assetId);
      if (j >= 0 && !out.has(o)) {
        out.add(o);
        out.add(ins[j]);
      }
    }
  }
  return out;
}

const nameTokens = (s: string) => tokenize(s).split(" ").filter((t) => t.length >= 4 && !NOISE_TOKENS.has(t));

/**
 * Matches an OUTFLOW to one of the planned liabilities (so it is not counted twice). A line matches when
 *  (a) it names the lender / liability (a word of 4+ letters) and its amount is within 10 % of the
 *      planned payment, or
 *  (b) its amount is within 0.5 % of the planned payment AND the text carries loan vocabulary.
 * An equal amount with no supporting text is NOT enough. Amounts are compared in the liability currency
 * through the FX table.
 */
export function matchLiabilityPayment(
  tx: WaterfallTransaction,
  liabilities: WaterfallLiability[],
  rates: Record<string, number>,
): WaterfallLiability | null {
  if (!(tx.amount < 0)) return null;
  const amt = Math.abs(tx.amount);
  const text = padded(tx.description);
  const hasLoanWord = matchesAny(tx.description, LOAN_KEYWORDS);
  let best: { l: WaterfallLiability; diff: number } | null = null;
  for (const l of liabilities) {
    if (!(l.monthlyPayment > 0)) continue;
    const planned = convertAmount(l.monthlyPayment, l.currency, tx.currency, rates);
    if (!(planned > 0)) continue;
    const diff = Math.abs(amt - planned) / planned;
    const names = [...nameTokens(l.lender), ...nameTokens(l.name)];
    const named = names.some((t) => text.includes(` ${t} `));
    if ((named && diff <= 0.1) || (hasLoanWord && diff <= 0.005)) {
      if (!best || diff < best.diff) best = { l, diff };
    }
  }
  return best ? best.l : null;
}

export function classifyTransactions(
  txs: WaterfallTransaction[],
  liabilities: WaterfallLiability[],
  base: string,
  rates: Record<string, number>,
): ClassifiedTransaction[] {
  const pairs = detectOwnTransferPairs(txs);
  return txs.map((t, index) => {
    const baseAmt = convertAmount(t.amount, t.currency, base, rates);
    let reason: ExclusionReason | null = null;
    let liabilityId: string | undefined;
    if (pairs.has(index)) reason = "own_transfer_pair";
    else if (matchesAny(t.description, OWN_TRANSFER_KEYWORDS)) reason = "own_transfer_text";
    else if (matchesAny(t.description, CARD_SETTLEMENT_KEYWORDS)) reason = "card_settlement";
    else {
      const l = matchLiabilityPayment(t, liabilities, rates);
      if (l) {
        reason = "liability_payment";
        liabilityId = l.id;
      }
    }
    return { ...t, index, base: baseAmt, month: t.date.slice(0, 7), reason, liabilityId };
  });
}

// ---------------------------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------------------------

export type ExclusionSummary = { reason: ExclusionReason; toggle: ExclusionToggle; enabled: boolean; count: number; monthlyAvg: number };

export type MerchantRow = { key: string; class: ExpenseClass; overridden: boolean; group: string | null; monthlyAvg: number; count: number };

export type ExpenseAnalysis = {
  /** Months of the window (oldest first) and how many of them have at least one transaction. */
  windowMonths: string[];
  monthsWithData: number;
  hasTransactions: boolean;
  /** Average monthly daily-life expenses in the Base Currency (positive), or null without data. */
  monthlyTotal: number | null;
  monthlyEssential: number | null;
  monthlyDiscretionary: number | null;
  exclusions: ExclusionSummary[];
  merchants: MerchantRow[];
  /** Counted expense per month of the window (Base Currency, positive); null when the month has no transactions. */
  perMonth: Record<string, number | null>;
  source: "transactions" | "manual" | "none";
};

const REASONS: ExclusionReason[] = ["own_transfer_pair", "own_transfer_text", "liability_payment", "card_settlement"];

/** Counted outflows of the given months (after the enabled exclusions), split and averaged. */
export function analyseExpenses(
  classified: ClassifiedTransaction[],
  months: string[],
  settings: Pick<CashFlowSettings, "exclusions" | "overrides" | "manualMonthlyExpenses" | "fallbackEssentialPct">,
): ExpenseAnalysis {
  const inWindow = classified.filter((t) => months.includes(t.month));
  const monthsWithData = months.filter((m) => inWindow.some((t) => t.month === m)).length;
  const perMonth: Record<string, number | null> = {};
  for (const m of months) perMonth[m] = inWindow.some((t) => t.month === m) ? 0 : null;

  let essential = 0;
  let discretionary = 0;
  const merchants = new Map<string, MerchantRow & { sum: number }>();
  const excl = new Map<ExclusionReason, { count: number; sum: number }>(REASONS.map((r) => [r, { count: 0, sum: 0 }]));

  for (const t of inWindow) {
    if (!(t.amount < 0)) continue; // inflows are income (streams) or refunds, not expenses
    const spend = -t.base;
    if (t.reason && settings.exclusions[REASON_TOGGLE[t.reason]]) {
      const e = excl.get(t.reason)!;
      e.count += 1;
      e.sum += spend;
      continue;
    }
    // Excluded reasons that are switched OFF are counted like any other expense, but still reported.
    if (t.reason) {
      const e = excl.get(t.reason)!;
      e.count += 1;
    }
    const c = classifyExpense(t.description, settings.overrides);
    if (c.class === "essential") essential += spend;
    else discretionary += spend;
    perMonth[t.month] = (perMonth[t.month] ?? 0) + spend;
    const mk = c.key || "—";
    const row = merchants.get(mk) ?? { key: mk, class: c.class, overridden: c.overridden, group: c.group, monthlyAvg: 0, count: 0, sum: 0 };
    row.sum += spend;
    row.count += 1;
    merchants.set(mk, row);
  }

  const div = Math.max(1, monthsWithData);
  const exclusions: ExclusionSummary[] = REASONS.map((r) => ({
    reason: r,
    toggle: REASON_TOGGLE[r],
    enabled: settings.exclusions[REASON_TOGGLE[r]],
    count: excl.get(r)!.count,
    monthlyAvg: excl.get(r)!.sum / div,
  }));
  const merchantRows = [...merchants.values()]
    .map(({ sum, ...r }) => ({ ...r, monthlyAvg: sum / div }))
    .sort((a, b) => b.monthlyAvg - a.monthlyAvg);

  if (monthsWithData > 0) {
    const e = essential / div;
    const d = discretionary / div;
    return { windowMonths: months, monthsWithData, hasTransactions: true, monthlyTotal: e + d, monthlyEssential: e, monthlyDiscretionary: d, exclusions, merchants: merchantRows, perMonth, source: "transactions" };
  }
  const manual = settings.manualMonthlyExpenses;
  if (manual !== null && manual >= 0) {
    const e = (manual * settings.fallbackEssentialPct) / 100;
    return { windowMonths: months, monthsWithData: 0, hasTransactions: false, monthlyTotal: manual, monthlyEssential: e, monthlyDiscretionary: manual - e, exclusions, merchants: [], perMonth, source: "manual" };
  }
  return { windowMonths: months, monthsWithData: 0, hasTransactions: false, monthlyTotal: null, monthlyEssential: null, monthlyDiscretionary: null, exclusions, merchants: [], perMonth, source: "none" };
}

// ---------------------------------------------------------------------------------------------
// Liabilities
// ---------------------------------------------------------------------------------------------

/** Sum of the planned monthly payments in the Base Currency. */
export function plannedLiabilitiesMonthly(liabilities: WaterfallLiability[], base: string, rates: Record<string, number>): number {
  return liabilities.reduce((s, l) => s + (l.monthlyPayment > 0 ? convertAmount(l.monthlyPayment, l.currency, base, rates) : 0), 0);
}

// ---------------------------------------------------------------------------------------------
// Emergency fund
// ---------------------------------------------------------------------------------------------

export const LIQUID_ACCOUNT_TYPES = ["checking", "savings"] as const;

/** Liquid instant-access: checking or savings (or an account whose type was never set). Term deposits and "other" are not. */
export function isLiquidInstantAccess(a: Pick<WaterfallCashAccount, "accountType">): boolean {
  return a.accountType === undefined || a.accountType === "" || (LIQUID_ACCOUNT_TYPES as readonly string[]).includes(a.accountType);
}

export type EmergencyAccountRow = { id: string; name: string; currency: string; baseBalance: number; counted: boolean; reason: "ok" | "not_liquid" | "not_marked" };

export type EmergencyFund = {
  months: number;
  /** months x (essential + liabilities); null while the essential expenses are unknown. */
  target: number | null;
  current: number;
  gap: number | null;
  /** 0-1, or null without a target. */
  progress: number | null;
  funded: boolean;
  /** Months of (essential + liabilities) the current balance covers; null without a monthly need. */
  coverageMonths: number | null;
  monthlyNeed: number | null;
  accounts: EmergencyAccountRow[];
  /** Percentage applied (10-20) */
  divertPct: number;
  /** Amount flagged for the fund per month (never negative, never above the gap). null when unknown. */
  diversion: number | null;
  /** Net Investable Cash unlocked for investing per month; null when the net is unknown. */
  freeToInvest: number | null;
  /** Months to fund at the current diversion; null when it cannot be computed. */
  monthsToFund: number | null;
};

/** The emergency fund target: M (3-6) months of essential expenses + planned liabilities. */
export function emergencyTarget(months: number, essentialMonthly: number | null, liabilitiesMonthly: number): number | null {
  if (essentialMonthly === null) return null;
  const m = clampInt(months, 3, 6, 6);
  return m * (Math.max(0, essentialMonthly) + Math.max(0, liabilitiesMonthly));
}

/**
 * The savings rule: while current < target, `pct` (10-20 %) of the monthly Net Investable Cash is diverted
 * to the fund (never negative, never above the remaining gap); once funded 100 % of it is free to invest.
 */
export function applyDiversion(net: number | null, gap: number | null, pct: number): { diversion: number | null; free: number | null } {
  if (net === null || gap === null) return { diversion: null, free: null };
  if (net <= 0) return { diversion: 0, free: 0 };
  if (gap <= 0) return { diversion: 0, free: net };
  const p = clampInt(pct, 10, 20, 15) / 100;
  const d = Math.min(Math.max(0, net * p), gap);
  return { diversion: d, free: net - d };
}

export function buildEmergencyFund(input: {
  accounts: WaterfallCashAccount[];
  markedIds: string[];
  months: number;
  essentialMonthly: number | null;
  liabilitiesMonthly: number;
  net: number | null;
  divertPct: number;
  base: string;
  rates: Record<string, number>;
}): EmergencyFund {
  const marked = new Set(input.markedIds);
  const accounts: EmergencyAccountRow[] = input.accounts.map((a) => {
    const isMarked = marked.has(a.id) || a.purpose === "emergency_fund";
    const liquid = isLiquidInstantAccess(a);
    return {
      id: a.id,
      name: a.name,
      currency: a.currency,
      baseBalance: Math.max(0, convertAmount(a.balance, a.currency, input.base, input.rates)),
      counted: isMarked && liquid,
      reason: !isMarked ? "not_marked" : liquid ? "ok" : "not_liquid",
    };
  });
  const current = accounts.filter((a) => a.counted).reduce((s, a) => s + a.baseBalance, 0);
  const months = clampInt(input.months, 3, 6, 6);
  const target = emergencyTarget(months, input.essentialMonthly, input.liabilitiesMonthly);
  const gap = target === null ? null : Math.max(0, target - current);
  const monthlyNeed = input.essentialMonthly === null ? null : input.essentialMonthly + input.liabilitiesMonthly;
  const { diversion, free } = applyDiversion(input.net, gap, input.divertPct);
  const funded = target !== null && target > 0 && gap === 0;
  return {
    months,
    target,
    current,
    gap,
    progress: target === null || target <= 0 ? null : Math.min(1, current / target),
    funded,
    coverageMonths: monthlyNeed === null || monthlyNeed <= 0 ? null : current / monthlyNeed,
    monthlyNeed,
    accounts,
    divertPct: clampInt(input.divertPct, 10, 20, 15),
    diversion,
    freeToInvest: free,
    monthsToFund: gap !== null && gap > 0 && diversion !== null && diversion > 0 ? Math.ceil(gap / diversion) : gap === 0 ? 0 : null,
  };
}

// ---------------------------------------------------------------------------------------------
// The whole waterfall
// ---------------------------------------------------------------------------------------------

export type SeriesPoint = {
  month: string;
  /** Recurring income scheduled for that month (Base Currency). */
  income: number;
  oneOff: number;
  liabilities: number;
  /** Counted expenses; null when the month has no transactions. */
  expenses: number | null;
  /** income - liabilities - expenses; null when the expenses are unknown. */
  net: number | null;
};

export type WaterfallStepId = "income" | "liabilities" | "expenses" | "net" | "diversion" | "free";
export type WaterfallStep = { id: WaterfallStepId; kind: "total" | "minus"; value: number | null };

export type CashFlowWaterfall = {
  base: string;
  income: number;
  /** Next-12-month one-offs, reported apart from the run-rate. */
  oneOffNext12: number;
  hasIncome: boolean;
  liabilities: number;
  expenses: ExpenseAnalysis;
  net: number | null;
  steps: WaterfallStep[];
  series: SeriesPoint[];
  emergency: EmergencyFund;
};

export function buildCashFlowWaterfall(input: {
  streams: IncomeStream[];
  liabilities: WaterfallLiability[];
  transactions: WaterfallTransaction[];
  accounts: WaterfallCashAccount[];
  settings: CashFlowSettings;
  base: string;
  rates: Record<string, number>;
  /** YYYY-MM-DD */
  asOf: string;
}): CashFlowWaterfall {
  const { settings, base, rates, asOf } = input;
  const classified = classifyTransactions(input.transactions, input.liabilities, base, rates);
  const window = lastCompleteMonths(asOf, settings.lookback);
  const expenses = analyseExpenses(classified, window, settings);

  const summary = summarizeIncomeStreams(input.streams, asOf, rates, base);
  const income = summary.monthlyEquivalent;
  const liabilities = plannedLiabilitiesMonthly(input.liabilities, base, rates);
  const net = expenses.monthlyTotal === null ? null : income - liabilities - expenses.monthlyTotal;

  const emergency = buildEmergencyFund({
    accounts: input.accounts,
    markedIds: settings.emergencyAccountIds,
    months: settings.emergencyMonths,
    essentialMonthly: expenses.monthlyEssential,
    liabilitiesMonthly: liabilities,
    net,
    divertPct: settings.divertPct,
    base,
    rates,
  });

  // 12-month velocity series (complete months), expenses of each month after the same exclusions.
  const months12 = lastCompleteMonths(asOf, 12);
  const occ = expandIncomeStreams(input.streams, months12[0], rates, base, 12);
  const recurring: Record<string, number> = {};
  const oneOffs: Record<string, number> = {};
  const oneOffIds = new Set(input.streams.filter((s) => s.frequency === "one_off").map((s) => s.id));
  for (const o of occ) {
    const bucket = oneOffIds.has(o.streamId) ? oneOffs : recurring;
    bucket[o.month] = (bucket[o.month] ?? 0) + o.baseAmount;
  }
  const monthly12 = analyseExpenses(classified, months12, settings).perMonth;
  const series: SeriesPoint[] = months12.map((m) => {
    const exp = monthly12[m] ?? null;
    const inc = recurring[m] ?? 0;
    return { month: m, income: inc, oneOff: oneOffs[m] ?? 0, liabilities, expenses: exp, net: exp === null ? null : inc - liabilities - exp };
  });

  const oneOffNext12 = expandIncomeStreams(input.streams.filter((s) => s.frequency === "one_off"), asOf, rates, base).reduce((s, o) => s + o.baseAmount, 0);

  const steps: WaterfallStep[] = [
    { id: "income", kind: "total", value: input.streams.length > 0 ? income : null },
    { id: "liabilities", kind: "minus", value: liabilities },
    { id: "expenses", kind: "minus", value: expenses.monthlyTotal },
    { id: "net", kind: "total", value: input.streams.length > 0 ? net : null },
    { id: "diversion", kind: "minus", value: input.streams.length > 0 ? emergency.diversion : null },
    { id: "free", kind: "total", value: input.streams.length > 0 ? emergency.freeToInvest : null },
  ];

  return { base, income, oneOffNext12, hasIncome: input.streams.length > 0, liabilities, expenses, net, steps, series, emergency };
}
