[[PROJECT_TRACKER|← Project Tracker]]

# SCPI tracking (Phase 1)

Related: [[Portfolio-Dashboard|Portfolio Dashboard]] (the SCPI block), [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]] (SCPI sits beside real estate), [[Design-System|Design System]].

Status: Phase 1 built 2026-10-09. The methodology comes from the owner's own tracking sheet (one column per holding); this note records what was built, what was verified and what was only assumed, and the data-source investigation. No migration: everything lives in `assets.metadata`.

## 1. Data model (`src/lib/scpi.ts`)

`ScpiMetadata` is versioned (`schema_version: 2`) and backwards compatible: `parseScpiMetadata` fills defaults for every new field, repairs and caps the new lists row by row, never throws, and the pre-existing fields are unchanged (the old tests pass untouched).

New fields: `subscription_date`, `register_numbers` (free text, max 500 chars), `revalorisations[]` (`{id, price, date}`, max 20; the % is derived, chained from the previous price, the first one from the subscription price), `indicators[]` (`{id, as_of, vdrec, vdrea, source_note}`, max 60), `catalog_id`, `name_source` (`catalog` / `manual` / empty for rows created before), and `exceptional` on a dividend. `management_company`, `jouissance_date` (= entry into enjoyment) and `holding_mode` (pleine propriété / nue-propriété / usufruit) already existed and are reused.

Derived (pure functions, all return null instead of NaN):
- enjoyment delay in months = (jouissance - subscription) / 30.5, one decimal (`scpiEnjoymentDelayMonths`);
- revalorisation steps, total revalorisation % and the current subscription price MDS (latest revalorisation, else the price paid);
- sale-minus-purchase per share (EUR, %) and in total = withdrawal value (typed or derived) minus subscription price;
- latest indicators with VDRec / MDS and VDRea / PDR ratios, the as-of date, and a neutral reading (`above` / `below` / `equal` to 100 %: a fact, never advice); stale = older than 12 months;
- per-quarter rate = amount / subscription amount x 4, per-year totals and rates over RECEIVED dividends (year taken from the "T2 2025" label, else the payment date), with exceptional payments split out. The existing dividend ledger is read, never rewritten.

Validation: `validateScpiExtras` returns `{code, message}` with codes `scpi2_err_*` (subscription / jouissance date invalid, jouissance before subscription, revalorisation invalid, too many revalorisations, indicator invalid, too many indicators, register too long). The old `getScpiMetadataErrors` is untouched. Missing values render as an en dash.

## 2. Creation flow

`components/scpi-name-combobox.tsx` replaces the plain Name input in `add-asset-dialog.tsx` when the category is SCPI (minimal additive wiring only): a searchable list (type-ahead, accent- and case-insensitive, finds former names) over `src/lib/scpi-catalog.ts`, plus "Not listed, add manually" which switches to free text and sets `name_source: "manual"` (shown as "unverified" on the asset page, flagged in the export). Picking an entry fills the management company and `catalog_id`. If an entry holds a sourced, dated price (`reference`), the dialog OFFERS to use it (button); it is never applied silently. Known limit: the plain Name input is uncontrolled, so a name typed BEFORE switching the category to SCPI is not carried over.

## 3. Where it shows

- SCPI form (`scpi-fields.tsx`): subscription date, delay readout, share numbers, Revalorisations and Indicators editors, "exceptional" flag per dividend.
- Settings tab (`asset-detail/scpi-settings.tsx`): the new fields, indicator history table, revalorisations.
- Overview tab: `asset-detail/scpi-overview-card.tsx` (`ScpiIndicatorsPanel`): latest indicators with date and source note, MDS, PDR, the two ratios with a neutral reading, sale minus purchase, revalorisation history, yearly and quarterly distribution rates.
- Dashboard: block `scpi` (section `scpi`, Standard tier and up, default size m, allowed m / l / full, placed after the income calendar). Shown only when the user holds at least one SCPI. Content: total value in the base currency, distribution rate weighted by invested capital (realised 12-month yield, else target, else average of recorded rates), per holding VDRec / MDS and VDRea / PDR with the as-of date and a "older than 12 months" badge, link to each holding. Pure builder: `lib/scpi-dashboard.ts`.
- Excel export: the REIT sheet gets name-verified, subscription date, delay, share numbers, up to three revalorisations (price, date, %), total revalorisation, MDS, sale minus purchase (per share, %, total), indicators as-of, VDRec, VDRea and the two ratios; REIT Dividends gets an Exceptional column.
- Assistant knowledge (`lib/assistant/chat-knowledge.ts`) updated.
- Texts: English fallbacks in `lib/scpi-labels.ts` (`scpi2_*`); the 9-language set is in `tmp-i18n-scpi.json` (79 keys including `dlayout_block_scpi`) until merged into the i18n files.

## 4. Catalog: what was verified and what was assumed

`src/lib/scpi-catalog.ts` is one array (`SCPI_CATALOG`); to extend it, append an entry with `verified: true`, `lastChecked`, `sourceUrl`. 40 names, 12 management companies. Checked 2026-10-09 with web searches RESTRICTED to the management companies' official domains (corum.fr, sofidy.com, atland-voisin.com, amundi-immobilier.com, perial.com, praemiareim.fr, paref-gestion.com / paref.com, iroko.eu, reim.bnpparibas.fr, la-francaise.com, aestiam.com, fr.swisslife-am.com).

Verified (name and management company appear on the official domain; the page is the `sourceUrl`): CORUM Origin, XL, Eurion, USA; Sofidy Immorente, Efimmo 1, Sofiboutique (ex Immorente 2); ATLAND Voisin Épargne Pierre, Épargne Pierre Europe, Épargne Pierre Sophia, Immo Placement; Amundi Immobilier Edissimmo, Rivoli Avenir Patrimoine, Génépierre; PERIAL O2 (ex PFO2), Opportunités Europe (ex PFO), Hospitalité Europe (ex PF Hospitalité Europe), Grand Paris (ex PF Grand Paris); Praemia REIM France (formerly Primonial REIM France) Primovie, Primopierre, Patrimmo Commerce, Primofamily, Patrimmo Croissance Impact; PAREF Gestion PAREF Prima (ex Novapierre Allemagne), Hexa (ex Interpierre France), Evo (ex Interpierre Europe Centrale); Iroko Zen, Atlas; BNP Paribas REIM France Accimmo Pierre, Pierre Sélection, Accès Valeur Pierre, France Investipierre, Soprorente, Opus Real; La Française REM Épargne Foncière, Crédit Mutuel Pierre 1; Aestiam Horizon (ex Aestiam Placement Pierre), Aestiam Agora (merger of Pierre Rendement and Cap'Hébergimmo); Swiss Life Asset Managers France ESG Pierre Capitale, Mistral Sélection.

Honest limits of the verification: the evidence is the search results returned for official domains (titles, snippets, summaries), not a full read of every page; several `sourceUrl`s are the manager's range page rather than a page per fund. `capital` (variable / fixed) is set ONLY where an official page said so (ATLAND Voisin, Amundi Immobilier, BNP Accimmo Pierre and Pierre Sélection); otherwise left out. Not included because not verified: Remake Live (no result on its official domain), Ofi Invest Immo Sélection (page does not say it is an SCPI), Sofipierre / Sofiprime / Sofidy Europe Invest / Sofidynamic (listed in Sofidy bulletins but the legal form was not confirmed), La Française Sélectinvest 1 / LF Avenir Santé / LF Opportunité Immo (named only in a search summary), every SCPI of a management company not searched (Fiducial, Euryale, Advenis, Alderan, Arkea REIM, MNK Partners, and others). Renames and mergers are frequent (PFO, Novapierre Allemagne, Aestiam, Primonial to Praemia): recheck names at least yearly.

NO prices and NO VDRec / VDRea are in the catalog: no official published document was read for any figure, and prices change once or twice a year (several managers lowered prices in 2024 to 2026; some funds suspended capital variability in 2026). The `reference` field and the offer UI exist and are tested, but are empty on purpose.

## 5. Data-source investigation (searches run 2026-10-09)

Finding: there is NO free official or open SCPI API or dataset that gives per-fund prices or VDRec / VDRea.

| Source | What it gives | Machine access | Terms / risk | Freshness |
| --- | --- | --- | --- | --- |
| Management companies' own sites and PDFs (quarterly bulletins, annual reports, price-change notices, KID) | The authoritative figures, e.g. BNP Paribas REIM publishes a PDF per price change | PDF and HTML only, no documented API | Official; reuse for personal use fine, automated collection per site terms | Prices when changed (1 to 2 a year); bulletins quarterly; VDRec / VDRea in the annual report and the half-year situation |
| AMF GECO register (geco.amf-france.org) | Visa numbers, list of funds per management company, notices (note d'information, KID) | Web register; no open dataset found | Public register | Updated at each visa |
| AMF open data / data.gouv.fr | No SCPI price dataset found in the searches | none | n/a | n/a |
| ASPIM and IEIF (aspim.fr documentation centre) | Quarterly and annual statistics: collection, capitalisation, average distribution rate (4.72 % 2024, 4.91 % 2025 per press coverage), performance indices | PDF press releases, no open data portal found | Association publications; reuse terms not confirmed | Quarterly |
| Comparison sites (MeilleureSCPI, Centrale des SCPI, France SCPI, 2ndMarket and others) | Prices, rates, bulletins aggregated as HTML | HTML only; no public API found | Site terms (CGU) apply; automated access and reuse NOT confirmed, user reports of stale withdrawal values | Irregular |
| Portfolio apps (e.g. Finary) | SCPI valuation from their own data | closed | commercial | unknown |
| Generic fund-data vendors (Exchange Data International NAV feed, FIDA funds datafeed, Quantalys, Morningstar, FactSet) | Daily NAV feeds for UCITS-type funds; SCPI coverage NOT stated on the pages found | API / FTP, paid | Licence and fees; coverage must be confirmed in writing with each vendor | Daily for covered funds |

Legal basis and the frequency dispute: VDRea and VDRec are defined in article L.214-109 of the Code monétaire et financier (VDRea = appraised value of the buildings plus net value of the other assets; VDRec = VDRea plus the costs of reconstituting the portfolio, interpreted as acquisition costs plus the subscription commission); the subscription price of a variable-capital SCPI must stay within 10 % of VDRec (article L.214-94). Sources disagree on frequency: one says annually in the annual report, another says at least twice a year (year end and half-year situation) since ordonnance 2024-662 of 3 July 2024. The text on Légifrance was not read here: verify before the app states a frequency. This is why the app does not assume one: it stores dated entries and marks any older than 12 months.

What "live" can mean for an SCPI: nothing intraday. A variable-capital SCPI has an administered price that changes 0 to 2 times a year, announced by a notice or the quarterly bulletin; a fixed-capital SCPI trades monthly (or on the secondary market) at a confrontation price. "Fresh" therefore means "the latest published bulletin", checked quarterly.

### Options and recommendation

1. Maintained catalog plus manual entry (v1, RECOMMENDED, what Phase 1 does). Names and managers curated and sourced; prices and VDRec / VDRea typed by the owner from the bulletin with a date and a source note; staleness shown after 12 months. Effort: done. Legal risk: none (no third-party data copied; figures are the user's own entries). Freshness: as fresh as the user's last quarterly update. Cost: user time, a few minutes per bulletin.
2. PDF bulletin ingestion through the existing OCR/PDF pipeline (v2). The user uploads the management company's own bulletin or annual report; the app proposes the figures (price, withdrawal price, VDRec, VDRea, distribution) for the user to confirm before saving, as the bank-statement and Blue Book readers already do. Effort: medium (one profile per management company layout, as with the bank profiles; layouts change). Legal risk: low, the user supplies his own documents. Freshness: at upload. Caveat: unverified on real bulletins, so any parser must be validated on real documents locally (privacy rules of the existing local validation note) before it is trusted.
3. Licensed vendor feed (only if SCPI is a large product line). Ask EDI, FIDA, Quantalys or Morningstar in writing whether they cover SCPI prices and VDRec / VDRea, the licence for redistribution to end users, and the price. Effort: high (contract, mapping to ISIN or name, caching). Legal risk: contractual, covered by the licence. Freshness: depends on the vendor, but the underlying values still only change a few times a year. Not recommended before demand is proven.
4. Scraping comparison sites or management company pages from the app: NOT recommended and not done. Terms of use of the comparison sites were not confirmed to allow automated reuse, aggregators can be stale (user reports), and the app must not make third-party calls. Only the management company's own published documents are a sound primary source.

Decision for now: option 1; revisit option 2 when the owner has a few real bulletins to validate a reader against.

## Tests and checks

Vitest: `lib/scpi.test.ts` (unchanged), `lib/scpi-tracking.test.ts` (parser versions and caps, 30.5 rule, revalorisations, sale minus purchase, ratios and readings, stale, quarter and year rates, validation), `lib/scpi-catalog.test.ts`, `lib/scpi-dashboard.test.ts`, `lib/dashboard-layout.test.ts` (block `scpi` entries only). `tsc --noEmit` and ESLint clean on the touched files. Not checked in a browser: the combobox, the editors, the Overview card and the dashboard block have no component tests and were not looked at on screen.
