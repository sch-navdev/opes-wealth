/**
 * Curated catalog of SCPI names and their management companies, used by the "Name of SCPI"
 * combobox. ONE array (`SCPI_CATALOG`) in ONE place: to add an SCPI, append an entry.
 *
 * Rules (see tracker/Scpi-Tracking.md):
 *  - an entry is listed only if its name AND management company were read on the management
 *    company's OFFICIAL site (`sourceUrl`); `verified: true` + `lastChecked` record that;
 *  - `capital` is set only when the official page states it;
 *  - `reference` (a current subscription / withdrawal price) is set only from an official published
 *    document that was actually read, with its `asOf` date and `sourceUrl`. It is OFFERED to the
 *    user, never applied silently. No entry has one yet: prices change once or twice a year and
 *    must be copied from the latest bulletin, not from this file.
 *  - names are the current official spelling; former names go in `aliases` so type-ahead finds them.
 */

import type { ScpiMetadata } from "@/lib/scpi";

export type ScpiCapitalType = "variable" | "fixed";

export type ScpiReferencePrices = {
  /** Per-share current subscription price (prix de souscription). */
  subscriptionPrice: number | null;
  /** Per-share current withdrawal price (prix de retrait). */
  withdrawalPrice: number | null;
  /** ISO date the figures are valid at. */
  asOf: string;
  /** Official document the figures were read in. */
  sourceUrl: string;
};

export type ScpiCatalogEntry = {
  /** Stable slug; stored in the asset's metadata (`catalog_id`). Never reuse or rename. */
  id: string;
  name: string;
  managementCompany: string;
  /** Former or short names, for search only. */
  aliases?: string[];
  capital?: ScpiCapitalType;
  verified: true;
  /** ISO date the name/manager were last checked on the official site. */
  lastChecked: string;
  /** Official page the name and manager were read on. */
  sourceUrl: string;
  reference?: ScpiReferencePrices;
};

const CHECKED = "2026-10-09";

export const SCPI_CATALOG: readonly ScpiCatalogEntry[] = [
  // CORUM Asset Management (corum.fr)
  { id: "corum-origin", name: "CORUM Origin", managementCompany: "CORUM Asset Management", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.corum.fr/nos-scpi/corum-origin" },
  { id: "corum-xl", name: "CORUM XL", managementCompany: "CORUM Asset Management", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.corum.fr/nos-scpi" },
  { id: "corum-eurion", name: "CORUM Eurion", managementCompany: "CORUM Asset Management", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.corum.fr/nos-scpi" },
  { id: "corum-usa", name: "CORUM USA", managementCompany: "CORUM Asset Management", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.corum.fr/nos-scpi" },

  // Sofidy (sofidy.com)
  { id: "immorente", name: "Immorente", managementCompany: "Sofidy", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.sofidy.com/actualites/immorente-et-efimmo-1-les-scpi-historiques-de-sofidy/" },
  { id: "efimmo-1", name: "Efimmo 1", managementCompany: "Sofidy", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.sofidy.com/solutions/efimmo1/" },
  { id: "sofiboutique", name: "Sofiboutique", managementCompany: "Sofidy", aliases: ["Immorente 2"], verified: true, lastChecked: CHECKED, sourceUrl: "https://www.sofidy.com/solutions/immorente-2/" },

  // ATLAND Voisin (atland-voisin.com)
  { id: "epargne-pierre", name: "Épargne Pierre", managementCompany: "ATLAND Voisin", aliases: ["Epargne Pierre"], capital: "variable", verified: true, lastChecked: CHECKED, sourceUrl: "https://atland-voisin.com/comprendre-les-scpi/quelles-scpi-proposez-vous/" },
  { id: "epargne-pierre-europe", name: "Épargne Pierre Europe", managementCompany: "ATLAND Voisin", aliases: ["Epargne Pierre Europe"], capital: "variable", verified: true, lastChecked: CHECKED, sourceUrl: "https://atland-voisin.com/comprendre-les-scpi/quelles-scpi-proposez-vous/" },
  { id: "epargne-pierre-sophia", name: "Épargne Pierre Sophia", managementCompany: "ATLAND Voisin", aliases: ["Epargne Pierre Sophia"], capital: "variable", verified: true, lastChecked: CHECKED, sourceUrl: "https://atland-voisin.com/comprendre-les-scpi/quelles-scpi-proposez-vous/" },
  { id: "immo-placement", name: "Immo Placement", managementCompany: "ATLAND Voisin", capital: "fixed", verified: true, lastChecked: CHECKED, sourceUrl: "https://atland-voisin.com/comprendre-les-scpi/quelles-scpi-proposez-vous/" },

  // Amundi Immobilier (amundi-immobilier.com)
  { id: "edissimmo", name: "Edissimmo", managementCompany: "Amundi Immobilier", capital: "variable", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.amundi-immobilier.com/Nos-solutions-d-epargne/Notre-offre-SCPI" },
  { id: "rivoli-avenir-patrimoine", name: "Rivoli Avenir Patrimoine", managementCompany: "Amundi Immobilier", capital: "variable", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.amundi-immobilier.com/Nos-solutions-d-epargne/Notre-offre-SCPI" },
  { id: "genepierre", name: "Génépierre", managementCompany: "Amundi Immobilier", aliases: ["Genepierre"], capital: "variable", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.amundi-immobilier.com/Nos-solutions-d-epargne/Notre-offre-SCPI" },

  // PERIAL Asset Management (perial.com)
  { id: "perial-o2", name: "PERIAL O₂", managementCompany: "PERIAL Asset Management", aliases: ["PFO2", "Pf O2", "PERIAL O2"], verified: true, lastChecked: CHECKED, sourceUrl: "https://www.perial.com/scpi/perial-o2" },
  { id: "perial-opportunites-europe", name: "PERIAL Opportunités Europe", managementCompany: "PERIAL Asset Management", aliases: ["PFO", "Pf O"], verified: true, lastChecked: CHECKED, sourceUrl: "https://www.perial.com/scpi/perial-opportunites-europe" },
  { id: "perial-hospitalite-europe", name: "PERIAL Hospitalité Europe", managementCompany: "PERIAL Asset Management", aliases: ["PF Hospitalité Europe"], verified: true, lastChecked: CHECKED, sourceUrl: "https://perial.com/en/scpi/pf-hospitalite-europe" },
  { id: "perial-grand-paris", name: "PERIAL Grand Paris", managementCompany: "PERIAL Asset Management", aliases: ["PF Grand Paris", "Pf Grand Paris"], verified: true, lastChecked: CHECKED, sourceUrl: "https://www.perial.com/groupe-perial/actualites/stabilite-du-prix-des-parts-des-scpi-pf-grand-paris-pfo-pfo2-et-pf-hospitalite-europe" },

  // Praemia REIM France, formerly Primonial REIM France (praemiareim.fr)
  { id: "primovie", name: "Primovie", managementCompany: "Praemia REIM France", aliases: ["Primonial REIM"], verified: true, lastChecked: CHECKED, sourceUrl: "https://www.praemiareim.fr/en/scpi-primovie" },
  { id: "primopierre", name: "Primopierre", managementCompany: "Praemia REIM France", aliases: ["Primonial REIM"], verified: true, lastChecked: CHECKED, sourceUrl: "https://www.praemiareim.fr/en/scpi-primopierre" },
  { id: "patrimmo-commerce", name: "Patrimmo Commerce", managementCompany: "Praemia REIM France", aliases: ["Primonial REIM"], verified: true, lastChecked: CHECKED, sourceUrl: "https://www.praemiareim.fr/en/primonial-reim-france-r%C3%A9duit-le-d%C3%A9lai-de-jouissance-des-scpi-primovie-primopierre-patrimmo-commerce-et-primofamily" },
  { id: "primofamily", name: "Primofamily", managementCompany: "Praemia REIM France", aliases: ["Primonial REIM"], verified: true, lastChecked: CHECKED, sourceUrl: "https://www.praemiareim.fr/en/primonial-reim-france-r%C3%A9duit-le-d%C3%A9lai-de-jouissance-des-scpi-primovie-primopierre-patrimmo-commerce-et-primofamily" },
  { id: "patrimmo-croissance-impact", name: "Patrimmo Croissance Impact", managementCompany: "Praemia REIM France", aliases: ["Patrimmo Croissance", "Primonial REIM"], verified: true, lastChecked: CHECKED, sourceUrl: "https://www.praemiareim.fr/en/actualites-primonial-reim-france-resistance-des-scpi-d-immobilier-de-sante-et-residentiel" },

  // PAREF Gestion (paref-gestion.com, paref.com)
  { id: "paref-prima", name: "PAREF Prima", managementCompany: "PAREF Gestion", aliases: ["Novapierre Allemagne"], verified: true, lastChecked: CHECKED, sourceUrl: "https://paref-gestion.com/nos-scpi/paref-prima/" },
  { id: "paref-hexa", name: "PAREF Hexa", managementCompany: "PAREF Gestion", aliases: ["Interpierre France"], verified: true, lastChecked: CHECKED, sourceUrl: "https://paref.com/en/actualites/financial-information-of-the-third-quarter-2024/" },
  { id: "paref-evo", name: "PAREF Evo", managementCompany: "PAREF Gestion", aliases: ["Interpierre Europe Centrale"], verified: true, lastChecked: CHECKED, sourceUrl: "https://paref.com/en/actualites/financial-information-of-the-third-quarter-2024/" },

  // Iroko (iroko.eu)
  { id: "iroko-zen", name: "Iroko Zen", managementCompany: "Iroko", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.iroko.eu/scpi/zen" },
  { id: "iroko-atlas", name: "Iroko Atlas", managementCompany: "Iroko", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.iroko.eu/scpi/atlas" },

  // BNP Paribas REIM France (reim.bnpparibas.fr)
  { id: "accimmo-pierre", name: "Accimmo Pierre", managementCompany: "BNP Paribas REIM France", capital: "variable", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.reim.bnpparibas.fr/accimmo-pierre" },
  { id: "pierre-selection", name: "Pierre Sélection", managementCompany: "BNP Paribas REIM France", aliases: ["Pierre Selection"], capital: "fixed", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.reim.bnpparibas.fr/pierre-selection" },
  { id: "acces-valeur-pierre", name: "Accès Valeur Pierre", managementCompany: "BNP Paribas REIM France", aliases: ["Acces Valeur Pierre"], verified: true, lastChecked: CHECKED, sourceUrl: "https://www.reim.bnpparibas.fr/" },
  { id: "france-investipierre", name: "France Investipierre", managementCompany: "BNP Paribas REIM France", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.reim.bnpparibas.fr/" },
  { id: "soprorente", name: "Soprorente", managementCompany: "BNP Paribas REIM France", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.reim.bnpparibas.fr/" },
  { id: "opus-real", name: "Opus Real", managementCompany: "BNP Paribas REIM France", verified: true, lastChecked: CHECKED, sourceUrl: "https://www.reim.bnpparibas.fr/" },

  // La Française Real Estate Managers (la-francaise.com)
  { id: "epargne-fonciere", name: "Épargne Foncière", managementCompany: "La Française Real Estate Managers", aliases: ["Epargne Fonciere"], verified: true, lastChecked: CHECKED, sourceUrl: "https://www.la-francaise.com/fr-fr/nos-solutions-pour-vous/nos-produits/product/Scpi/ee-epargne-fonciere/" },
  { id: "credit-mutuel-pierre-1", name: "Crédit Mutuel Pierre 1", managementCompany: "La Française Real Estate Managers", aliases: ["Credit Mutuel Pierre 1"], verified: true, lastChecked: CHECKED, sourceUrl: "https://doc.la-francaise.com/documents/fiche-commerciale-credit-mutuel-pierre-1" },

  // Aestiam (aestiam.com)
  { id: "aestiam-horizon", name: "Aestiam Horizon", managementCompany: "Aestiam", aliases: ["Aestiam Placement Pierre"], verified: true, lastChecked: CHECKED, sourceUrl: "https://www.aestiam.com/actualites/naissance-aestiam-horizon-et-aestiam-agora/" },
  { id: "aestiam-agora", name: "Aestiam Agora", managementCompany: "Aestiam", aliases: ["Aestiam Pierre Rendement", "Aestiam Cap'Hébergimmo"], verified: true, lastChecked: CHECKED, sourceUrl: "https://www.aestiam.com/actualites/naissance-aestiam-horizon-et-aestiam-agora/" },

  // Swiss Life Asset Managers France (fr.swisslife-am.com)
  { id: "esg-pierre-capitale", name: "ESG Pierre Capitale", managementCompany: "Swiss Life Asset Managers France", aliases: ["SwissLife Pierre Capitale"], verified: true, lastChecked: CHECKED, sourceUrl: "https://fr.swisslife-am.com/fr/particuliers/nos-fonds/scpi.html" },
  { id: "mistral-selection", name: "Mistral Sélection", managementCompany: "Swiss Life Asset Managers France", aliases: ["Mistral Selection"], verified: true, lastChecked: CHECKED, sourceUrl: "https://fr.swisslife-am.com/fr/home/news/france/retail/real-estate/lancement-scpi-mistral-selection.html" },
];

const BY_ID = new Map(SCPI_CATALOG.map((e) => [e.id, e]));

export function getCatalogEntry(id: string): ScpiCatalogEntry | undefined {
  return BY_ID.get(id);
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Type-ahead: entries whose name, alias or management company contains every typed word
 * (accent- and case-insensitive). An empty query returns the whole catalog, sorted by name.
 */
export function searchScpiCatalog(query: string, catalog: readonly ScpiCatalogEntry[] = SCPI_CATALOG): ScpiCatalogEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const sorted = [...catalog].sort((a, b) => a.name.localeCompare(b.name));
  if (words.length === 0) return sorted;
  return sorted.filter((e) => {
    const hay = fold([e.name, e.managementCompany, ...(e.aliases ?? [])].join(" "));
    return words.every((w) => hay.includes(w));
  });
}

/** Metadata after the user ACCEPTS a reference price offer (only the prices it holds are written). */
export function applyReferencePrices(metadata: ScpiMetadata, ref: ScpiReferencePrices): ScpiMetadata {
  return {
    ...metadata,
    subscription_price:
      ref.subscriptionPrice != null && ref.subscriptionPrice > 0 ? ref.subscriptionPrice : metadata.subscription_price,
    withdrawal_value:
      ref.withdrawalPrice != null && ref.withdrawalPrice > 0 ? ref.withdrawalPrice : metadata.withdrawal_value,
  };
}

/** A reference price offer for an entry, only when it holds a sourced, dated price. */
export function referenceOffer(entry: ScpiCatalogEntry | undefined): ScpiReferencePrices | null {
  const ref = entry?.reference;
  if (!ref || !ref.asOf || !ref.sourceUrl) return null;
  if (!(ref.subscriptionPrice != null && ref.subscriptionPrice > 0) && !(ref.withdrawalPrice != null && ref.withdrawalPrice > 0)) {
    return null;
  }
  return ref;
}
