/**
 * Broker directory: brokers/platforms people hold investments with, with the
 * website whose icon is shown as their logo (see `components/institution-logo.tsx`
 * and `app/api/logo/[kind]/[key]/route.ts`).
 *
 * Alignment with Sharesight: Sharesight tracks holdings from many brokers
 * (auto-sync or its own trade/portfolio exports). This list is OUR curated
 * selection of the brokers Sharesight is generally known to cover — Sharesight
 * publishes no machine-readable directory, so it is NOT a verified copy of it.
 * Opes Wealth has two real import parsers (`parsers/broker-registry.ts`: Saxo,
 * Sharesight). For every other broker here the supported path is: connect it in
 * Sharesight, export the Sharesight report, and import that file with the
 * Sharesight parser (`viaSharesight: true`).
 */
export type DirectoryBroker = {
  id: string;
  name: string;
  /** Website whose favicon is the logo. */
  domain: string;
  /** Home regions (ISO 3166-1 alpha-2). */
  regions: string[];
  /** Has its own import parser in `parsers/broker-registry.ts`. */
  ownParser: boolean;
  /** Can be imported through a Sharesight export. */
  viaSharesight: boolean;
};

const b = (
  id: string,
  name: string,
  domain: string,
  regions: string[],
  extra: Partial<DirectoryBroker> = {},
): DirectoryBroker => ({ id, name, domain, regions, ownParser: false, viaSharesight: true, ...extra });

export const BROKER_DIRECTORY: DirectoryBroker[] = [
  b("saxo", "Saxo Bank", "home.saxo", ["DK", "AE", "FR", "GB", "SG"], { ownParser: true }),
  b("sharesight", "Sharesight", "sharesight.com", ["NZ", "AU", "GB", "US"], { ownParser: true, viaSharesight: false }),
  b("interactive_brokers", "Interactive Brokers", "interactivebrokers.com", ["US", "GB", "IE"]),
  b("charles_schwab", "Charles Schwab", "schwab.com", ["US"]),
  b("fidelity", "Fidelity", "fidelity.com", ["US"]),
  b("vanguard", "Vanguard", "vanguard.com", ["US", "GB"]),
  b("etrade", "E*TRADE", "etrade.com", ["US"]),
  b("robinhood", "Robinhood", "robinhood.com", ["US"]),
  b("degiro", "DEGIRO", "degiro.com", ["NL", "DE", "FR", "ES", "IT"]),
  b("trading212", "Trading 212", "trading212.com", ["GB", "BG"]),
  b("freetrade", "Freetrade", "freetrade.io", ["GB"]),
  b("hargreaves_lansdown", "Hargreaves Lansdown", "hl.co.uk", ["GB"]),
  b("ajbell", "AJ Bell", "ajbell.co.uk", ["GB"]),
  b("interactive_investor", "interactive investor", "ii.co.uk", ["GB"]),
  b("ig", "IG", "ig.com", ["GB", "AU", "AE"]),
  b("etoro", "eToro", "etoro.com", ["IL", "GB", "CY"]),
  b("trade_republic", "Trade Republic", "traderepublic.com", ["DE", "FR", "ES", "IT"]),
  b("scalable_capital", "Scalable Capital", "scalable.capital", ["DE"]),
  b("boursorama", "Boursorama", "boursorama.com", ["FR"]),
  b("revolut", "Revolut", "revolut.com", ["GB", "FR", "ES"]),
  b("commsec", "CommSec", "commsec.com.au", ["AU"]),
  b("stake", "Stake", "hellostake.com", ["AU", "NZ"]),
  b("swissquote", "Swissquote", "swissquote.com", ["CH", "AE"]),
  b("questrade", "Questrade", "questrade.com", ["CA"]),
  b("wealthsimple", "Wealthsimple", "wealthsimple.com", ["CA"]),
];

export function getDirectoryBroker(id: string): DirectoryBroker | undefined {
  return BROKER_DIRECTORY.find((x) => x.id === id);
}

/** Brokers with no parser of their own — the "import via Sharesight" ones. */
export const SHARESIGHT_ONLY_BROKERS: DirectoryBroker[] = BROKER_DIRECTORY.filter(
  (x) => !x.ownParser && x.viaSharesight,
);
