/**
 * Client-safe bank registry (no `node:crypto`, no secrets) — the single source
 * of truth for which banks the multi-bank UI knows, which connection provider
 * serves each, and which have a CSV statement profile.
 *
 * Providers:
 *  - `altareq`  UAE Open Finance (Al Tareq) — UAE banks.
 *  - `psd2`     EU open banking (PSD2) through a licensed AISP/aggregator —
 *               French banks. NOT implemented and no provider chosen: only the
 *               sandbox stub exists for these banks (see `lib/banking/altareq.ts`).
 *
 * `lib/banking/csv-profiles.ts` has one profile per bank here whose
 * `hasCsvProfile` is true, with the same `key` as its profile id (checked by
 * the registry test noted in tracker/CSV-Bank-Uploads.md).
 */
export type BankSyncMode = "sandbox" | "live" | "unconfigured";

export type BankProvider = "altareq" | "psd2";
export type BankCountry = "AE" | "FR";

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
