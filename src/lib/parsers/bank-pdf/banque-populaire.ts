/**
 * Banque Populaire (France) account statement ("Extrait de compte" / "Relevé de compte").
 *
 * pdf-parse glues the table columns into one run, e.g.
 *   `12/12VIREMENT SEPA12/1212/12 200,51 €`
 *   `17/12COTIS DUO PREMIUM002248516/1216/12- 24,35 €`
 * = booking date (no year) + label [+ 7-char glued reference] + operation date + value date +
 * signed amount. The row is parsed right-anchored: the last two `DD/MM` groups before the
 * amount are the operation and value dates, the first `DD/MM` is the booking date.
 *
 * Two layouts exist:
 *  - recent: amounts carry a trailing `€`, debits a leading `-`, credits are unsigned.
 *  - older: no `€`, no sign at all (separate debit/credit columns that pdf-parse flattens),
 *    the label may sit on the following line and the totals / closing amount can be printed
 *    on the line BEFORE their label. For these the sign of each row is recovered from the
 *    printed balances: the opening balance, the intermediate `SOLDE ... AU` checkpoints and
 *    the closing balance fix, per segment, the signed sum, which is a subset-sum solved
 *    exactly (label keywords only break ties; ambiguity is reported as a warning).
 *
 * The statement has no per-row running balance. Reconciliation is opening + movements =
 * closing; the intermediate checkpoint lines (NOT transactions) become the running balance of
 * the preceding row so `reconcile` verifies them, and the printed `TOTAL DES MOUVEMENTS`
 * totals are cross-checked. Everything after the totals (fees recap, SEPA detail blocks)
 * duplicates rows and is ignored.
 */
import type { BankPdfProfile, PdfParseOutcome, TransactionFingerprint } from "./types";
import { buildAccount, isoDate, moneyFields, roundMoney, sameMoney, squash } from "./shared";

const AMT = String.raw`(?:\d{1,3}(?:[   .]\d{3})+|\d+),\d{2}`;

const ROW_RE = new RegExp(
  String.raw`^(\d{2})/(\d{2})(.*?)(\d{2})/(\d{2})(\d{2})/(\d{2})\s*(-\s*)?(${AMT})\s*(€)?\s*$`,
);
const SOLDE_RE = new RegExp(
  String.raw`^SOLDE\s+(CREDITEUR|DEBITEUR)\s+AU\s+(\d{2})/(\d{2})/(\d{4})\s*\*?\s*(?:(-\s*)?(${AMT})\s*€?)?\s*$`,
  "i",
);
const TOTAL_DEBIT_RE = new RegExp(String.raw`^TOTAL DES MOUVEMENTS DEBITEURS\s*(?:-\s*)?(${AMT})\s*€`, "i");
const TOTAL_CREDIT_RE = new RegExp(String.raw`^TOTAL DES MOUVEMENTS CREDITEURS\s*(?:-\s*)?(${AMT})\s*€`, "i");
const TOTALS_LABEL_RE = /TOTAL DES MOUVEMENTS/i;
const AMT_G = new RegExp(AMT, "g");
const PURE_AMT_RE = new RegExp(String.raw`^(?:${AMT})(?:\s*${AMT})?\s*€?$`);
const SINGLE_AMT_RE = new RegExp(String.raw`^(?:(-)\s*)?(${AMT})\s*€?$`);
const CB_DEFERRED_RE = /^\d{2}\/\d{2}\*VOTRE RELEVE CB\*/i;

/** Page furniture that can appear between table rows on multi-page statements. */
const NOISE_RES: RegExp[] = [
  /^Société anonyme coopérative/i,
  /^aux Etablissements de Crédit/i,
  /^inscrite auprès de l'ORIAS/i,
  /^luxembourgeoise\s*-/i,
  /^\d+\s+Page\s+\d+\/\s*\d*$/i,
  /^Page\s+\d+\/\s*\d*$/i,
  /^VOTRE COMPTE\b/i,
  /^Votre relevé/i,
  /^DATE\s*$/i,
  /^COMPTA\s*$/i,
  /^OPERATION\s*$/i,
  /^VALEUR\s*$/i,
  /^LIBELLE\b/i,
  /^\d{8}\*\d+\*/,
  /^\d{4}\s\d{4}$/,
  /^JE CONSERVE$/i,
  /^CE DOCUMENT$/i,
];

const NEGATIVE_HINT =
  /PRLV|PRELEV|COTIS|FRAIS|\bCB\b|CARTE|RETRAIT|ECHEANCE|AGIOS|COMMISSION|CHEQUE|\bCHQ\b|ABONNEMENT|\bEMIS\b|IMPOT|DGFIP|PAIEMENT/i;
const POSITIVE_HINT = /\bRECU\b|REMISE|DIVIDENDE|REMBOURS|INTERETS? CRED|VIR(?:EMENT)? (?:SEPA )?(?!EMIS)/i;

function parseAmt(s: string): number {
  return roundMoney(Number(s.replace(/[   .]/g, "").replace(",", ".")));
}

/** Date with the year chosen closest to `anchorIso` (used for operation / value dates). */
function nearestIso(day: number, month: number, anchorIso: string): string | null {
  const anchor = Date.parse(anchorIso);
  const anchorYear = Number(anchorIso.slice(0, 4));
  let best: string | null = null;
  let bestDiff = Infinity;
  for (const y of [anchorYear - 1, anchorYear, anchorYear + 1]) {
    const iso = isoDate(y, month, day);
    if (!iso) continue;
    const diff = Math.abs(Date.parse(iso) - anchor);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = iso;
    }
  }
  return best;
}

/** Booking date: the latest occurrence of DD/MM that is not after the statement date. */
function bookingIso(day: number, month: number, statementIso: string): string | null {
  const sy = Number(statementIso.slice(0, 4));
  for (const y of [sy, sy - 1, sy - 2]) {
    const iso = isoDate(y, month, day);
    if (iso && iso <= statementIso) return iso;
  }
  return nearestIso(day, month, statementIso);
}

/** Splits `label + glued 7-char reference` (the reference starts with a digit). */
function splitReference(labelRef: string): { label: string; reference: string | null } {
  const t = labelRef.trimEnd();
  if (/^\d[0-9A-Za-z]{6}$/.test(t)) return { label: "", reference: t };
  const m = /^(.*\S)(\d[0-9A-Z]{6})$/.exec(t);
  if (m) return { label: squash(m[1]), reference: m[2] };
  return { label: squash(t), reference: null };
}

export function isBanquePopulaireStatement(text: string): boolean {
  return /banque populaire/i.test(text) && /(relev[ée] de compte|SOLDE (?:CREDITEUR|DEBITEUR))/i.test(text);
}

type Solde = { iso: string | null; amount: number };

type RawRow = {
  tx: TransactionFingerprint;
  continuations: string[];
  abs: number;
  /** +1 credit, -1 debit, null when the layout prints no sign. */
  sign: 1 | -1 | null;
};

function hintOf(r: RawRow): number {
  const text = `${r.tx.rawDescription} ${r.continuations.join(" ")}`;
  if (NEGATIVE_HINT.test(text)) return -1;
  if (POSITIVE_HINT.test(text)) return 1;
  return 0;
}

/**
 * Chooses which rows are credits so that signed sum = `delta` (cents). Exact subset-sum;
 * among all solutions the one agreeing most with the label hints wins.
 * Returns null when no assignment exists.
 */
function solveSegment(
  absCents: number[],
  hints: number[],
  delta: number,
): { signs: Array<1 | -1>; ambiguous: boolean } | null {
  const n = absCents.length;
  const total = absCents.reduce((s, v) => s + v, 0);
  if ((delta + total) % 2 !== 0) return null;
  const target = (delta + total) / 2; // sum of the credits
  if (target < 0 || target > total) return null;

  const order = absCents.map((_, i) => i).sort((a, b) => absCents[b] - absCents[a] || a - b);
  const suffix = new Array<number>(n + 1).fill(0);
  for (let k = n - 1; k >= 0; k--) suffix[k] = suffix[k + 1] + absCents[order[k]];

  const dead = new Set<string>();
  const chosen = new Array<boolean>(n).fill(false);
  let bestScore = -Infinity;
  let bestSigns: Array<1 | -1> | null = null;
  let bestCount = 0;
  let nodes = 0;
  const NODE_CAP = 400_000;

  const dfs = (k: number, need: number, score: number): boolean => {
    if (nodes++ > NODE_CAP) return false;
    if (need < 0 || need > suffix[k]) return false;
    const key = `${k}:${need}`;
    if (dead.has(key)) return false;
    if (k === n) {
      if (need !== 0) return false;
      if (score > bestScore) {
        bestScore = score;
        bestCount = 1;
        bestSigns = new Array<1 | -1>(n).fill(-1);
        for (let j = 0; j < n; j++) bestSigns[order[j]] = chosen[j] ? 1 : -1;
      } else if (score === bestScore) {
        bestCount += 1;
      }
      return true;
    }
    const idx = order[k];
    let found = false;
    chosen[k] = true;
    if (dfs(k + 1, need - absCents[idx], score + hints[idx])) found = true;
    chosen[k] = false;
    if (dfs(k + 1, need, score - hints[idx])) found = true;
    if (!found && nodes <= NODE_CAP) dead.add(key);
    return found;
  };

  dfs(0, target, 0);
  if (!bestSigns) return null;
  return { signs: bestSigns, ambiguous: bestCount > 1 };
}

function parse(text: string): PdfParseOutcome {
  if (!isBanquePopulaireStatement(text)) {
    return {
      ok: false,
      failure: {
        code: "unsupported",
        bank: "banque_populaire",
        message: "This Banque Populaire document is not an account statement (card statement / transfer notice)",
      },
    };
  }

  const lines = text.split(/\r?\n/);
  const sq = lines.map((l) => squash(l));

  // --- header --------------------------------------------------------------------------
  const ibanM = /IBAN\s*:\s*([A-Z]{2}\d{2}[0-9A-Z ]{10,40})/.exec(text);
  const iban = ibanM ? ibanM[1].replace(/\s+/g, "").slice(0, 34) : "";
  const acctM = /COMPTE[^\n]*?N°\s*(\d{6,})/i.exec(text);
  const accountRef = iban || (acctM ? acctM[1] : "");

  const stmtM = /relev[ée]\s+(?:de compte\s+)?n°\s*\d+\s+au\s+(\d{2})\/(\d{2})\/(\d{4})/i.exec(text);
  const stmtIso = stmtM ? isoDate(Number(stmtM[3]), Number(stmtM[2]), Number(stmtM[1])) : null;

  // --- pass 1: balance lines & printed totals ------------------------------------------
  /** Amount of a SOLDE line: on the line itself, else alone on the previous printed line. */
  const soldeAt = (i: number): Solde | null => {
    const m = SOLDE_RE.exec(sq[i]);
    if (!m) return null;
    let absStr = m[6];
    let neg = Boolean(m[5]);
    if (!absStr) {
      for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
        if (!sq[j]) continue;
        const p = SINGLE_AMT_RE.exec(sq[j]);
        if (p) {
          absStr = p[2];
          neg = Boolean(p[1]);
        }
        break;
      }
    }
    if (!absStr) return null;
    const abs = parseAmt(absStr);
    const negative = m[1].toUpperCase() === "DEBITEUR" || neg;
    return { iso: isoDate(Number(m[4]), Number(m[3]), Number(m[2])), amount: negative ? -abs : abs };
  };

  const soldes = new Map<number, Solde>();
  let opening: Solde | null = null;
  let closing: Solde | null = null;
  let printedDebits: number | null = null;
  let printedCredits: number | null = null;
  let totalsSeen = false;
  for (let i = 0; i < sq.length; i++) {
    const line = sq[i];
    if (!line) continue;
    if (TOTALS_LABEL_RE.test(line)) {
      if (!totalsSeen) {
        // Old layout prints the two totals (debit then credit, glued) before the label.
        const prefix = line.slice(0, line.search(TOTALS_LABEL_RE));
        let source = prefix;
        if (!source) {
          for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
            if (!sq[j]) continue;
            if (PURE_AMT_RE.test(sq[j])) source = sq[j];
            break;
          }
        }
        const amounts = source.match(AMT_G);
        if (amounts && amounts.length === 2) {
          printedDebits = parseAmt(amounts[0]);
          printedCredits = parseAmt(amounts[1]);
        }
      }
      totalsSeen = true;
      const d = TOTAL_DEBIT_RE.exec(line);
      if (d) printedDebits = parseAmt(d[1]);
      const c = TOTAL_CREDIT_RE.exec(line);
      if (c) printedCredits = parseAmt(c[1]);
      continue;
    }
    const s = soldeAt(i);
    if (s) {
      soldes.set(i, s);
      if (!opening) opening = s;
      else if (totalsSeen && !closing) closing = s;
    }
  }

  const anchorCandidates = [stmtIso, closing?.iso ?? null].filter((x): x is string => Boolean(x));
  const anchor = anchorCandidates.length > 0 ? anchorCandidates.sort().at(-1)! : (opening?.iso ?? null);
  if (!anchor) {
    return {
      ok: false,
      failure: {
        code: "unsupported",
        bank: "banque_populaire",
        message: "Banque Populaire statement date could not be determined",
      },
    };
  }

  // --- pass 2: rows --------------------------------------------------------------------
  const warnings: string[] = [];
  const rows: RawRow[] = [];
  const checkpoints: Array<{ rowIndex: number; solde: Solde }> = [];
  let current: RawRow | null = null;
  let seenOpening = false;
  let skippedRows = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = sq[i];
    if (!line) continue;
    if (TOTALS_LABEL_RE.test(line)) break;

    if (SOLDE_RE.test(line)) {
      const s = soldes.get(i);
      if (!seenOpening) {
        seenOpening = true;
      } else if (rows.length > 0 && s) {
        checkpoints.push({ rowIndex: rows.length - 1, solde: s });
      }
      current = null;
      continue;
    }
    if (CB_DEFERRED_RE.test(line)) {
      current = null; // card-statement deferred total: not a booking
      continue;
    }
    if (PURE_AMT_RE.test(line)) continue; // stray totals / balance amount printed on its own line

    const m = ROW_RE.exec(lines[i].trim());
    if (m) {
      const booking = bookingIso(Number(m[1]), Number(m[2]), anchor);
      if (!booking) {
        skippedRows += 1;
        current = null;
        continue;
      }
      const value = nearestIso(Number(m[6]), Number(m[7]), booking);
      const abs = parseAmt(m[9]);
      const explicit = Boolean(m[10]);
      const sign: 1 | -1 | null = m[8] ? -1 : explicit ? 1 : null;
      const { label, reference } = splitReference(m[3]);
      current = {
        tx: {
          bank: "banque_populaire",
          accountRef,
          currency: "EUR",
          date: booking,
          valueDate: value,
          description: label,
          rawDescription: label,
          ...moneyFields(sign === 1 ? abs : -abs),
          balance: null,
          reference,
          index: rows.length,
        },
        continuations: [],
        abs,
        sign,
      };
      rows.push(current);
      continue;
    }

    if (current && !NOISE_RES.some((re) => re.test(line))) {
      current.continuations.push(line);
    }
  }

  if (skippedRows > 0) warnings.push(`${skippedRows} row(s) with an invalid date were skipped.`);

  for (const r of rows) {
    const extra = r.continuations;
    r.tx.rawDescription = squash([r.tx.rawDescription, ...extra].join(" "));
    const pieces = r.tx.description ? [r.tx.description] : [];
    for (const c of extra.slice(0, 2)) {
      if (c.length > 1 && !/\d/.test(c)) pieces.push(c);
      else break;
    }
    r.tx.description = squash(pieces.join(" "));
  }

  if (rows.length === 0) {
    return {
      ok: false,
      failure: { code: "no_transactions", bank: "banque_populaire", message: "No transaction rows found" },
    };
  }

  // If the document has no explicit closing line, fall back to the last checkpoint.
  if (!closing && checkpoints.length > 0 && !totalsSeen) {
    closing = checkpoints[checkpoints.length - 1].solde;
  }

  // --- sign recovery for the unsigned (older) layout ------------------------------------
  const unknown = rows.filter((r) => r.sign === null);
  if (unknown.length > 0) {
    const points: Array<{ idx: number; balance: number }> = [];
    if (opening) points.push({ idx: -1, balance: opening.amount });
    for (const cp of checkpoints) points.push({ idx: cp.rowIndex, balance: cp.solde.amount });
    if (closing) points.push({ idx: rows.length - 1, balance: closing.amount });

    let unsolved = 0;
    let ambiguousSegments = 0;
    for (let p = 0; p + 1 < points.length; p++) {
      const from = points[p].idx + 1;
      const to = points[p + 1].idx;
      if (to < from) continue;
      const seg = rows.slice(from, to + 1);
      const known = seg.filter((r) => r.sign !== null);
      const free = seg.filter((r) => r.sign === null);
      if (free.length === 0) continue;
      const knownSum = known.reduce((s, r) => s + (r.sign as number) * Math.round(r.abs * 100), 0);
      const delta = Math.round((points[p + 1].balance - points[p].balance) * 100) - knownSum;
      const sol = solveSegment(
        free.map((r) => Math.round(r.abs * 100)),
        free.map(hintOf),
        delta,
      );
      if (!sol) {
        unsolved += free.length;
        continue;
      }
      free.forEach((r, k) => {
        r.sign = sol.signs[k];
      });
      if (sol.ambiguous) ambiguousSegments += 1;
    }
    for (const r of rows) {
      if (r.sign === null) r.sign = hintOf(r) > 0 ? 1 : -1;
    }
    if (unsolved > 0) {
      warnings.push(`Could not infer the sign of ${unsolved} row(s) from the printed balances.`);
    }
    if (ambiguousSegments > 0) {
      warnings.push(
        `Transaction signs were inferred from the printed balances; ${ambiguousSegments} segment(s) are ambiguous.`,
      );
    }
    for (const r of rows) Object.assign(r.tx, moneyFields((r.sign as number) * r.abs));
  }

  const transactions = rows.map((r) => r.tx);

  // Intermediate balance checkpoints become the running balance of the preceding row.
  for (const cp of checkpoints) transactions[cp.rowIndex].balance = cp.solde.amount;

  // --- totals check --------------------------------------------------------------------
  const sumDebits = roundMoney(transactions.reduce((s, t) => s + (t.debit ?? 0), 0));
  const sumCredits = roundMoney(transactions.reduce((s, t) => s + (t.credit ?? 0), 0));
  if (printedDebits !== null && !sameMoney(printedDebits, sumDebits)) {
    warnings.push("Parsed debit movements do not match the printed TOTAL DES MOUVEMENTS (debits).");
  }
  if (printedCredits !== null && !sameMoney(printedCredits, sumCredits)) {
    warnings.push("Parsed credit movements do not match the printed TOTAL DES MOUVEMENTS (credits).");
  }

  const account = buildAccount({
    accountRef,
    currency: "EUR",
    periodStart: opening?.iso ?? null,
    periodEnd: closing?.iso ?? stmtIso,
    openingBalance: opening ? opening.amount : null,
    closingBalance: closing ? closing.amount : null,
    transactions,
  });
  if (account.reconciliation.status === "mismatch") {
    warnings.push("Reconciliation mismatch: opening balance plus movements does not equal the printed closing balance.");
  }

  return {
    ok: true,
    statement: {
      bank: "banque_populaire",
      bankName: "Banque Populaire (France)",
      accounts: [account],
      warnings,
    },
  };
}

export const banquePopulaireProfile: BankPdfProfile = {
  id: "banque_populaire",
  name: "Banque Populaire (France)",
  detect: isBanquePopulaireStatement,
  parse,
};
