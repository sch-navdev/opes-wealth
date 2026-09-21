/**
 * Foreign-exchange helpers for displaying multi-currency portfolio values
 * in one selected currency.
 *
 * All rates are anchored to a single base currency (USD by default), so
 * converting between any two currencies only ever needs one fetch.
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

type OpenErApiResponse = {
  result: string;
  rates: Record<string, number>;
};

/**
 * Fetches live rates from https://open.er-api.com, anchored to `base`
 * (USD by default). Frankfurter (the previous provider) doesn't support
 * AED, which this app needs, so this uses open.er-api.com instead. Checked
 * at most twice a day (`revalidate: 43200` seconds = 12h) since FX rates
 * don't need to be any fresher than that for portfolio display purposes.
 * Falls back to a static approximation — effectively a 1:1 ratio for any
 * currency it doesn't recognize — if the request fails, so the dashboard
 * never breaks over a network hiccup or an unsupported code.
 */
export async function getExchangeRatesFromUsd(
  base = "USD",
): Promise<Record<string, number>> {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
      next: { revalidate: 43200 },
    });

    if (!res.ok) {
      throw new Error(`open.er-api.com returned ${res.status}`);
    }

    const data: OpenErApiResponse = await res.json();

    if (data.result !== "success" || !data.rates) {
      throw new Error("open.er-api.com returned an unsuccessful result");
    }

    return { [base]: 1, ...data.rates };
  } catch {
    return FALLBACK_RATES_FROM_USD;
  }
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
