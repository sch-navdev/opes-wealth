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

export function moneyParts(
  value: number,
  currency: string,
  locale: string,
  opts: { fractionDigits?: number } = {},
): MoneyParts {
  const code = currency.toUpperCase();
  if (!Number.isFinite(value)) {
    return { negative: false, currency: code, integer: "–", decimal: "", text: `${code} –` };
  }
  let formatter: Intl.NumberFormat;
  try {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "code",
      ...(opts.fractionDigits !== undefined
        ? { minimumFractionDigits: opts.fractionDigits, maximumFractionDigits: opts.fractionDigits }
        : {}),
    });
  } catch {
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: opts.fractionDigits ?? 2,
      maximumFractionDigits: opts.fractionDigits ?? 2,
    });
  }

  let negative = false;
  let integer = "";
  let decimal = "";
  let fraction = "";
  for (const part of formatter.formatToParts(value)) {
    if (part.type === "minusSign") negative = true;
    else if (part.type === "integer" || part.type === "group") integer += part.value;
    else if (part.type === "decimal") decimal = part.value;
    else if (part.type === "fraction") fraction += part.value;
  }
  const dec = fraction ? decimal + fraction : "";
  return { negative, currency: code, integer, decimal: dec, text: `${code} ${negative ? "-" : ""}${integer}${dec}` };
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
