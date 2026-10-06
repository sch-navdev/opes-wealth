/**
 * Reads an official vehicle valuation (Blue Book / Argus / Parkers / Eurotax /
 * Schwacke…) from the TEXT of a PDF (`pdf-parse`). Heuristic by nature: guides
 * lay their documents out differently, so this returns its best guess plus the
 * other amounts it saw, and the UI always lets the user confirm or correct
 * before anything is saved. A scanned PDF has no text layer and yields nothing.
 */

export type BlueBookCandidate = { value: number; currency: string | null; line: string };

export type ParsedBlueBook = {
  value: number | null;
  currency: string | null;
  /** ISO YYYY-MM-DD */
  date: string | null;
  source: string;
  candidates: BlueBookCandidate[];
};

const GUIDES: [RegExp, string][] = [
  [/kelley\s+blue\s+book|\bkbb\b/i, "Kelley Blue Book"],
  [/black\s+book/i, "Black Book"],
  [/parkers/i, "Parkers"],
  [/glass'?s\s+guide/i, "Glass's Guide"],
  [/cote\s+argus|l'argus|\bargus\b/i, "Argus"],
  [/autobiz/i, "Autobiz"],
  [/la\s+centrale/i, "La Centrale"],
  [/eurotax/i, "Eurotax"],
  [/schwacke/i, "Schwacke"],
  [/quattroruote/i, "Quattroruote"],
  [/redbook/i, "Redbook"],
  [/autotrader/i, "Autotrader"],
];

const CURRENCY_CODES: Record<string, string> = { AED: "AED", USD: "USD", EUR: "EUR", GBP: "GBP", DHS: "AED", DH: "AED", "€": "EUR", $: "USD", "£": "GBP" };

const VALUE_WORDS = /(valuation|valuations|value|valeur|cote|argus|estimate|estimation|estim|price|prix|prezzo|preis|wert|bewertung|valor|valore|trade[-\s]?in|retail|market|قيمة|تقدير|سعر|оценк|стоимост|цена)/i;
const STRONG_WORDS = /(valuation|valeur|cote|argus|estimated\s+value|fair\s+market|retail|trade[-\s]?in|bewertung|valore|تقييم|оценк)/i;
/**
 * Lines that carry an IDENTIFIER or a non-price measurement (VIN, chassis/engine
 * no/size, mileage, phone/fax, plate, invoice no, "ref"/"reference" followed by a
 * number or an identifier). Matched as whole-word LABELS, never as substrings —
 * "Preferred", "Provincial", "Hotel" or "Reference value" must not trip it.
 */
const SIMPLE_SKIP_LABELS = new RegExp(
  [
    String.raw`\bvin\b`,
    String.raw`\bchassis\b`,
    String.raw`\bengine\b`,
    String.raw`\bmileage\b`,
    String.raw`\bodometer\b`,
    String.raw`\bkilom\w*`,
    String.raw`\bkms?\b`,
    String.raw`\bmiles\b`,
    String.raw`(?:\bcc\b|\d\s?cc\b)`,
    String.raw`\bphone\b`,
    String.raw`\btel(?:ephone)?\b`,
    String.raw`\bfax\b`,
    String.raw`\bplate\b`,
    String.raw`\binvoice\s*(?:no|nr|number|num|#)`,
  ].join("|"),
  "i",
);
const ID_CHARS = String.raw`[A-Za-z0-9/_\-.]`;
const ID_TOKEN = String.raw`[A-Za-z0-9]${ID_CHARS}*`;
/** "Ref no 123", "Reference number: AB-9", "Ref: 2025/123456", "Ref. #99" — explicit marker. */
const REF_EXPLICIT = new RegExp(String.raw`\bref(?:erence)?\b\.?\s*(?:(?:no|nr|number|num)\b\.?\s*[:#.]?|[:#])\s*${ID_TOKEN}`, "i");
/** "(ref 12345)" — no marker, but the following token has a digit so it is an identifier, not a word ("Reference value"). */
const REF_BARE = new RegExp(String.raw`\bref(?:erence)?\b\.?\s+${ID_CHARS}*\d${ID_CHARS}*`, "i");

function hasSkipLabel(line: string): boolean {
  return SIMPLE_SKIP_LABELS.test(line) || REF_EXPLICIT.test(line) || REF_BARE.test(line);
}

/** Removes only the identifiers/measurements that follow a skip label, leaving the rest of the line (e.g. a valuation) intact. */
function blankIdentifiers(line: string): string {
  const afterLabel = String.raw`[\s:#.\-]*(?:(?:no|nr|number|num)\b\.?[\s:#.\-]*)?[A-Za-z0-9/_\-.,]*\d[A-Za-z0-9/_\-.,]*(?:\s?(?:km|kms|miles)\b)?`;
  const labels = String.raw`\b(?:ref(?:erence)?|vin|chassis|engine|mileage|odometer|plate|invoice|phone|tel(?:ephone)?|fax)\b\.?`;
  return line
    .replace(new RegExp(labels + afterLabel, "gi"), " ")
    .replace(/\d[\d.,]*\s?(?:km|kms|kilom\w*|miles)\b/gi, " ");
}

const MONTHS: Record<string, string> = {
  jan: "01", janv: "01", feb: "02", fev: "02", févr: "02", mar: "03", mars: "03", apr: "04", avr: "04", may: "05", mai: "05",
  jun: "06", juin: "06", jul: "07", juil: "07", aug: "08", aout: "08", août: "08", sep: "09", sept: "09", oct: "10",
  nov: "11", dec: "12", déc: "12",
};

/** Parses "1 234 567,89", "1,234,567.89", "1.234.567", "125000" into a number. */
function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[\s  ]/g, "");
  const decimal = /[.,]\d{1,2}$/.test(cleaned);
  const digits = decimal ? cleaned.slice(0, -3).replace(/[.,]/g, "") + "." + cleaned.slice(-2).replace(/[.,]/, "") : cleaned.replace(/[.,]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

const AMOUNT = /(AED|USD|EUR|GBP|DHS|DH|€|\$|£)?\s?(\d{1,3}(?:[ ,.  ]\d{3})+(?:[.,]\d{1,2})?|\d{4,9}(?:[.,]\d{1,2})?)\s?(AED|USD|EUR|GBP|DHS|DH|€|\$|£)?/gi;

function amountsOnLine(line: string): BlueBookCandidate[] {
  const out: BlueBookCandidate[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const value = parseNumber(m[2]);
    if (value == null || value < 500 || value > 20_000_000) continue;
    // A bare 4-digit number between 1950 and 2100 is a model year, not a price.
    if (!m[1] && !m[3] && /^\d{4}$/.test(m[2]) && value >= 1950 && value <= 2100) continue;
    const code = (m[1] ?? m[3] ?? "").toUpperCase();
    out.push({ value, currency: CURRENCY_CODES[code] ?? CURRENCY_CODES[m[1] ?? m[3] ?? ""] ?? null, line: line.trim().slice(0, 140) });
  }
  return out;
}

function toIso(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function datesOnLine(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const iso = toIso(+m[1], +m[2], +m[3]);
    if (iso) out.push(iso);
  }
  for (const m of line.matchAll(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/g)) {
    // Day first (UAE/EU/UK); a month above 12 means the document is month first.
    const [a, b] = [+m[1], +m[2]];
    const iso = b > 12 ? toIso(+m[3], a, b) : toIso(+m[3], b, a);
    if (iso) out.push(iso);
  }
  for (const m of line.matchAll(/\b(\d{1,2})\s+([A-Za-zéûÉ]{3,9})\.?,?\s+(\d{4})\b/g)) {
    const mo = MONTHS[m[2].toLowerCase().slice(0, m[2].length >= 4 && m[2].toLowerCase().startsWith("sept") ? 4 : 3)] ?? MONTHS[m[2].toLowerCase()];
    const iso = mo ? toIso(+m[3], +mo, +m[1]) : null;
    if (iso) out.push(iso);
  }
  for (const m of line.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) {
    const mo = MONTHS[m[1].toLowerCase().slice(0, 3)];
    const iso = mo ? toIso(+m[3], +mo, +m[2]) : null;
    if (iso) out.push(iso);
  }
  return out;
}

export function parseBlueBookText(text: string, todayIso: string = new Date().toISOString().slice(0, 10)): ParsedBlueBook {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const source = GUIDES.find(([re]) => re.test(text))?.[1] ?? "";

  // Amounts: a value line is one that mentions a value word (also looks one line ahead for a label-then-number layout).
  const scored: (BlueBookCandidate & { score: number })[] = [];
  lines.forEach((line, i) => {
    let scan = line;
    if (hasSkipLabel(line)) {
      // A skip label alone drops the line; alongside a valuation word keep the line and blank just the identifier.
      if (!VALUE_WORDS.test(line)) return;
      scan = blankIdentifiers(line);
    }
    const own = amountsOnLine(scan);
    const next = !own.length && VALUE_WORDS.test(line) && lines[i + 1] && !hasSkipLabel(lines[i + 1]) ? amountsOnLine(lines[i + 1]) : [];
    for (const c of [...own, ...next]) {
      let score = 0;
      if (STRONG_WORDS.test(line)) score += 3;
      else if (VALUE_WORDS.test(line)) score += 2;
      if (c.currency) score += 1;
      scored.push({ ...c, score });
    }
  });
  scored.sort((a, b) => b.score - a.score || b.value - a.value);
  const seen = new Set<number>();
  const candidates = scored.filter((c) => (seen.has(c.value) ? false : (seen.add(c.value), true))).slice(0, 5).map(({ value, currency, line }) => ({ value, currency, line }));
  const best = scored[0] && scored[0].score >= 2 ? scored[0] : null;

  // Date: prefer a line that talks about the valuation/issue date; never in the future.
  let date: string | null = null;
  const dated = lines.filter((l) => /date|issued|émis|evalu|évalu|valuation|établi|datum|data|تاريخ|дата/i.test(l));
  for (const l of [...dated, ...lines]) {
    const found = datesOnLine(l).find((d) => d <= todayIso);
    if (found) {
      date = found;
      break;
    }
  }

  return { value: best?.value ?? null, currency: best?.currency ?? null, date, source, candidates };
}
