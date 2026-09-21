/**
 * Foreign-exchange helpers for displaying multi-currency portfolio values
 * in one selected currency.
 *
 * All rates are anchored to USD (i.e. "how many units of X per 1 USD"),
 * so converting between any two currencies only ever needs one fetch.
 */

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
 * Fetches live rates from https://api.frankfurter.app (ECB reference
 * rates), anchored to USD. Falls back to a static approximation if the
 * request fails, so the dashboard never breaks over a network hiccup.
 */
export async function getExchangeRatesFromUsd(): Promise<
  Record<string, number>
> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD", {
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      throw new Error(`Frankfurter API returned ${res.status}`);
    }

    const data: { rates: Record<string, number> } = await res.json();

    return { USD: 1, ...data.rates };
  } catch {
    return FALLBACK_RATES_FROM_USD;
  }
}

/** Converts `amount` from `fromCurrency` to `toCurrency` using USD-anchored rates. */
export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  ratesFromUsd: Record<string, number>,
): number {
  if (fromCurrency === toCurrency) return amount;

  const fromRate = ratesFromUsd[fromCurrency] ?? 1;
  const toRate = ratesFromUsd[toCurrency] ?? 1;
  const amountInUsd = amount / fromRate;

  return amountInUsd * toRate;
}
