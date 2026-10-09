[[PROJECT_TRACKER|← Project Tracker]]

# Assurance-Vie: what a contract can hold

Reference behind the "Contract holdings" feature. Related: [[Portfolio-Dashboard|Portfolio Dashboard]]. Researched 2026-10-09 with web search; the sources are mostly broker / adviser pages plus a few regulator and court pages. **This is not legal or tax advice, and eligibility always depends on the specific contract.**

## What the sources support (verified by at least one source)

| Holding type in the app | Finding | Source |
|---|---|---|
| Euro fund (fonds en euros) | General fund of the insurer; the guarantee is the insurer's, usually net of fees. Standard in French multisupport contracts. | Ramify, Allianz, Linxea pages on unités de compte |
| Fund (OPCVM / SICAV / FCP) | Eligible unit-linked support (valeurs mobilières, parts de placements collectifs). | [Ramify](https://www.ramify.fr/epargne/unite-de-compte), [Linxea](https://www.linxea.com/tout-savoir-sur/assurance-vie/supports-assurance-vie/) |
| ETF / tracker | Offered as unit-linked supports; one broker lists 83 ETFs on a single Generali-based contract. | [Altaprofits](https://www.altaprofits.com/notre-offre-financiere/supports-financiers/assurance-vie-generali/fcpr) |
| Real estate units (SCPI / SCI / OPCI) | Eligible as units; low entry ticket; offered contract by contract. | Ramify, Altaprofits (6 SCPI-SCI, 3 OPCI on that contract) |
| Private equity fund (FCPR / FPCI / FCPI) | Eligible as units where the insurer lists them (FCPR/FCPI/FIP named; one contract lists 3 FCPR). Professional funds opened up by the PACTE law, with conditions on the investor (CMS summary of the bill; final text not checked). | [CMS on PACTE](https://cms.law/fr/fra/a-la-une/nouveautes-de-la-loi-pacte-en-matiere-de-fonds-d-investissement) |
| Structured product | A structured bond listed on a recognised market can be an eligible unit (Cour de cassation, 10 Oct 2024, n. 22-23.116; CMS note on structured bonds). | [Dalloz](https://www.dalloz-actualite.fr/document/civ-2e-10-oct-2024-f-b-n-22-23116), [CMS](https://cms.law/fr/FRA/Publication/Contrats-d-assurance-vie-en-unites-de-compte-les-obligations-structurees-y-sont-eligibles) |
| Bond | Bonds issued or guaranteed by a State / community, and listed bonds, are in the code list (article R131-1 refers to R332-2). | [Légifrance, Code des assurances](https://www.legifrance.gouv.fr/codes/id/LEGIARTI000054031126/2026-05-06) |
| Direct equity (titres vifs) | Shares of commercial companies appear in the same list; in practice offered mainly in some French contracts and widely in Luxembourg contracts through FAS-type funds. Client category (A to D under Luxembourg rules) can gate access. | Légifrance (R131-1), [Fortuny](https://fortunyconseil.fr/investir/financier/assurance-vie/unites-compte/titres-vifs/), [Ramify](https://www.ramify.fr/gestion-de-patrimoine/contrat-capitalisation-personne-morale) |
| Money-market fund | Named among the supports (fonds monétaires). | Ramify / Allianz unit-linked pages |
| Luxembourg wrappers | Internal funds FIC (collective), FID (dedicated, discretionary), FAS (specialised, policyholder-chosen); assets held at a CAA-approved custodian bank ("triangle of security"); policyholder has a privileged creditor status. Broker pages say these can hold UCITS, structured products, direct securities, private equity / debt, some real estate and hedge funds. | [ACA Q&A on the triangle](https://www.aca.lu/wp-content/uploads/2022/06/Triangle-QA-newlegislation-ENG.pdf), [Banque Populaire](https://www.banquepopulaire.fr/gestion-privee/assurance-vie-luxembourgeoise/), [Notaires de Paris](https://paris.notaires.fr/fr/lexique-patrimoine/contrats-luxembourgeois-assurances-vie-et-capitalisation) |
| Luxembourg rules in force | CAA circular letter 26/1 (28 Jan 2026, in force 1 Feb 2026, replaces 15/3) for unit-linked investment rules; circular 26/2 amends 16/9 on deposits of securities and cash. | [CMS Luxembourg](https://cms.law/en/lux/legal-updates/new-investment-rules-for-luxembourg-unit-linked-life-insurance-products-taken-out-after-1-february-2026), [CAA asset deposits](https://www.caa.lu/en/documentation/circular-letters/life-insurance/asset-deposits) |
| Capitalisation contracts | Same logic as assurance-vie for supports; no beneficiary clause (it falls into the estate); legal entities may subscribe; Luxembourg versions offer more direct securities via FAS. | Auguste Patrimoine, Notaires de Paris, Ramify |
| Code limits | Article R131-1 caps some categories as a share of the contract (for example 10% for one category; 30% for others). Not modelled by the app. | Légifrance (R131-1, version of 6 May 2026) |

## Assumed or NOT verified

- **Commodity / gold ETC**: no source addressed ETCs directly. Gold or commodity ETFs are ordinary funds. Many ETCs are debt securities, so they may be eligible as listed securities, but that depends on the instrument and on the insurer's list. **Physical gold is not an eligible unit.** The app type exists because users hold these; it asserts nothing about eligibility.
- **Cash balance (compte espèces)**: no source described a cash account inside a French or Luxembourg contract. Circular 16/9 / 26/2 mention deposits of cash with the custodian, but the cash rules inside funds were not read. Treated as a user-entered line (a liquidity or money-market sleeve).
- Whether a given insurer lists a given support: only the insurer's list answers that.
- The wording of R131-1 / R332-2 sub-points (6 degrees, 7 degrees, 9 bis) was only seen in truncated excerpts.
- FID / FAS entry thresholds quoted by brokers conflict (EUR 125k to 250k and more); not used in the app.
- Final text of the PACTE law on professional funds: not read.

## How the app models it

- `src/lib/assurance-vie-holdings.ts`: types `euro_fund`, `fund_opcvm`, `etf`, `scpi_sci_opci`, `private_equity_fund`, `structured_product`, `bond`, `equity_direct`, `commodity_etc`, `money_market`, `cash_balance`, `other`; max 60 rows; value in the contract currency; optional ISIN (format check only, no registry), ticker, units, unit price, as-of date.
- Metadata version 2 (`holdings` array). Version 1 records have none and load unchanged.
- When holdings have a total, euro-fund % = euro_fund value / total and unit-linked % = everything else, **including a cash balance** (the contract model is a two-way split). Manual percentages are kept when there are no holdings.
- Reconciliation compares the holdings total with the contract value (tolerance 1 currency unit). It shows the difference and a neutral note and never blocks saving. For a co-owned asset the detail page value is the viewer's share, so a difference is expected; the card says so.
- UI: `src/components/assurance-vie-holdings-editor.tsx` (dense editable table, pattern from 21st.dev "Table Edit"/"Editable Data Table", rebuilt square-cornered), breakdown card in `assurance-vie-cards.tsx`, export sheet "AV Holdings" in `portfolio-export.ts`.
- No network lookups. Strings: `av_hold_*` keys, English fallback in `assurance-vie-labels.ts`; 9-language set in `tmp-i18n-av-holdings.json` awaiting merge.
- The estate card is unchanged: it reads no amounts and holdings do not change what it needs.
