export type Locale = "en" | "fr";

export const locales: Locale[] = ["en", "fr"];

const dictionary = {
  // Dashboard chrome
  welcome_back: { en: "Welcome back", fr: "Bon retour" },
  portfolio_heading: { en: "Portfolio", fr: "Portefeuille" },
  portfolio_subtitle: {
    en: "Every asset and liability you're tracking.",
    fr: "Chaque actif et passif que vous suivez.",
  },
  profile_settings: { en: "Profile Settings", fr: "Paramètres du profil" },
  sign_out: { en: "Sign Out", fr: "Déconnexion" },
  net_worth: { en: "Net Worth", fr: "Valeur nette" },
  total_assets: { en: "Total Assets", fr: "Total des actifs" },
  total_liabilities: { en: "Total Liabilities", fr: "Total des passifs" },
  real_estate_unrealized_gain: {
    en: "Real Estate Unrealized Gain",
    fr: "Plus-value latente immobilière",
  },

  // Asset detail — top card / navigation
  back_to_portfolio: { en: "Back to Portfolio", fr: "Retour au portefeuille" },
  net_equity: { en: "Net Equity", fr: "Capitaux propres nets" },
  value: { en: "Value", fr: "Valeur" },
  off_plan: { en: "Off-Plan", fr: "Sur plan" },
  refresh_valuation: { en: "Refresh Valuation", fr: "Actualiser la valorisation" },
  refresh_valuation_desc: {
    en: "Record a new market valuation. This updates the asset and adds a point to the history graph.",
    fr: "Enregistrez une nouvelle valorisation. Cela met à jour l'actif et ajoute un point au graphique historique.",
  },
  new_market_value: { en: "New Market Value", fr: "Nouvelle valeur de marché" },
  converted_note: {
    en: "Converted to the asset's currency ({currency}) before saving.",
    fr: "Converti dans la devise de l'actif ({currency}) avant l'enregistrement.",
  },
  source: { en: "Source", fr: "Source" },
  manual_entry: { en: "Manual Entry", fr: "Saisie manuelle" },
  no_live_integration_note: {
    en: "No live DARI or Dubai Land Department integration is configured yet — this just tags the source on a manually entered value.",
    fr: "Aucune intégration en direct avec DARI ou Dubai Land Department n'est encore configurée — cela ne fait qu'étiqueter la source d'une valeur saisie manuellement.",
  },
  save_valuation: { en: "Save Valuation", fr: "Enregistrer la valorisation" },
  saving: { en: "Saving…", fr: "Enregistrement…" },

  // Tabs
  tab_overview: { en: "Overview", fr: "Aperçu" },
  tab_analysis: { en: "Analysis", fr: "Analyse" },
  tab_settings: { en: "Settings", fr: "Paramètres" },

  // Overview tab
  valuation_history: { en: "Valuation History", fr: "Historique de valorisation" },
  no_valuation_history: {
    en: 'No valuation history yet — use "Refresh Valuation" above to record the first data point.',
    fr: "Aucun historique de valorisation pour l'instant — utilisez « Actualiser la valorisation » ci-dessus pour enregistrer le premier point.",
  },
  total_property_cost: { en: "Total Property Cost", fr: "Coût total du bien" },
  all_in_cost_basis: { en: "All-in cost basis", fr: "Coût total tout compris" },
  unrealized_gain: { en: "Unrealized Gain", fr: "Plus-value latente" },
  net_gain_vs_cost: { en: "Net gain vs. all-in cost", fr: "Gain net vs. coût total" },
  cash_invested_to_date: { en: "Cash Invested to Date", fr: "Trésorerie investie à ce jour" },
  paid_milestones_fees: { en: "Paid milestones + fees", fr: "Jalons payés + frais" },
  value_per_sqm: { en: "Value / m²", fr: "Valeur / m²" },
  net_roi: { en: "Net ROI", fr: "ROI net" },
  unrealized_gain_over_cost: {
    en: "Unrealized gain ÷ total cost",
    fr: "Plus-value latente ÷ coût total",
  },

  // Analysis tab
  analysis_unavailable: {
    en: "Detailed market analysis is available for Real Estate assets.",
    fr: "L'analyse de marché détaillée est disponible pour les actifs immobiliers.",
  },
  market_performance: { en: "Market Performance", fr: "Performance du marché" },
  price_per_sqm: { en: "Price / m²", fr: "Prix / m²" },
  estimated_market_value: { en: "Estimated Market Value", fr: "Valeur de marché estimée" },
  confidence_level: { en: "Confidence Level", fr: "Niveau de confiance" },
  confidence_high: { en: "High", fr: "Élevé" },
  confidence_manual: { en: "Manual", fr: "Manuel" },
  gross_share: { en: "Gross Share", fr: "Part brute" },
  ownership: { en: "Ownership", fr: "Propriété" },
  net_share: { en: "Net Share", fr: "Part nette" },
  net_equity_share: { en: "Net Equity Share ({percent})", fr: "Part de capitaux propres nets ({percent})" },
  active_loan_balance: { en: "Active Loan Balance", fr: "Solde de prêt actif" },
  add_loan: { en: "+ Add Loan", fr: "+ Ajouter un prêt" },
  payment_milestones: { en: "Payment Milestones", fr: "Jalons de paiement" },
  milestone: { en: "Milestone", fr: "Jalon" },
  due_date: { en: "Due Date", fr: "Date d'échéance" },
  amount: { en: "Amount", fr: "Montant" },
  status: { en: "Status", fr: "Statut" },
  paid: { en: "Paid", fr: "Payé" },
  pending: { en: "Pending", fr: "En attente" },
  no_payment_milestones: { en: "No payment milestones recorded.", fr: "Aucun jalon de paiement enregistré." },

  // Settings tab
  asset_settings: { en: "Asset Settings", fr: "Paramètres de l'actif" },
  core_property_details: { en: "Core Property Details", fr: "Détails principaux du bien" },
  address: { en: "Address", fr: "Adresse" },
  type: { en: "Type", fr: "Type" },
  internal_area: { en: "Internal Area", fr: "Surface intérieure" },
  terrace_area: { en: "Terrace Area", fr: "Surface de terrasse" },
  total_area: { en: "Total Area", fr: "Surface totale" },
  year_of_construction: { en: "Year of Construction", fr: "Année de construction" },
  epc_rating: { en: "EPC Rating", fr: "Classe énergétique (DPE)" },
  material_condition_ratings: {
    en: "Material & Condition Ratings",
    fr: "État des matériaux et finitions",
  },
  kitchen: { en: "Kitchen", fr: "Cuisine" },
  bathrooms: { en: "Bathrooms", fr: "Salles de bain" },
  flooring: { en: "Flooring", fr: "Revêtement de sol" },
  windows: { en: "Windows", fr: "Fenêtres" },
  general: { en: "General", fr: "Général" },
  cost_fees_basis: { en: "Cost & Fees Basis", fr: "Coûts et frais" },
  contract_price: { en: "Contract Price", fr: "Prix du contrat" },
  purchase_price: { en: "Purchase Price", fr: "Prix d'achat" },
  registration_fee: { en: "{type} Fee", fr: "Frais de {type}" },
  agency_fees: { en: "Agency Fees", fr: "Frais d'agence" },
  renovation_fees: { en: "Renovation Fees", fr: "Frais de rénovation" },
  furnishing_fees: { en: "Furnishing Fees", fr: "Frais d'ameublement" },
  financing: { en: "Financing", fr: "Financement" },
  principal: { en: "Principal", fr: "Capital emprunté" },
  interest_rate: { en: "Interest Rate", fr: "Taux d'intérêt" },
  duration: { en: "Duration", fr: "Durée" },
  duration_months: { en: "{n} months", fr: "{n} mois" },
  start_date: { en: "Start Date", fr: "Date de début" },
  no_loan_attached: { en: "No loan attached.", fr: "Aucun prêt associé." },

  // Vehicles category (Settings tab)
  vehicle_details: { en: "Vehicle Details", fr: "Détails du véhicule" },
  make: { en: "Make", fr: "Marque" },
  model: { en: "Model", fr: "Modèle" },
  vehicle_year: { en: "Year", fr: "Année" },
  vin: { en: "VIN", fr: "NIV" },

  // Vehicles category (Add/Edit form)
  vehicle_make_placeholder: { en: "e.g. Toyota", fr: "ex. Toyota" },
  vehicle_model_placeholder: { en: "e.g. Camry", fr: "ex. Camry" },
  vehicle_year_placeholder: { en: "e.g. 2022", fr: "ex. 2022" },
  vehicle_vin_placeholder: {
    en: "e.g. 1HGCM82633A004352",
    fr: "ex. 1HGCM82633A004352",
  },
  vehicle_make_required: { en: "Make is required.", fr: "La marque est requise." },
  vehicle_model_required: { en: "Model is required.", fr: "Le modèle est requis." },
  vehicle_year_required: { en: "Year is required.", fr: "L'année est requise." },
  vehicle_vin_required: { en: "VIN is required.", fr: "Le NIV est requis." },

  // Private Equity category (Settings tab)
  private_equity_details: { en: "Private Equity Details", fr: "Détails de capital-investissement" },
  entity_name: { en: "Entity Name", fr: "Nom de l'entité" },
  ownership_percentage: { en: "Ownership Percentage", fr: "Pourcentage de propriété" },
  share_class: { en: "Share Class", fr: "Catégorie d'actions" },

  // Private Equity category (Add/Edit form)
  entity_name_placeholder: { en: "e.g. Navtec Group", fr: "ex. Navtec Group" },
  share_class_placeholder: { en: "e.g. Series A", fr: "ex. Série A" },
  entity_name_required: { en: "Entity name is required.", fr: "Le nom de l'entité est requis." },
  share_class_required: { en: "Share class is required.", fr: "La catégorie d'actions est requise." },
  ownership_percentage_required: {
    en: "Ownership percentage is required.",
    fr: "Le pourcentage de propriété est requis.",
  },
  ownership_percentage_range: {
    en: "Ownership percentage must be between 0 and 100.",
    fr: "Le pourcentage de propriété doit être compris entre 0 et 100.",
  },
} as const;

export type TranslationKey = keyof typeof dictionary;

export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const entry = dictionary[key];
  let text: string = entry ? entry[locale] : key;
  if (vars) {
    for (const [name, val] of Object.entries(vars)) {
      text = text.replace(`{${name}}`, String(val));
    }
  }
  return text;
}
