/**
 * Foreign-exchange helpers for normalizing multi-currency portfolio values
 * into one Base Currency (the dashboard's `displayCurrency` — user-selected,
 * defaulting to `profiles.default_currency`, falling back to
 * `DEFAULT_BASE_CURRENCY`).
 *
 * Rate-fetching itself lives in `lib/services/fx-client.ts` (the
 * MOCK_MODE-patterned service, in-memory cached); this module wraps that
 * with the one guarantee page rendering needs that the client deliberately
 * doesn't provide — a rate table no matter what, via a static fallback if
 * the real provider is unreachable.
 */

import { getFxRates } from "@/lib/services/fx-client";

/** The app's default Base Currency when no user preference is set. */
export const DEFAULT_BASE_CURRENCY = "USD";

const FALLBACK_RATES_FROM_USD: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.67,
  CHF: 0.88,
  JPY: 149.5,
  CAD: 1.36,
  AUD: 1.52,
  SGD: 1.34,
};

/**
 * Fetches live rates anchored to `base` (`DEFAULT_BASE_CURRENCY` by
 * default) from `lib/services/fx-client.ts`. Falls back to a static
 * approximation — effectively a 1:1 ratio for any currency it doesn't
 * recognize — if that fails, so the dashboard never breaks over a network
 * hiccup or an unsupported code.
 */
export async function getExchangeRatesFromUsd(
  base: string = DEFAULT_BASE_CURRENCY,
): Promise<Record<string, number>> {
  const result = await getFxRates(base);
  if (!result.ok) {
    return FALLBACK_RATES_FROM_USD;
  }
  return result.rates;
}

/**
 * Converts `amount` from `fromCurrency` to `toCurrency` using the given
 * base-anchored rate table. Any currency missing from that table (e.g. the
 * static fallback above doesn't recognize it) is treated as a 1:1 ratio
 * against the base, rather than throwing.
 */
export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  ratesFromBase: Record<string, number>,
): number {
  if (fromCurrency === toCurrency) return amount;

  const fromRate = ratesFromBase[fromCurrency] ?? 1;
  const toRate = ratesFromBase[toCurrency] ?? 1;
  const amountInBase = amount / fromRate;

  return amountInBase * toRate;
}

/**
 * Converts `amount` from `fromCurrency` into the portfolio's Base Currency —
 * the same operation as `convertAmount`, named for the specific "normalize
 * onto one base before aggregating" use case (dashboard totals, the
 * Portfolio Performance chart), so call sites read as what they're doing
 * rather than a generic any-to-any conversion.
 */
export function convertToBaseCurrency(
  amount: number,
  fromCurrency: string,
  baseCurrency: string,
  rates: Record<string, number>,
): number {
  return convertAmount(amount, fromCurrency, baseCurrency, rates);
}
