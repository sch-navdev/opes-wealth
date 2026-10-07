/**
 * Client Knowledge Document (DCC — "Document de Connaissance Client") data
 * model and the part of it Opes Wealth can fill in by itself: the wealth
 * (patrimoine) tables, loans, and income / charges derived from the tracked
 * portfolio. Everything personal that the app does not store (civil status,
 * profession, tax figures, objectives…) is entered in the DCC dialog and is
 * NEVER persisted or sent anywhere: the PDF is generated in the browser.
 *
 * The section order follows the advisor DCC format: you & your spouse (civil
 * status, professional situation, relations), wealth (financial, real estate,
 * other) with the matching loans, income & charges, taxation, objectives,
 * additional information and signatures.
 */
import { canAmortize, getOutstandingPrincipalAt } from "@/lib/amortization";
import { parseCompanyMetadata } from "@/lib/companies";
import { parseAssuranceVieMetadata } from "@/lib/assurance-vie";
import { convertToBaseCurrency } from "@/lib/fx";
import { assetLiability, grossAssetValue } from "@/lib/liabilities";
import { parseLiabilityMetadata } from "@/lib/liability";
import { parseEquityMetadata } from "@/lib/equities";
import { parsePrivateEquityMetadata } from "@/lib/private-equity";
import {
  findActiveTenancyContract,
  parseRealEstateMetadata,
  resolveOutstandingLoanBalance,
} from "@/lib/real-estate";
import {
  parseScpiMetadata,
  scpiAverageYield,
  scpiInvested,
  scpiReceived,
} from "@/lib/scpi";
import type { TranslationKey } from "@/lib/i18n";

export type YesNo = "" | "yes" | "no";

export type DccPerson = {
  civility: string;
  fullName: string;
  birthDate: string;
  birthPlace: string;
  nationalities: string;
  legalCapacity: string;
  idType: string;
  idNumber: string;
  idExpiry: string;
  address: string;
  postalCity: string;
  country: string;
  mobile: string;
  phone: string;
  email: string;
  maritalStatus: string;
  marriageDate: string;
  marriagePlace: string;
  marriageRegime: string;
  pep: YesNo;
  profession: string;
  csp: string;
  seniority: string;
  employmentStatus: string;
  employer: string;
  retirementAge: string;
  taxedIncomeTax: YesNo;
  taxedWealthTax: YesNo;
  usPerson: YesNo;
  usCitizen: YesNo;
  usResident: YesNo;
  tin: string;
  knowledgeLevel: string;
  riskProfile: string;
};

export const EMPTY_DCC_PERSON: DccPerson = {
  civility: "",
  fullName: "",
  birthDate: "",
  birthPlace: "",
  nationalities: "",
  legalCapacity: "",
  idType: "",
  idNumber: "",
  idExpiry: "",
  address: "",
  postalCity: "",
  country: "",
  mobile: "",
  phone: "",
  email: "",
  maritalStatus: "",
  marriageDate: "",
  marriagePlace: "",
  marriageRegime: "",
  pep: "",
  profession: "",
  csp: "",
  seniority: "",
  employmentStatus: "",
  employer: "",
  retirementAge: "",
  taxedIncomeTax: "",
  taxedWealthTax: "",
  usPerson: "",
  usCitizen: "",
  usResident: "",
  tin: "",
  knowledgeLevel: "",
  riskProfile: "",
};

/** Text fields of a person, in display order, with the i18n label of each. */
export const DCC_PERSON_TEXT_FIELDS: { key: keyof DccPerson; label: TranslationKey; group: "civil" | "contact" | "family" | "work" | "investor" }[] = [
  { key: "civility", label: "dcc_civility", group: "civil" },
  { key: "fullName", label: "dcc_full_name", group: "civil" },
  { key: "birthDate", label: "dcc_birth_date", group: "civil" },
  { key: "birthPlace", label: "dcc_birth_place", group: "civil" },
  { key: "nationalities", label: "dcc_nationalities", group: "civil" },
  { key: "legalCapacity", label: "dcc_legal_capacity", group: "civil" },
  { key: "idType", label: "dcc_id_type", group: "civil" },
  { key: "idNumber", label: "dcc_id_number", group: "civil" },
  { key: "idExpiry", label: "dcc_id_expiry", group: "civil" },
  { key: "address", label: "dcc_address", group: "contact" },
  { key: "postalCity", label: "dcc_postal_city", group: "contact" },
  { key: "country", label: "dcc_country", group: "contact" },
  { key: "mobile", label: "dcc_mobile", group: "contact" },
  { key: "phone", label: "dcc_phone", group: "contact" },
  { key: "email", label: "dcc_email", group: "contact" },
  { key: "maritalStatus", label: "dcc_marital_status", group: "family" },
  { key: "marriageDate", label: "dcc_marriage_date", group: "family" },
  { key: "marriagePlace", label: "dcc_marriage_place", group: "family" },
  { key: "marriageRegime", label: "dcc_marriage_regime", group: "family" },
  { key: "profession", label: "dcc_profession", group: "work" },
  { key: "csp", label: "dcc_csp", group: "work" },
  { key: "seniority", label: "dcc_seniority", group: "work" },
  { key: "employmentStatus", label: "dcc_employment_status", group: "work" },
  { key: "employer", label: "dcc_employer", group: "work" },
  { key: "retirementAge", label: "dcc_retirement_age", group: "work" },
  { key: "tin", label: "dcc_tin", group: "work" },
  { key: "knowledgeLevel", label: "dcc_knowledge_level", group: "investor" },
  { key: "riskProfile", label: "dcc_risk_profile", group: "investor" },
];

/** Yes/No questions of a person (PEP, taxation, US status). */
export const DCC_PERSON_YESNO_FIELDS: { key: keyof DccPerson; label: TranslationKey }[] = [
  { key: "pep", label: "dcc_pep" },
  { key: "taxedIncomeTax", label: "dcc_taxed_income_tax" },
  { key: "taxedWealthTax", label: "dcc_taxed_wealth_tax" },
  { key: "usPerson", label: "dcc_us_person" },
  { key: "usCitizen", label: "dcc_us_citizen" },
  { key: "usResident", label: "dcc_us_resident" },
];

export type DccRelation = {
  name: string;
  relation: string;
  birthDate: string;
  phone: string;
  email: string;
};

export type DccAmountRow = { label: string; nature: string; amount: number; holder: string };

export type DccObjectiveKey =
  | "precaution"
  | "short_term"
  | "extra_income"
  | "build_wealth"
  | "optimize"
  | "life_annuity"
  | "luxembourg"
  | "reduce_wealth_tax"
  | "buy_property"
  | "help_children"
  | "mobility"
  | "life_accidents"
  | "protect_spouse"
  | "protect_family"
  | "retirement"
  | "transmission"
  | "business_transmission";

export const DCC_OBJECTIVES: { key: DccObjectiveKey; label: TranslationKey }[] = [
  { key: "precaution", label: "dcc_obj_precaution" },
  { key: "short_term", label: "dcc_obj_short_term" },
  { key: "extra_income", label: "dcc_obj_extra_income" },
  { key: "build_wealth", label: "dcc_obj_build_wealth" },
  { key: "optimize", label: "dcc_obj_optimize" },
  { key: "life_annuity", label: "dcc_obj_life_annuity" },
  { key: "luxembourg", label: "dcc_obj_luxembourg" },
  { key: "reduce_wealth_tax", label: "dcc_obj_reduce_wealth_tax" },
  { key: "buy_property", label: "dcc_obj_buy_property" },
  { key: "help_children", label: "dcc_obj_help_children" },
  { key: "mobility", label: "dcc_obj_mobility" },
  { key: "life_accidents", label: "dcc_obj_life_accidents" },
  { key: "protect_spouse", label: "dcc_obj_protect_spouse" },
  { key: "protect_family", label: "dcc_obj_protect_family" },
  { key: "retirement", label: "dcc_obj_retirement" },
  { key: "transmission", label: "dcc_obj_transmission" },
  { key: "business_transmission", label: "dcc_obj_business_transmission" },
];

/** Priority 1..n (blank = not selected) and horizon in years for an objective. */
export type DccObjective = { priority: string; horizon: string };

/** One line of the wealth tables, valued in the Base Currency. */
export type DccWealthRow = {
  designation: string;
  institution: string;
  /** Acquisition / subscription date. */
  date: string;
  purchaseValue: number | null;
  value: number;
  holdingMode: string;
};

export type DccLoanRow = {
  object: string;
  amount: number | null;
  durationMonths: number | null;
  rate: number | null;
  annuity: number | null;
  remaining: number;
  borrower: string;
};

export type DccPortfolio = {
  currency: string;
  financial: DccWealthRow[];
  realEstate: DccWealthRow[];
  other: DccWealthRow[];
  realEstateLoans: DccLoanRow[];
  otherLoans: DccLoanRow[];
  /** Income and charges derived from the tracked portfolio (rents, SCPI distributions, loan annuities). */
  derivedIncome: DccAmountRow[];
  derivedCharges: DccAmountRow[];
  netWorth: number;
};

export type DccData = {
  advisorName: string;
  advisorPhone: string;
  advisorEmail: string;
  advisorFirm: string;
  clientTitle: string;
  you: DccPerson;
  includeSpouse: boolean;
  spouse: DccPerson;
  relations: DccRelation[];
  extraIncome: DccAmountRow[];
  extraCharges: DccAmountRow[];
  objectives: Partial<Record<DccObjectiveKey, DccObjective>>;
  precautionAmount: string;
  /** IR / IFI figures, free text keyed by the field label. */
  taxIncome: Record<string, string>;
  taxWealth: Record<string, string>;
  taxYear: string;
  portfolio: DccPortfolio;
};

const FINANCIAL = new Set(["Equities", "Cash", "Crypto", "Precious Metals", "Private Equity", "Assurance-Vie"]);

export type DccAssetInput = {
  name: string;
  quantity: number;
  current_value: number;
  currency: string;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  purchase_date: string;
  asset_categories: { name: string } | null;
};

/**
 * Builds the wealth / loans / derived income-and-charges sections from the
 * tracked assets, all converted to the Base Currency. Real estate wealth
 * includes SCPI (as in the advisor document, where SCPI sit under "patrimoine
 * immobilier"); loans are split into property loans and other debts.
 */
export function buildDccPortfolio(
  assets: DccAssetInput[],
  baseCurrency: string,
  rates: Record<string, number>,
  today: string,
): DccPortfolio {
  const toBase = (n: number, currency: string) =>
    Math.round(convertToBaseCurrency(n, currency, baseCurrency, rates));
  const financial: DccWealthRow[] = [];
  const realEstate: DccWealthRow[] = [];
  const other: DccWealthRow[] = [];
  const realEstateLoans: DccLoanRow[] = [];
  const otherLoans: DccLoanRow[] = [];
  const derivedIncome: DccAmountRow[] = [];
  const derivedCharges: DccAmountRow[] = [];
  let netWorth = 0;

  for (const a of assets) {
    const category = a.asset_categories?.name ?? "";
    const owed = assetLiability(a);
    netWorth += toBase((a.is_liability ? 0 : grossAssetValue(a)) - owed, a.currency);

    if (a.is_liability) {
      const md = parseLiabilityMetadata(a.metadata);
      otherLoans.push({
        object: a.name,
        amount: null,
        durationMonths: null,
        rate: md.interest_rate,
        annuity: md.monthly_payment != null ? toBase(md.monthly_payment * 12, a.currency) : null,
        remaining: toBase(a.current_value, a.currency),
        borrower: md.lender_name,
      });
      if (md.monthly_payment) {
        derivedCharges.push({
          label: a.name,
          nature: "dcc_nature_loan_payments",
          amount: toBase(md.monthly_payment * 12, a.currency),
          holder: "",
        });
      }
      continue;
    }

    const value = toBase(grossAssetValue(a), a.currency);
    // Closed positions (fully sold holdings kept for history) have no wealth to declare.
    if (value <= 0 && category !== "Real Estate") continue;
    const row: DccWealthRow = {
      designation: a.name,
      institution: "",
      date: a.purchase_date,
      purchaseValue: null,
      value,
      holdingMode: "",
    };

    if (category === "Real Estate") {
      const md = parseRealEstateMetadata(a.metadata);
      row.purchaseValue = toBase(md.contract_price ?? md.purchasePrice ?? 0, a.currency) || null;
      row.holdingMode = "dcc_mode_full";
      realEstate.push(row);

      const loan = md.linked_loan;
      if (loan.amount || loan.outstanding_principal) {
        const remaining = canAmortize(loan)
          ? getOutstandingPrincipalAt(loan, today)
          : resolveOutstandingLoanBalance(loan);
        const annuity = loan.monthly_payment != null ? toBase(loan.monthly_payment * 12, a.currency) : null;
        realEstateLoans.push({
          object: `${a.name}${loan.lender_name ? ` — ${loan.lender_name}` : ""}`,
          amount: loan.amount != null ? toBase(loan.amount, a.currency) : null,
          durationMonths: loan.duration_months,
          rate: loan.interest_rate,
          annuity,
          remaining: toBase(remaining, a.currency),
          borrower: "",
        });
        if (annuity) {
          derivedCharges.push({ label: a.name, nature: "dcc_nature_property_loans", amount: annuity, holder: "" });
        }
      }
      if (md.is_offplan && md.outstanding_balance > 0) {
        otherLoans.push({
          object: `${a.name} (off-plan)`,
          amount: null,
          durationMonths: null,
          rate: null,
          annuity: null,
          remaining: toBase(md.outstanding_balance, a.currency),
          borrower: "",
        });
      }
      const contract = findActiveTenancyContract(md.tenancy_contracts, today);
      if (contract?.annual_rent) {
        derivedIncome.push({
          label: a.name,
          nature: "dcc_nature_rent",
          amount: toBase(contract.annual_rent, a.currency),
          holder: "",
        });
      }
    } else if (category === "SCPI") {
      const md = parseScpiMetadata(a.metadata);
      row.institution = md.management_company;
      row.purchaseValue = toBase(scpiInvested(md, a.quantity), a.currency) || null;
      row.holdingMode =
        md.holding_mode === "nue_propriete"
          ? "dcc_mode_bare"
          : md.holding_mode === "usufruit"
            ? "dcc_mode_usufruct"
            : "dcc_mode_full";
      realEstate.push(row);
      // Annual distribution: received over the last 12 months, else target / average rate × invested.
      const yearAgo = new Date(`${today}T00:00:00Z`);
      yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
      const received = scpiReceived(md, yearAgo.toISOString().slice(0, 10));
      const rate = md.target_yield_pct ?? scpiAverageYield(md);
      const annual = received > 0 ? received : rate ? (scpiInvested(md, a.quantity) * rate) / 100 : 0;
      if (annual > 0) {
        derivedIncome.push({
          label: a.name,
          nature: "dcc_nature_scpi",
          amount: toBase(annual, a.currency),
          holder: "",
        });
      }
    } else if (FINANCIAL.has(category)) {
      if (category === "Equities") {
        const md = parseEquityMetadata(a.metadata);
        row.institution = md.account_name ?? "";
      } else if (category === "Assurance-Vie") {
        row.institution = parseAssuranceVieMetadata(a.metadata).insurer;
      } else if (category === "Private Equity") {
        row.institution = parsePrivateEquityMetadata(a.metadata).manager;
        const pending = assetLiability(a);
        if (pending > 0) {
          otherLoans.push({
            object: `${a.name} (capital calls to come)`,
            amount: null,
            durationMonths: null,
            rate: null,
            annuity: null,
            remaining: toBase(pending, a.currency),
            borrower: "",
          });
        }
      }
      financial.push(row);
    } else {
      if (category === "Companies") {
        const md = parseCompanyMetadata(a.metadata);
        row.institution = md.jurisdiction;
      }
      other.push(row);
    }
  }

  const byValue = (x: DccWealthRow, y: DccWealthRow) => y.value - x.value;
  financial.sort(byValue);
  realEstate.sort(byValue);
  other.sort(byValue);

  return {
    currency: baseCurrency,
    financial,
    realEstate,
    other,
    realEstateLoans,
    otherLoans,
    derivedIncome,
    derivedCharges,
    netWorth,
  };
}

export function emptyDccData(portfolio: DccPortfolio): DccData {
  return {
    advisorName: "",
    advisorPhone: "",
    advisorEmail: "",
    advisorFirm: "",
    clientTitle: "",
    you: { ...EMPTY_DCC_PERSON },
    includeSpouse: false,
    spouse: { ...EMPTY_DCC_PERSON },
    relations: [],
    extraIncome: [],
    extraCharges: [],
    objectives: {},
    precautionAmount: "",
    taxIncome: {},
    taxWealth: {},
    taxYear: String(new Date().getFullYear() - 1),
    portfolio,
  };
}

/**
 * Starts from `base` (empty defaults + the profile prefill) and lays the saved
 * entries over it: a saved non-empty value wins, an empty/missing one leaves the
 * default. Unknown keys and the wealth tables are ignored, so an older or
 * hand-edited save can never break the dialog.
 */
export function mergeSavedDcc(base: DccData, saved: unknown): DccData {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return base;
  const s = saved as Record<string, unknown>;
  const text = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() !== "" ? v : fallback);
  const person = (basePerson: DccPerson, raw: unknown): DccPerson => {
    const out = { ...basePerson };
    if (raw && typeof raw === "object") {
      for (const key of Object.keys(basePerson) as (keyof DccPerson)[]) {
        const v = (raw as Record<string, unknown>)[key];
        if (typeof v === "string" && v.trim() !== "") (out as Record<string, string>)[key] = v;
      }
    }
    return out;
  };
  const strings = (raw: unknown): Record<string, string> =>
    raw && typeof raw === "object"
      ? Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")) as Record<string, string>
      : {};
  const list = <T,>(raw: unknown, fallback: T[]): T[] => (Array.isArray(raw) ? (raw as T[]) : fallback);

  return {
    ...base,
    advisorName: text(s.advisorName, base.advisorName),
    advisorPhone: text(s.advisorPhone, base.advisorPhone),
    advisorEmail: text(s.advisorEmail, base.advisorEmail),
    advisorFirm: text(s.advisorFirm, base.advisorFirm),
    clientTitle: text(s.clientTitle, base.clientTitle),
    you: person(base.you, s.you),
    includeSpouse: typeof s.includeSpouse === "boolean" ? s.includeSpouse : base.includeSpouse,
    spouse: person(base.spouse, s.spouse),
    relations: list(s.relations, base.relations),
    extraIncome: list(s.extraIncome, base.extraIncome),
    extraCharges: list(s.extraCharges, base.extraCharges),
    objectives:
      s.objectives && typeof s.objectives === "object" && !Array.isArray(s.objectives)
        ? (s.objectives as DccData["objectives"])
        : base.objectives,
    precautionAmount: text(s.precautionAmount, base.precautionAmount),
    taxIncome: { ...base.taxIncome, ...strings(s.taxIncome) },
    taxWealth: { ...base.taxWealth, ...strings(s.taxWealth) },
    taxYear: text(s.taxYear, base.taxYear),
  };
}

export const DCC_TAX_INCOME_FIELDS: TranslationKey[] = [
  "dcc_tax_salaries",
  "dcc_tax_pensions",
  "dcc_tax_bic",
  "dcc_tax_bnc",
  "dcc_tax_ba",
  "dcc_tax_investment_income",
  "dcc_tax_property_income",
  "dcc_tax_total_declared",
  "dcc_tax_gross_income",
  "dcc_tax_deductible",
  "dcc_tax_taxable",
  "dcc_tax_parts",
  "dcc_tax_tmi",
  "dcc_tax_credits",
  "dcc_tax_net",
  "dcc_tax_social",
];

export const DCC_TAX_WEALTH_FIELDS: TranslationKey[] = [
  "dcc_ifi_built",
  "dcc_ifi_unbuilt",
  "dcc_ifi_rights",
  "dcc_ifi_liabilities",
  "dcc_ifi_base",
  "dcc_ifi_tmi",
  "dcc_ifi_reductions",
  "dcc_ifi_net",
];
