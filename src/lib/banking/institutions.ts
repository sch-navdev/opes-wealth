/**
 * Client-safe bank registry (no `node:crypto`, no secrets) — the single source
 * of truth for which banks the multi-bank UI knows, which connection provider
 * serves each, and which have a CSV statement profile.
 *
 * Providers:
 *  - `altareq`  UAE Open Finance (Al Tareq) — UAE banks.
 *  - `psd2`     Open banking through a licensed AISP/aggregator — the EU's PSD2
 *               (France, Spain, Germany, Italy), UK Open Banking, and for the US
 *               the equivalent aggregator route (Plaid-style; the US has no PSD2).
 *               One provider value for all of them so the `bank_connections`
 *               CHECK (migration 0020) is unchanged. NOT implemented and no
 *               provider chosen: only the sandbox stub exists for these banks
 *               (see `lib/banking/altareq.ts`). Banks outside the UAE and France
 *               have no CSV statement profile yet — add a profile in
 *               `csv-profiles.ts` and flip `hasCsvProfile` when a real export is
 *               available.
 *
 * `lib/banking/csv-profiles.ts` has one profile per bank here whose
 * `hasCsvProfile` is true, with the same `key` as its profile id (checked by
 * the registry test noted in tracker/CSV-Bank-Uploads.md).
 */
export type BankSyncMode = "sandbox" | "live" | "unconfigured";

export type BankProvider = "altareq" | "psd2";
export type BankCountry = "AE" | "FR" | "GB" | "US" | "ES" | "DE" | "IT";

/** Display order of the country groups (names come from `Intl.DisplayNames`, so they follow the UI language). */
export const BANK_COUNTRIES: BankCountry[] = ["AE", "FR", "GB", "US", "ES", "DE", "IT"];

export type BankDef = {
  key: string;
  name: string;
  country: BankCountry;
  provider: BankProvider;
  /** A CSV statement profile with this same key exists in `csv-profiles.ts`. */
  hasCsvProfile: boolean;
  /** Gets its own button on the Banking page (the rest are reachable from the generic Connect bank picker). */
  dedicated: boolean;
  defaultCurrency: string;
  /** Website whose favicon is shown as the bank's logo (see `components/institution-logo.tsx`). */
  domain: string;
};

const DOMAINS: Record<string, string> = {
  wio: "wio.io",
  enbd: "emiratesnbd.com",
  adcb: "adcb.com",
  fab: "bankfab.com",
  rakbank: "rakbank.ae",
  mashreq: "mashreq.com",
  dib: "dib.ae",
  boursobank: "boursobank.com",
  societe_generale: "www.societegenerale.fr",
  bnp_paribas: "bnpparibas.com",
  credit_agricole: "credit-agricole.fr",
  lcl: "lcl.fr",
  caisse_epargne: "www.caisse-epargne.fr",
  banque_populaire: "www.banquepopulaire.fr",
  la_banque_postale: "labanquepostale.fr",
  cic: "cic.fr",
  credit_mutuel: "creditmutuel.fr",
  hsbc_france: "www.hsbc.fr",
  hello_bank: "hellobank.fr",
  fortuneo: "fortuneo.fr",
  ing_france: "ing.fr",
  // United Kingdom
  hsbc_uk: "hsbc.co.uk",
  barclays: "barclays.co.uk",
  lloyds: "lloydsbank.com",
  natwest: "natwest.com",
  santander_uk: "santander.co.uk",
  monzo: "monzo.com",
  starling: "starlingbank.com",
  revolut_uk: "revolut.com",
  // United States
  chase: "chase.com",
  bank_of_america: "bankofamerica.com",
  wells_fargo: "wellsfargo.com",
  citibank: "citi.com",
  capital_one: "capitalone.com",
  us_bank: "usbank.com",
  ally: "ally.com",
  // Spain
  santander_es: "bancosantander.es",
  bbva: "bbva.es",
  caixabank: "caixabank.es",
  sabadell: "bancsabadell.com",
  bankinter: "bankinter.com",
  openbank: "openbank.es",
  ing_espana: "ing.es",
  unicaja: "unicajabanco.es",
  // Germany
  deutsche_bank: "deutsche-bank.de",
  commerzbank: "commerzbank.de",
  n26: "n26.com",
  dkb: "dkb.de",
  // Italy
  intesa_sanpaolo: "intesasanpaolo.com",
  unicredit: "unicredit.it",
};

const uae = (key: string, name: string, extra: Partial<BankDef> = {}): BankDef => ({
  key,
  domain: DOMAINS[key],
  name,
  country: "AE",
  provider: "altareq",
  hasCsvProfile: true,
  dedicated: true,
  defaultCurrency: "AED",
  ...extra,
});

const fr = (key: string, name: string): BankDef => ({
  key,
  domain: DOMAINS[key],
  name,
  country: "FR",
  provider: "psd2",
  hasCsvProfile: true,
  dedicated: true,
  defaultCurrency: "EUR",
});

/** A bank connected through open banking (PSD2 / UK Open Banking / US aggregator) with no CSV statement profile yet. */
const openBanking = (key: string, name: string, country: BankCountry, defaultCurrency: string): BankDef => ({
  key,
  domain: DOMAINS[key],
  name,
  country,
  provider: "psd2",
  hasCsvProfile: false,
  dedicated: false,
  defaultCurrency,
});

export const BANKS: BankDef[] = [
  // UAE
  uae("wio", "Wio Bank"),
  uae("enbd", "Emirates NBD"),
  uae("adcb", "ADCB"),
  uae("fab", "First Abu Dhabi Bank"),
  uae("rakbank", "RAKBANK"),
  uae("mashreq", "Mashreq"),
  uae("dib", "Dubai Islamic Bank", { hasCsvProfile: false, dedicated: false }),
  // France
  fr("boursobank", "BoursoBank"),
  fr("societe_generale", "Société Générale"),
  fr("bnp_paribas", "BNP Paribas"),
  fr("credit_agricole", "Crédit Agricole"),
  fr("lcl", "LCL"),
  fr("caisse_epargne", "Caisse d'Épargne"),
  fr("banque_populaire", "Banque Populaire"),
  fr("la_banque_postale", "La Banque Postale"),
  fr("cic", "CIC"),
  fr("credit_mutuel", "Crédit Mutuel"),
  fr("hsbc_france", "HSBC France"),
  fr("hello_bank", "Hello bank!"),
  fr("fortuneo", "Fortuneo"),
  fr("ing_france", "ING France"),
  // United Kingdom
  openBanking("hsbc_uk", "HSBC UK", "GB", "GBP"),
  openBanking("barclays", "Barclays", "GB", "GBP"),
  openBanking("lloyds", "Lloyds Bank", "GB", "GBP"),
  openBanking("natwest", "NatWest", "GB", "GBP"),
  openBanking("santander_uk", "Santander UK", "GB", "GBP"),
  openBanking("monzo", "Monzo", "GB", "GBP"),
  openBanking("starling", "Starling Bank", "GB", "GBP"),
  openBanking("revolut_uk", "Revolut (UK)", "GB", "GBP"),
  // United States
  openBanking("chase", "Chase", "US", "USD"),
  openBanking("bank_of_america", "Bank of America", "US", "USD"),
  openBanking("wells_fargo", "Wells Fargo", "US", "USD"),
  openBanking("citibank", "Citibank", "US", "USD"),
  openBanking("capital_one", "Capital One", "US", "USD"),
  openBanking("us_bank", "U.S. Bank", "US", "USD"),
  openBanking("ally", "Ally Bank", "US", "USD"),
  // Spain
  openBanking("santander_es", "Banco Santander", "ES", "EUR"),
  openBanking("bbva", "BBVA", "ES", "EUR"),
  openBanking("caixabank", "CaixaBank", "ES", "EUR"),
  openBanking("sabadell", "Banco Sabadell", "ES", "EUR"),
  openBanking("bankinter", "Bankinter", "ES", "EUR"),
  openBanking("openbank", "Openbank", "ES", "EUR"),
  openBanking("ing_espana", "ING España", "ES", "EUR"),
  openBanking("unicaja", "Unicaja Banco", "ES", "EUR"),
  // Germany
  openBanking("deutsche_bank", "Deutsche Bank", "DE", "EUR"),
  openBanking("commerzbank", "Commerzbank", "DE", "EUR"),
  openBanking("n26", "N26", "DE", "EUR"),
  openBanking("dkb", "DKB", "DE", "EUR"),
  // Italy
  openBanking("intesa_sanpaolo", "Intesa Sanpaolo", "IT", "EUR"),
  openBanking("unicredit", "UniCredit", "IT", "EUR"),
];

/** Looks a bank up by display name (the Banking overview groups accounts by institution name). */
export function bankByName(name: string): BankDef | undefined {
  return BANKS.find((b) => b.name === name);
}

export function getBank(key: string): BankDef | undefined {
  return BANKS.find((b) => b.key === key);
}

export const banksByCountry = (country: BankCountry): BankDef[] =>
  BANKS.filter((b) => b.country === country);

/** Institution id for a bank: the sandbox twin in sandbox mode, the plain key otherwise. */
export function bankInstitutionId(key: string, mode: BankSyncMode): string {
  return mode === "sandbox" ? `sandbox-${key}` : key;
}

/** The registry entry behind an institution id (`sandbox-enbd` and `enbd` both → Emirates NBD). */
export function bankFromInstitutionId(id: string): BankDef | undefined {
  return getBank(id.replace(/^sandbox-/, ""));
}

/**
 * Whether a bank's connect button can work in this mode: sandbox → every bank;
 * live → only banks whose provider is implemented (none yet — see the file
 * header); unconfigured → none. French banks therefore stay sandbox-only until
 * an EU open-banking provider is chosen and integrated.
 */
export function canConnect(bank: BankDef, mode: BankSyncMode): boolean {
  if (mode === "sandbox") return true;
  if (mode === "live") return bank.provider === "altareq";
  return false;
}
