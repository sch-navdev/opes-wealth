/**
 * Splits a money amount into the pieces the `Money` figure styles separately (currency code, whole part,
 * decimals). Pure, no React. The pieces come from `Intl.NumberFormat#formatToParts`, so grouping and the
 * decimal mark follow the locale; the order on screen is the component's (code, then number), because the
 * currency code is set as a small label and not as part of the number.
 */
export type MoneyParts = {
  negative: boolean;
  /** ISO code as given, upper-cased (e.g. "AED"). */
  currency: string;
  /** Whole part with its grouping separators ("1,234,567"). */
  integer: string;
  /** Decimal mark plus fraction digits (".52"), or "" when the currency has none or `fractionDigits` is 0. */
  decimal: string;
  /** Plain text of the whole amount, for screen readers and tests ("AED -1,234.50"). */
  text: string;
};

export type MoneyFormatOptions = {
  fractionDigits?: number;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** "exceptZero" / "always" add an explicit "+" for positive amounts (text only). */
  signDisplay?: "auto" | "always" | "exceptZero" | "negative" | "never";
};

export function moneyParts(value: number, currency: string, locale: string, opts: MoneyFormatOptions = {}): MoneyParts {
  const code = currency.toUpperCase();
  if (!Number.isFinite(value)) {
    return { negative: false, currency: code, integer: "–", decimal: "", text: `${code} –` };
  }
  const digits: Intl.NumberFormatOptions =
    opts.fractionDigits !== undefined
      ? { minimumFractionDigits: opts.fractionDigits, maximumFractionDigits: opts.fractionDigits }
      : {
          ...(opts.minimumFractionDigits !== undefined ? { minimumFractionDigits: opts.minimumFractionDigits } : {}),
          ...(opts.maximumFractionDigits !== undefined ? { maximumFractionDigits: opts.maximumFractionDigits } : {}),
        };
  const signOpt: Intl.NumberFormatOptions = opts.signDisplay ? { signDisplay: opts.signDisplay } : {};
  let formatter: Intl.NumberFormat;
  try {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "code",
      ...digits,
      ...signOpt,
    });
  } catch {
    try {
      formatter = new Intl.NumberFormat(locale, {
        minimumFractionDigits: opts.fractionDigits ?? opts.minimumFractionDigits ?? 2,
        maximumFractionDigits: opts.fractionDigits ?? opts.maximumFractionDigits ?? 2,
        ...signOpt,
      });
    } catch {
      formatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }

  let negative = false;
  let plus = false;
  let integer = "";
  let decimal = "";
  let fraction = "";
  for (const part of formatter.formatToParts(value)) {
    if (part.type === "minusSign") negative = true;
    else if (part.type === "plusSign") plus = true;
    else if (part.type === "integer" || part.type === "group") integer += part.value;
    else if (part.type === "decimal") decimal = part.value;
    else if (part.type === "fraction") fraction += part.value;
  }
  const dec = fraction ? decimal + fraction : "";
  const sign = negative ? "-" : plus ? "+" : "";
  return { negative, currency: code, integer, decimal: dec, text: `${code} ${sign}${integer}${dec}` };
}

/**
 * The one inline currency style (code, then the figure: "USD 1 077 934,09" in French, "EUR 1,234.50" in
 * English), the same pieces the `Money` figure shows. Use this wherever a currency amount is part of a
 * string (tooltips, table cells, labels). Privacy masking stays with the caller (`maskValue(...)`).
 */
export function formatMoneyText(value: number, currency: string, locale: string, opts: MoneyFormatOptions = {}): string {
  return moneyParts(value, currency, locale, opts).text;
}

export type MoneyFormatter = { format: (value: number) => string };

/** Drop-in replacement for `new Intl.NumberFormat(locale, { style: "currency", currency, ...opts })`. */
export function moneyFormatter(
  locale: string,
  currency: string,
  opts: MoneyFormatOptions = {},
): MoneyFormatter {
  return { format: (value) => formatMoneyText(value, currency, locale, opts) };
}

const percentCache = new Map<string, Intl.NumberFormat>();

/**
 * Locale-aware percentage for a value already expressed in percent points (`4.9` -> "4.9%" in English,
 * "4,9 %" in French). `signDisplay: "exceptZero"` keeps an explicit "+" where the old inline
 * `${x >= 0 ? "+" : ""}${x.toFixed(n)}%` did. Non-finite input renders as an en dash.
 */
export function formatPercentPoints(
  points: number,
  locale: string,
  opts: { digits?: number; minDigits?: number; signDisplay?: "auto" | "always" | "exceptZero" | "never" } = {},
): string {
  if (!Number.isFinite(points)) return "–";
  const max = opts.digits ?? 2;
  const min = opts.minDigits ?? max;
  const options: Intl.NumberFormatOptions = {
    style: "percent",
    minimumFractionDigits: min,
    maximumFractionDigits: max,
    ...(opts.signDisplay ? { signDisplay: opts.signDisplay } : {}),
  };
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = percentCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, options);
    } catch {
      f = new Intl.NumberFormat("en-US", options);
    }
    percentCache.set(key, f);
  }
  return f.format(points / 100);
}

/**
 * Positions (counted from the right end) at which `next` differs from `prev`. Counting from the right keeps
 * the unchanged trailing digits still when a figure grows a digit ("999" -> "1,000" rolls every place).
 */
export function changedPositionsFromRight(prev: string, next: string): Set<number> {
  const out = new Set<number>();
  const length = Math.max(prev.length, next.length);
  for (let i = 0; i < length; i++) {
    if (prev[prev.length - 1 - i] !== next[next.length - 1 - i]) out.add(i);
  }
  return out;
}

/** Locale-aware plain number with fixed fraction digits ("4.9" / "4,9"): for percentages whose "%" sits in a translated string. */
export function formatDecimal(value: number, locale: string, digits = 1): string {
  if (!Number.isFinite(value)) return "–";
  try {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch {
    return value.toFixed(digits);
  }
}
