export type Locale = "en" | "fr";

export const locales: Locale[] = ["en", "fr"];

const dictionary = {
  // Add/Edit Asset dialog
  purchase_date: { en: "Purchase Date", fr: "Date d'achat" },

  // Dashboard chrome
  welcome_back: { en: "Welcome back", fr: "Bon retour" },
  nav_dashboard: { en: "Dashboard", fr: "Tableau de bord" },
  portfolio_heading: { en: "Portfolio", fr: "Portefeuille" },
  portfolio_subtitle: {
    en: "Every asset and liability you're tracking.",
    fr: "Chaque actif et passif que vous suivez.",
  },

  // Portfolio grouping — category folder headers
  category_real_estate: { en: "Real Estate", fr: "Immobilier" },
  category_scpi: { en: "SCPI", fr: "SCPI" },
  category_equities: { en: "Brokerage Account", fr: "Comptes d'investissement" },
  category_crypto: { en: "Crypto", fr: "Cryptomonnaies" },
  category_cash: { en: "Cash", fr: "Liquidités" },
  category_liabilities: { en: "Liabilities", fr: "Passifs" },
  category_vehicles: { en: "Vehicles", fr: "Véhicules" },
  category_private_equity: { en: "Private Equity", fr: "Capital-investissement" },

  // Portfolio — batch delete (multi-select checkboxes)
  selected_count: { en: "{n} selected", fr: "{n} sélectionné(s)" },
  batch_delete: { en: "Delete Selected", fr: "Supprimer la sélection" },
  batch_delete_confirm_title: {
    en: "Delete {n} assets?",
    fr: "Supprimer {n} actifs ?",
  },
  batch_delete_confirm_desc: {
    en: "Are you sure you want to delete {n} assets? This action cannot be undone.",
    fr: "Voulez-vous vraiment supprimer {n} actifs ? Cette action est irréversible.",
  },
  batch_deleting: { en: "Deleting…", fr: "Suppression…" },
  cancel: { en: "Cancel", fr: "Annuler" },
  close: { en: "Close", fr: "Fermer" },
  menu: { en: "Menu", fr: "Menu" },
  delete: { en: "Delete", fr: "Supprimer" },
  profile_settings: { en: "Profile Settings", fr: "Paramètres du profil" },
  sign_out: { en: "Sign Out", fr: "Déconnexion" },
  breakdown_desc: {
    en: "Per-asset contribution, in {currency}.",
    fr: "Contribution de chaque actif, en {currency}.",
  },
  breakdown_empty: { en: "Nothing to break down yet.", fr: "Rien à détailler pour l'instant." },
  breakdown_click_hint: { en: "Click for a breakdown", fr: "Cliquez pour voir le détail" },
  breakdown_asset: { en: "Asset", fr: "Actif" },
  breakdown_category: { en: "Category", fr: "Catégorie" },
  breakdown_amount: { en: "Amount", fr: "Montant" },
  breakdown_market_value: { en: "Market Value", fr: "Valeur de marché" },
  breakdown_cost_basis: { en: "Total Cost", fr: "Coût total" },
  breakdown_gain: { en: "Unrealized Gain", fr: "Plus-value latente" },
  breakdown_total: { en: "Total", fr: "Total" },
  chart_view_history: { en: "Valuation History", fr: "Historique de valorisation" },
  chart_view_forward: { en: "Forward Looking", fr: "Projection" },
  chart_view_both: { en: "Both", fr: "Les deux" },
  total_return: { en: "Total Return", fr: "Rendement total" },
  projected_suffix: { en: "(projected)", fr: "(projeté)" },
  growth_assumption: { en: "Annual growth (%)", fr: "Croissance annuelle (%)" },
  growth_source_history: { en: "from valuation history", fr: "d'après l'historique" },
  growth_source_assumed: { en: "default assumption", fr: "hypothèse par défaut" },
  projection_note: {
    en: "20-year illustration, not a forecast: value grows {rate}% a year ({source}); the loan follows its schedule; rent continues at today's level less loan interest and average annual costs ({costs}/yr). Total Return = unrealized gain + cumulative net rent.",
    fr: "Illustration sur 20 ans, pas une prévision : la valeur croît de {rate} % par an ({source}) ; le prêt suit son échéancier ; le loyer reste au niveau actuel moins les intérêts du prêt et les coûts annuels moyens ({costs}/an). Rendement total = plus-value latente + loyers nets cumulés.",
  },
  net_rent_hint: {
    en: "Net rent = rent minus loan interest and logged expenses. Principal repayments aren't counted as a cost — they build equity.",
    fr: "Loyer net = loyer moins intérêts du prêt et dépenses enregistrées. Les remboursements de capital ne sont pas un coût : ils constituent du patrimoine.",
  },
  dld_certificate: { en: "Valuation Certificate", fr: "Certificat de valorisation" },
  dld_certificate_view: { en: "View Certificate", fr: "Voir le certificat" },
  dld_certificate_download: { en: "Download", fr: "Télécharger" },
  dld_certificate_how_title: { en: "How is this valuation calculated?", fr: "Comment cette valorisation est-elle calculée ?" },
  dld_certificate_how_live: {
    en: "In live mode the figure is returned by the Dubai Land Department's Smart Valuation service for this Title Deed Number and Plot ID.",
    fr: "En mode réel, le montant est fourni par le service Smart Valuation du Dubai Land Department pour ce numéro de titre et cet ID de parcelle.",
  },
  dld_certificate_how_mock: {
    en: "Sample mode is active (no DLD credentials are configured): the amount is a deterministic placeholder derived only from this property's Title Deed Number and Plot ID, between AED 800,000 and 2.8M. It is NOT a real appraisal — the same two identifiers always give the same reference and figure, so you can verify it reproduces.",
    fr: "Le mode exemple est actif (aucun identifiant DLD configuré) : le montant est une valeur fictive déterministe dérivée uniquement du numéro de titre et de l'ID de parcelle, entre 800 000 et 2,8 M AED. Ce n'est PAS une vraie expertise — les mêmes identifiants donnent toujours la même référence et le même montant, ce qui permet de le vérifier.",
  },
  dld_certificate_sample_badge: { en: "SAMPLE — not an official document", fr: "EXEMPLE — document non officiel" },
  dld_certificate_reference: { en: "Certificate reference", fr: "Référence du certificat" },
  dld_certificate_amount: { en: "Valuation", fr: "Valorisation" },
  dld_certificate_date: { en: "Valuation date", fr: "Date de valorisation" },
  dld_certificate_property: { en: "Property", fr: "Bien" },
  dld_certificate_deed: { en: "Title Deed Number", fr: "Numéro de titre" },
  dld_certificate_plot: { en: "Plot ID", fr: "ID de parcelle" },
  dld_certificate_missing_ids: {
    en: "Enter the Title Deed Number and Plot ID (Settings tab) to generate a certificate.",
    fr: "Saisissez le numéro de titre et l'ID de parcelle (onglet Paramètres) pour générer un certificat.",
  },
  import_property_document: { en: "Import Property Document", fr: "Importer un document du bien" },
  import_property_document_desc: {
    en: "Upload a UAE property PDF (Abu Dhabi SPA or title deed; Dubai title deed, Form F, Oqood or DLD receipt). The document type is detected automatically and you confirm what to apply.",
    fr: "Téléversez un PDF du bien aux EAU (SPA ou titre d'Abu Dhabi ; titre, Form F, Oqood ou reçu DLD de Dubaï). Le type est détecté automatiquement et vous confirmez ce qui est appliqué.",
  },
  property_document_cta: { en: "Drop a property document PDF here", fr: "Déposez un PDF du bien ici" },
  property_document_reading: { en: "Reading document…", fr: "Lecture du document…" },
  property_document_error_type: { en: "Please choose a PDF file.", fr: "Veuillez choisir un fichier PDF." },
  property_document_detected: { en: "Detected: {type}", fr: "Détecté : {type}" },
  property_document_overwrite: {
    en: "Overwrite fields that already have a value",
    fr: "Écraser les champs déjà renseignés",
  },
  property_document_apply: { en: "Apply to property", fr: "Appliquer au bien" },
  property_document_applying: { en: "Applying…", fr: "Application…" },
  property_document_applied: { en: "{n} fields updated.", fr: "{n} champs mis à jour." },
  property_document_nothing: {
    en: "Nothing to update — those fields already have values.",
    fr: "Rien à mettre à jour — ces champs sont déjà renseignés.",
  },
  property_document_type_abu_dhabi_offplan_spa: { en: "Abu Dhabi off-plan SPA", fr: "SPA sur plan (Abu Dhabi)" },
  property_document_type_abu_dhabi_title_deed: { en: "Abu Dhabi title deed", fr: "Titre de propriété (Abu Dhabi)" },
  property_document_type_dubai_title_deed: { en: "Dubai title deed", fr: "Titre de propriété (Dubaï)" },
  property_document_type_dubai_form_f: { en: "Dubai Form F (MOU)", fr: "Form F (MOU) de Dubaï" },
  property_document_type_dubai_oqood: { en: "Dubai Oqood (initial contract)", fr: "Oqood (contrat initial) de Dubaï" },
  property_document_type_dubai_dld_receipt: { en: "Dubai DLD receipt", fr: "Reçu DLD de Dubaï" },
  sample_valuation_not_saved: {
    en: "Sample data: {value} (certificate {ref}) is shown for preview only and was NOT saved.",
    fr: "Données d'exemple : {value} (certificat {ref}) affiché en aperçu uniquement et NON enregistré.",
  },
  sample_project_status_not_saved: {
    en: "Sample data: project {percent}% complete — shown for preview only and NOT saved.",
    fr: "Données d'exemple : projet terminé à {percent} % — aperçu uniquement, NON enregistré.",
  },
  net_worth: { en: "Net Worth", fr: "Valeur nette" },
  base_currency_note: {
    en: "All figures shown in {currency}",
    fr: "Tous les montants sont affichés en {currency}",
  },
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
  valuation_date: { en: "Valuation Date", fr: "Date de valorisation" },
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
  tab_settings: { en: "Specifications", fr: "Spécifications" },

  // Overview tab
  valuation_history: { en: "Valuation History", fr: "Historique de valorisation" },
  no_valuation_history: {
    en: 'No valuation history yet — use "Refresh Valuation" above to record the first data point.',
    fr: "Aucun historique de valorisation pour l'instant — utilisez « Actualiser la valorisation » ci-dessus pour enregistrer le premier point.",
  },
  valuation_log: { en: "Valuation Log", fr: "Journal de valorisation" },
  valuation_log_notice: {
    en: "Every recorded valuation point, oldest first. Remove a wrong or duplicate entry — this only affects the chart above, not the current headline value (use \"Refresh Valuation\" to correct that).",
    fr: "Chaque point de valorisation enregistré, du plus ancien au plus récent. Supprimez une entrée erronée ou en double — cela n'affecte que le graphique ci-dessus, pas la valeur affichée actuelle (utilisez « Actualiser la valorisation » pour la corriger).",
  },
  no_valuation_log_entries: {
    en: "No valuation points recorded yet.",
    fr: "Aucun point de valorisation enregistré pour l'instant.",
  },
  delete_valuation_point_title: {
    en: "Delete this valuation point?",
    fr: "Supprimer ce point de valorisation ?",
  },
  delete_valuation_point_desc: {
    en: "This removes the entry from the valuation log and chart. It cannot be undone.",
    fr: "Cette action supprime l'entrée du journal de valorisation et du graphique. Elle est irréversible.",
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
  transfer_trustee_fees: {
    en: "Transfer Trustee Fees",
    fr: "Frais de fiduciaire de transfert",
  },
  agent_sales_progression_fees: {
    en: "Agent Sales Progression Fees",
    fr: "Frais de suivi de vente de l'agent",
  },
  rera_title_deed_processing_fees: {
    en: "RERA Title Deed Processing Fees",
    fr: "Frais de traitement du titre de propriété RERA",
  },
  rera_mortgage_registration_fees: {
    en: "RERA Mortgage Registration Fees",
    fr: "Frais d'enregistrement hypothécaire RERA",
  },
  rera_knowledge_fee: { en: "RERA Knowledge Fee", fr: "Frais de connaissance RERA" },
  in_principle_bank_approval_fee: {
    en: "In-Principle Bank Approval Fee",
    fr: "Frais d'accord de principe bancaire",
  },
  property_valuation_fee: {
    en: "Property Valuation Fee",
    fr: "Frais d'évaluation du bien",
  },
  bank_processing_fees: { en: "Bank Processing Fees", fr: "Frais de traitement bancaire" },
  yearly_insurance_fee: {
    en: "Yearly Insurance (recurring)",
    fr: "Assurance annuelle (récurrente)",
  },
  financing: { en: "Financing", fr: "Financement" },
  principal: { en: "Principal", fr: "Capital emprunté" },
  interest_rate: { en: "Interest Rate", fr: "Taux d'intérêt" },
  duration: { en: "Duration", fr: "Durée" },
  duration_months: { en: "{n} months", fr: "{n} mois" },
  start_date: { en: "Start Date", fr: "Date de début" },
  no_loan_attached: { en: "No loan attached.", fr: "Aucun prêt associé." },
  loan_equity_note: {
    en: "The outstanding loan balance is subtracted from this property's Equity.",
    fr: "Le solde du prêt restant dû est déduit des capitaux propres de ce bien.",
  },
  rate_type: { en: "Rate Type", fr: "Type de taux" },
  rate_type_fixed: { en: "Fixed", fr: "Fixe" },
  rate_type_hybrid: { en: "Hybrid (fixed then variable)", fr: "Hybride (fixe puis variable)" },
  hybrid_rate_note: {
    en: "Typical UAE \"salary transfer\" mortgage structure: a fixed teaser rate for an initial period, then a variable rate tied to a reference index. If the salary transfer lapses, a higher fallback rate applies instead.",
    fr: "Structure de prêt « transfert de salaire » typique aux Émirats : un taux fixe initial, puis un taux variable indexé sur un taux de référence. Si le transfert de salaire cesse, un taux de repli plus élevé s'applique.",
  },
  fixed_period_months: { en: "Fixed Period (months)", fr: "Période fixe (mois)" },
  reference_rate: { en: "Reference Rate (e.g. 3M EIBOR) %", fr: "Taux de référence (ex. EIBOR 3M) %" },
  variable_margin: { en: "Variable Margin %", fr: "Marge variable %" },
  floor_rate: { en: "Floor Rate %", fr: "Taux plancher %" },
  fallback_rate: { en: "Fallback Rate %", fr: "Taux de repli %" },
  salary_transfer_active: { en: "Salary Transfer Active", fr: "Transfert de salaire actif" },
  principal_paid: { en: "Principal Paid", fr: "Capital remboursé" },
  interest_paid: { en: "Interest Paid", fr: "Intérêts payés" },
  loan_percent_paid: { en: "Loan Paid Off", fr: "Prêt remboursé" },
  show_amortization_schedule: { en: "Show Amortization Schedule", fr: "Afficher l'échéancier" },
  hide_amortization_schedule: { en: "Hide Amortization Schedule", fr: "Masquer l'échéancier" },
  payment_number: { en: "#", fr: "N°" },
  emirate: { en: "Emirate", fr: "Émirat" },
  emirate_dubai: { en: "Dubai", fr: "Dubaï" },
  emirate_abu_dhabi: { en: "Abu Dhabi", fr: "Abou Dabi" },
  equity: { en: "Equity", fr: "Capitaux propres" },
  tab_tenancy: { en: "Tenancy", fr: "Location" },
  tenancy: { en: "Tenancy", fr: "Location" },
  tenancy_contracts: { en: "Tenancy Contracts", fr: "Contrats de location" },
  no_tenancy_contracts: {
    en: "No tenancy contracts yet — import an Ejari or Tawtheeq contract PDF below.",
    fr: "Aucun contrat de location pour l'instant — importez un contrat Ejari ou Tawtheeq au format PDF ci-dessous.",
  },
  tenancy_period_unknown: { en: "Unknown period", fr: "Période inconnue" },
  delete_tenancy_contract_title: {
    en: "Delete this tenancy contract?",
    fr: "Supprimer ce contrat de location ?",
  },
  delete_tenancy_contract_desc: {
    en: "This removes this tenancy period from the property's records. This action cannot be undone.",
    fr: "Cela supprime cette période de location des données du bien. Cette action est irréversible.",
  },
  tenant_name: { en: "Tenant Name", fr: "Nom du locataire" },
  tenancy_start_date: { en: "Tenancy Start Date", fr: "Date de début de location" },
  tenancy_end_date: { en: "Tenancy End Date", fr: "Date de fin de location" },
  annual_rent: { en: "Annual Rent", fr: "Loyer annuel" },
  tenancy_contract_value: { en: "Contract Value", fr: "Valeur du contrat" },
  property_expenses: { en: "Property Expenses", fr: "Charges du bien" },
  no_property_expenses: { en: "No property expenses logged yet.", fr: "Aucune charge enregistrée pour l'instant." },
  description: { en: "Description", fr: "Description" },
  date: { en: "Date", fr: "Date" },
  total_property_expenses: { en: "Total logged expenses", fr: "Total des charges enregistrées" },
  property_expense_description_placeholder: {
    en: "e.g. AC servicing",
    fr: "ex. Entretien climatisation",
  },
  add_property_expense: { en: "Add Expense", fr: "Ajouter une charge" },
  property_expense_invalid: {
    en: "Enter a description, date, and a valid amount.",
    fr: "Saisissez une description, une date et un montant valide.",
  },
  import_tenancy_contract: { en: "Import Tenancy Contract", fr: "Importer un contrat de location" },
  import_tenancy_contract_desc: {
    en: "Upload an Ejari or Tawtheeq contract PDF to auto-fill the tenancy fields above.",
    fr: "Importez un contrat Ejari ou Tawtheeq au format PDF pour remplir automatiquement les champs de location ci-dessus.",
  },
  tenancy_dropzone_cta: { en: "Drop a contract PDF here, or click to browse", fr: "Déposez un contrat PDF ici, ou cliquez pour parcourir" },
  tenancy_dropzone_subtext: { en: "Ejari (Dubai) or Tawtheeq (Abu Dhabi)", fr: "Ejari (Dubaï) ou Tawtheeq (Abou Dabi)" },
  tenancy_dropzone_pending: { en: "Reading contract…", fr: "Lecture du contrat…" },
  tenancy_dropzone_error_type: { en: "Please upload a PDF file.", fr: "Veuillez importer un fichier PDF." },
  tenancy_import_success: {
    en: "Found {n} field(s) and saved them to this property.",
    fr: "{n} champ(s) trouvé(s) et enregistré(s) sur ce bien.",
  },
  rental_yield: { en: "Rental Yield", fr: "Rendement locatif" },
  monthly_gross_rent: { en: "Monthly Gross Rent", fr: "Loyer brut mensuel" },
  monthly_net_rent: { en: "Monthly Net Rent", fr: "Loyer net mensuel" },
  net_profit_with_rent: { en: "Net Profit (incl. rental income)", fr: "Bénéfice net (loyers inclus)" },
  property_irr: { en: "Property IRR", fr: "TRI du bien" },
  dld_identifiers: {
    en: "Dubai Land Department / RERA Identifiers",
    fr: "Identifiants Dubai Land Department / RERA",
  },
  dld_project_status: { en: "Project Status", fr: "Statut du projet" },
  dld_identifiers_note: {
    en: "Used to look up this property with the Dubai Land Department for automatic valuations.",
    fr: "Utilisés pour identifier ce bien auprès du Dubai Land Department afin d'obtenir des valorisations automatiques.",
  },
  title_deed_number: { en: "Title Deed Number", fr: "Numéro de titre de propriété" },
  plot_id: { en: "Municipality Plot ID / Area ID", fr: "ID de parcelle / de zone" },
  oqood_number: { en: "Oqood Contract Number", fr: "Numéro de contrat Oqood" },
  project_number: { en: "Project Number", fr: "Numéro de projet" },
  escrow_id: { en: "Escrow ID", fr: "ID du compte séquestre" },
  community_id: { en: "Area / Community ID", fr: "ID de zone / communauté" },
  refresh_from_dld: {
    en: "Refresh from Dubai Land Department",
    fr: "Actualiser via le Dubai Land Department",
  },
  refresh_from_dld_notice: {
    en: "Fetches an automatic valuation (ready-built) or project status (off-plan) from the Dubai Land Department using the identifiers entered above.",
    fr: "Récupère une valorisation automatique (bien livré) ou le statut du projet (sur plan) auprès du Dubai Land Department à partir des identifiants saisis ci-dessus.",
  },
  dld_fetching: { en: "Fetching…", fr: "Récupération…" },
  dld_valuation_updated: {
    en: "Valuation updated to {value} (certificate {ref}).",
    fr: "Valorisation mise à jour à {value} (certificat {ref}).",
  },
  dld_project_status_updated: {
    en: "Project status updated — {percent}% complete.",
    fr: "Statut du projet mis à jour — {percent} % terminé.",
  },
  dld_error_invalid_request: {
    en: "Enter the required identifiers above before refreshing.",
    fr: "Saisissez les identifiants requis ci-dessus avant d'actualiser.",
  },
  dld_error_invalid_deed_number: {
    en: "That Title Deed Number could not be found.",
    fr: "Ce numéro de titre de propriété est introuvable.",
  },
  dld_error_invalid_project_number: {
    en: "That Project Number could not be found.",
    fr: "Ce numéro de projet est introuvable.",
  },
  dld_error_inactive_project: {
    en: "This project is no longer active with the Dubai Land Department.",
    fr: "Ce projet n'est plus actif auprès du Dubai Land Department.",
  },
  dld_error_not_found: {
    en: "No matching property was found.",
    fr: "Aucun bien correspondant n'a été trouvé.",
  },
  dld_error_rate_limited: {
    en: "Too many requests — try again shortly.",
    fr: "Trop de requêtes — réessayez dans un instant.",
  },
  dld_error_provider_not_configured: {
    en: "The Dubai Land Department integration is not configured yet.",
    fr: "L'intégration avec le Dubai Land Department n'est pas encore configurée.",
  },
  dld_error_invalid_response: {
    en: "Received an unexpected response from the Dubai Land Department.",
    fr: "Réponse inattendue reçue du Dubai Land Department.",
  },
  dld_error_timeout: {
    en: "The request to the Dubai Land Department timed out.",
    fr: "La requête vers le Dubai Land Department a expiré.",
  },
  dld_error_network_error: {
    en: "Could not reach the Dubai Land Department.",
    fr: "Impossible de contacter le Dubai Land Department.",
  },
  completion_percentage: { en: "Completion", fr: "Avancement" },
  escrow_balance_status: { en: "Escrow Balance Status", fr: "Statut du compte séquestre" },
  latest_inspection_date: { en: "Latest Inspection Date", fr: "Date de dernière inspection" },
  adrec_identifiers: {
    en: "ADREC / DARI Identifiers",
    fr: "Identifiants ADREC / DARI",
  },
  adrec_identifiers_note: {
    en: "Used to look up this property with the Abu Dhabi Real Estate Centre for automatic valuations.",
    fr: "Utilisés pour identifier ce bien auprès de l'Abu Dhabi Real Estate Centre afin d'obtenir des valorisations automatiques.",
  },
  adrec_plot_number: { en: "Plot Number", fr: "Numéro de parcelle" },
  adrec_unit_id: { en: "Unit ID", fr: "ID de l'unité" },
  adrec_title_deed: { en: "Title Deed Number", fr: "Numéro de titre de propriété" },
  adrec_project_id: { en: "Project ID", fr: "ID du projet" },
  adrec_developer_id: { en: "Developer ID", fr: "ID du promoteur" },
  refresh_from_adrec: {
    en: "Refresh from ADREC / DARI",
    fr: "Actualiser via ADREC / DARI",
  },
  refresh_from_adrec_notice: {
    en: "Fetches an official valuation (ready-built) or project tracking status (off-plan) from the Abu Dhabi Real Estate Centre using the identifiers entered above.",
    fr: "Récupère une valorisation officielle (bien livré) ou le statut de suivi du projet (sur plan) auprès de l'Abu Dhabi Real Estate Centre à partir des identifiants saisis ci-dessus.",
  },
  adrec_fetching: { en: "Fetching…", fr: "Récupération…" },
  adrec_valuation_updated: {
    en: "Valuation updated to {value} (certificate {ref}).",
    fr: "Valorisation mise à jour à {value} (certificat {ref}).",
  },
  adrec_project_status_updated: {
    en: "Project status updated — {percent}% complete.",
    fr: "Statut du projet mis à jour — {percent} % terminé.",
  },
  adrec_live_valuation: { en: "Live ADREC Valuation", fr: "Valorisation ADREC en direct" },
  adrec_live_valuation_fetch: { en: "Check Live Valuation", fr: "Vérifier la valorisation" },
  adrec_live_valuation_meta: {
    en: "As of {date} · certificate {ref}",
    fr: "Au {date} · certificat {ref}",
  },
  adrec_live_valuation_mock: { en: "sample data", fr: "données d'exemple" },
  adrec_live_valuation_note: {
    en: "Display only — does not change the saved valuation. Use Refresh from ADREC / DARI to save it.",
    fr: "Affichage uniquement — ne modifie pas la valorisation enregistrée. Utilisez Actualiser via ADREC / DARI pour l'enregistrer.",
  },
  adrec_project_status: { en: "Project Status", fr: "Statut du projet" },
  adrec_construction_stage: { en: "Construction Stage", fr: "Étape de construction" },
  adrec_error_invalid_request: {
    en: "Enter the required identifiers above before refreshing.",
    fr: "Saisissez les identifiants requis ci-dessus avant d'actualiser.",
  },
  adrec_error_invalid_plot_number: {
    en: "That Plot Number could not be found.",
    fr: "Ce numéro de parcelle est introuvable.",
  },
  adrec_error_invalid_title_deed: {
    en: "That Title Deed Number could not be found.",
    fr: "Ce numéro de titre de propriété est introuvable.",
  },
  adrec_error_project_not_found: {
    en: "That Project ID could not be found.",
    fr: "Cet ID de projet est introuvable.",
  },
  adrec_error_developer_blocked: {
    en: "This developer is currently blocked by the Abu Dhabi Real Estate Centre.",
    fr: "Ce promoteur est actuellement bloqué par l'Abu Dhabi Real Estate Centre.",
  },
  adrec_error_not_found: {
    en: "No matching property was found.",
    fr: "Aucun bien correspondant n'a été trouvé.",
  },
  adrec_error_rate_limited: {
    en: "Too many requests — try again shortly.",
    fr: "Trop de requêtes — réessayez dans un instant.",
  },
  adrec_error_provider_not_configured: {
    en: "The ADREC/DARI integration is not configured yet.",
    fr: "L'intégration avec ADREC/DARI n'est pas encore configurée.",
  },
  adrec_error_invalid_response: {
    en: "Received an unexpected response from ADREC/DARI.",
    fr: "Réponse inattendue reçue d'ADREC/DARI.",
  },
  adrec_error_timeout: {
    en: "The request to ADREC/DARI timed out.",
    fr: "La requête vers ADREC/DARI a expiré.",
  },
  adrec_error_network_error: {
    en: "Could not reach ADREC/DARI.",
    fr: "Impossible de contacter ADREC/DARI.",
  },
  lender_name: { en: "Lender / Bank Name", fr: "Prêteur / Nom de la banque" },
  outstanding_loan_balance: {
    en: "Outstanding Loan Balance",
    fr: "Solde restant dû",
  },
  monthly_payment: { en: "Monthly Payment", fr: "Mensualité" },
  duration_months_field_label: {
    en: "Duration (months)",
    fr: "Durée (mois)",
  },
  interest_rate_percent_field_label: {
    en: "Interest Rate (%)",
    fr: "Taux d'intérêt (%)",
  },

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

  // Vehicles — Total Cost of Ownership, mileage, French valuation client
  license_plate: { en: "License Plate", fr: "Plaque d'immatriculation" },
  license_plate_placeholder: { en: "e.g. AB-123-CD", fr: "ex. AB-123-CD" },
  mileage: { en: "Mileage", fr: "Kilométrage" },
  maintenance_costs: { en: "Maintenance Costs", fr: "Frais d'entretien" },
  modifications: { en: "Modifications", fr: "Modifications" },
  insurance_registration: {
    en: "Insurance / Registration",
    fr: "Assurance / Immatriculation",
  },
  total_cost_of_ownership: {
    en: "Total Cost of Ownership",
    fr: "Coût total de possession",
  },
  depreciation_vs_purchase: {
    en: "Depreciation vs. Purchase Price",
    fr: "Dépréciation vs. prix d'achat",
  },
  last_valuation: { en: "Last Valuation", fr: "Dernière valorisation" },
  provider_la_centrale: { en: "La Centrale", fr: "La Centrale" },
  provider_autobiz: { en: "Autobiz", fr: "Autobiz" },
  refresh_vehicle_valuation: {
    en: "Refresh Market Value",
    fr: "Actualiser la valeur de marché",
  },
  refresh_vehicle_valuation_notice: {
    en: "Fetches a market valuation from a French vehicle valuation provider using the License Plate/VIN and Mileage entered above.",
    fr: "Récupère une valorisation de marché auprès d'un fournisseur français à partir de la plaque/du NIV et du kilométrage saisis ci-dessus.",
  },
  vehicle_valuation_updated: {
    en: "Valuation updated to {value} ({provider}).",
    fr: "Valorisation mise à jour à {value} ({provider}).",
  },
  vehicle_valuation_error_invalid_request: {
    en: "Enter a License Plate or VIN, and a mileage, before refreshing.",
    fr: "Saisissez une plaque d'immatriculation ou un NIV, ainsi qu'un kilométrage, avant d'actualiser.",
  },
  vehicle_valuation_error_not_found: {
    en: "No matching vehicle was found.",
    fr: "Aucun véhicule correspondant n'a été trouvé.",
  },
  vehicle_valuation_error_rate_limited: {
    en: "Too many requests — try again shortly.",
    fr: "Trop de requêtes — réessayez dans un instant.",
  },
  vehicle_valuation_error_provider_not_configured: {
    en: "The vehicle valuation integration is not configured yet.",
    fr: "L'intégration de valorisation de véhicules n'est pas encore configurée.",
  },
  vehicle_valuation_error_invalid_response: {
    en: "Received an unexpected response from the valuation provider.",
    fr: "Réponse inattendue reçue du fournisseur de valorisation.",
  },
  vehicle_valuation_error_timeout: {
    en: "The valuation request timed out.",
    fr: "La demande de valorisation a expiré.",
  },
  vehicle_valuation_error_network_error: {
    en: "Could not reach the vehicle valuation provider.",
    fr: "Impossible de contacter le fournisseur de valorisation.",
  },
  vehicle_valuation_under_development: {
    en: "Vehicle market value refresh is under development — no data was changed.",
    fr: "L'actualisation de la valeur de marché des véhicules est en cours de développement — aucune donnée n'a été modifiée.",
  },

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

  // CSV Bank Uploads (Settings tab)
  import_bank_history: { en: "Import Bank History (CSV)", fr: "Importer l'historique bancaire (CSV)" },
  import_bank_history_desc: {
    en: "Upload a bank-exported CSV with a running balance column to fill in this asset's valuation history.",
    fr: "Importez un CSV exporté par votre banque avec une colonne de solde courant pour compléter l'historique de valorisation de cet actif.",
  },
  csv_dropzone_cta: { en: "Drop your CSV file here", fr: "Déposez votre fichier CSV ici" },
  csv_dropzone_subtext: { en: "or click to browse — .csv only", fr: "ou cliquez pour parcourir — .csv uniquement" },
  csv_dropzone_error_type: {
    en: "Only .csv files are accepted.",
    fr: "Seuls les fichiers .csv sont acceptés.",
  },
  csv_dropzone_error_empty: {
    en: "This CSV file has no data rows.",
    fr: "Ce fichier CSV ne contient aucune ligne de données.",
  },
  csv_selected_file: { en: "Selected file", fr: "Fichier sélectionné" },
  csv_choose_different_file: { en: "Choose a different file", fr: "Choisir un autre fichier" },
  csv_map_columns: { en: "Map Your Columns", fr: "Associer vos colonnes" },
  csv_map_columns_desc: {
    en: "Tell us which column holds the date and which holds the account balance.",
    fr: "Indiquez quelle colonne contient la date et laquelle contient le solde du compte.",
  },
  csv_date_column: { en: "Date Column", fr: "Colonne de date" },
  csv_balance_column: { en: "Balance Column", fr: "Colonne de solde" },
  csv_mode_balance: {
    en: "File includes a running balance column",
    fr: "Le fichier contient une colonne de solde courant",
  },
  csv_mode_transactions: {
    en: "Calculate balance from transaction amounts",
    fr: "Calculer le solde à partir des montants des transactions",
  },
  csv_map_columns_desc_transactions: {
    en: "Tell us which column holds the date and which holds the transaction amount(s).",
    fr: "Indiquez quelle colonne contient la date et laquelle contient le(s) montant(s) des transactions.",
  },
  csv_amount_mode_single: { en: "Single Amount Column", fr: "Colonne de montant unique" },
  csv_amount_mode_credit_debit: {
    en: "Separate Credit/Debit Columns",
    fr: "Colonnes crédit/débit séparées",
  },
  csv_amount_column: { en: "Amount Column", fr: "Colonne de montant" },
  csv_credit_column: { en: "Credit Column", fr: "Colonne de crédit" },
  csv_debit_column: { en: "Debit Column", fr: "Colonne de débit" },
  csv_starting_balance: { en: "Starting Balance", fr: "Solde de départ" },
  csv_starting_balance_hint: {
    en: "The balance immediately before the earliest transaction in this file. Defaults to your current balance ({value}) minus these transactions, so the last computed balance matches today's value — adjust if this file isn't your most recent activity.",
    fr: "Le solde juste avant la première transaction de ce fichier. Par défaut, votre solde actuel ({value}) moins ces transactions, afin que le dernier solde calculé corresponde à la valeur actuelle — ajustez si ce fichier ne représente pas votre activité la plus récente.",
  },
  csv_date_format: { en: "Date Format", fr: "Format de date" },
  csv_select_column: { en: "Select a column…", fr: "Sélectionner une colonne…" },
  csv_preview_rows: { en: "{n} rows detected", fr: "{n} lignes détectées" },
  csv_row_errors: { en: "{n} rows could not be read and will be skipped", fr: "{n} lignes n'ont pas pu être lues et seront ignorées" },
  csv_no_valid_rows: {
    en: "No valid rows found with this column mapping — check your selections.",
    fr: "Aucune ligne valide trouvée avec cette association de colonnes — vérifiez vos sélections.",
  },
  csv_import_button: { en: "Import {n} Rows", fr: "Importer {n} lignes" },
  csv_importing: { en: "Importing…", fr: "Importation…" },
  csv_import_success: { en: "Imported {n} rows successfully.", fr: "{n} lignes importées avec succès." },
  csv_cancel: { en: "Cancel", fr: "Annuler" },
  csv_done: { en: "Done", fr: "Terminé" },
  csv_dropzone_error_read: {
    en: "Could not read this file.",
    fr: "Impossible de lire ce fichier.",
  },
  csv_parsing: { en: "Reading file…", fr: "Lecture du fichier…" },
  csv_description_column: { en: "Description Column", fr: "Colonne de description" },
  csv_column_none: { en: "None", fr: "Aucune" },
  csv_preview_title: { en: "Data Preview", fr: "Aperçu des données" },

  // Broker Trade Import (Phase 2) — Add Investments dialog
  add_investments: { en: "Add Investments", fr: "Ajouter des investissements" },
  add_investments_desc: {
    en: "Import trades from a broker export, a spreadsheet, or add one by hand.",
    fr: "Importez des transactions depuis un export de courtier, un tableur, ou ajoutez-en une manuellement.",
  },
  method_upload_broker: { en: "Upload via broker", fr: "Importer via un courtier" },
  method_upload_broker_desc: {
    en: "Pick your broker and drop its trade export.",
    fr: "Choisissez votre courtier et déposez son export de transactions.",
  },
  method_upload_file: { en: "Upload via file", fr: "Importer via un fichier" },
  method_upload_file_desc: {
    en: "Any CSV or Excel file — you map the columns yourself.",
    fr: "N'importe quel fichier CSV ou Excel — vous associez vous-même les colonnes.",
  },
  method_manual_trade: { en: "Individually add trade", fr: "Ajouter une transaction" },
  method_manual_trade_desc: {
    en: "Enter one buy or sell by hand.",
    fr: "Saisissez un achat ou une vente manuellement.",
  },
  back: { en: "Back", fr: "Retour" },
  investments_dropzone_cta: { en: "Drop your file here", fr: "Déposez votre fichier ici" },
  investments_dropzone_error_type: {
    en: "This file type isn't accepted for this broker.",
    fr: "Ce type de fichier n'est pas accepté pour ce courtier.",
  },
  investments_dropzone_error_csv_only: {
    en: "Only .csv and .xlsx files are accepted here.",
    fr: "Seuls les fichiers .csv et .xlsx sont acceptés ici.",
  },
  investments_manual_instrument_name: { en: "Instrument Name", fr: "Nom de l'instrument" },
  investments_manual_invalid_quantity: {
    en: "Enter a valid quantity.",
    fr: "Saisissez une quantité valide.",
  },
  investments_manual_invalid_price: {
    en: "Enter a valid price.",
    fr: "Saisissez un prix valide.",
  },
  investments_add_trade: { en: "Add Trade", fr: "Ajouter la transaction" },
  investments_no_trades_found: {
    en: "No valid trades were found in this file.",
    fr: "Aucune transaction valide n'a été trouvée dans ce fichier.",
  },
  investments_skipped_non_trade_rows: {
    en: "{n} watchlist/unconfirmed row(s) were skipped — only executed trades are imported.",
    fr: "{n} ligne(s) de watchlist/non confirmée(s) ont été ignorées — seules les transactions exécutées sont importées.",
  },
  investments_import_button: { en: "Import {n} Holdings", fr: "Importer {n} positions" },
  investments_importing: { en: "Importing…", fr: "Importation…" },
  investments_result_status: { en: "Result", fr: "Résultat" },
  investments_unpriced: {
    en: "valued at cost — live price unavailable",
    fr: "valorisé au coût — cours en direct indisponible",
  },
  brokerage_holding: { en: "Holding", fr: "Position" },
  brokerage_price: { en: "Price", fr: "Cours" },
  brokerage_quantity: { en: "Quantity", fr: "Quantité" },
  brokerage_value: { en: "Value", fr: "Valeur" },
  brokerage_capital_gain: { en: "Capital Gain", fr: "Plus-value" },
  brokerage_income: { en: "Income", fr: "Revenus" },
  brokerage_currency: { en: "Currency", fr: "Devise" },
  brokerage_return: { en: "Return", fr: "Rendement" },
  brokerage_opened: { en: "opened", fr: "ouverte le" },
  select_all: { en: "Select all", fr: "Tout sélectionner" },
  brokerage_refresh_prices: { en: "Refresh prices", fr: "Actualiser les cours" },
  brokerage_refreshing: { en: "Refreshing…", fr: "Actualisation…" },
  brokerage_refresh_done: {
    en: "{updated} updated, {failed} failed.",
    fr: "{updated} actualisée(s), {failed} en échec.",
  },
  brokerage_table_note: {
    en: "Holdings grouped by exchange, in each holding's own currency; subtotals in {currency}.",
    fr: "Positions regroupées par place de cotation, dans leur devise ; sous-totaux en {currency}.",
  },
  investments_result_created: { en: "New asset created", fr: "Nouvel actif créé" },
  investments_result_updated: { en: "Existing asset updated", fr: "Actif existant mis à jour" },
  investments_result_unchanged: { en: "Already up to date", fr: "Déjà à jour" },
  investments_result_error: { en: "Failed", fr: "Échec" },
  holding_ticker: { en: "Ticker", fr: "Symbole" },
  holding_instrument: { en: "Instrument", fr: "Instrument" },
  holding_net_quantity: { en: "Net Quantity", fr: "Quantité nette" },
  holding_trades_count: { en: "Trades", fr: "Transactions" },
  holding_currency: { en: "Currency", fr: "Devise" },
  investments_review_heading: { en: "Review accepted trades", fr: "Vérifiez les transactions acceptées" },
  investments_review_desc: {
    en: "Review the trades below and adjust any column before importing.",
    fr: "Vérifiez les transactions ci-dessous et ajustez les colonnes si besoin avant l'importation.",
  },
  investments_trades_selected: { en: "{selected} / {total} trades selected", fr: "{selected} / {total} transactions sélectionnées" },
  investments_delete_selected: { en: "Delete", fr: "Supprimer" },
  trade_instrument: { en: "Instrument", fr: "Instrument" },
  trade_date: { en: "Date", fr: "Date" },
  trade_type: { en: "Type", fr: "Type" },
  trade_quantity: { en: "Quantity", fr: "Quantité" },
  trade_price: { en: "Price", fr: "Prix" },
  trade_exchange_rate: { en: "Exchange Rate", fr: "Taux de change" },
  trade_brokerage: { en: "Brokerage", fr: "Courtage" },
  column_ticker: { en: "Ticker Column", fr: "Colonne du symbole" },
  column_side: { en: "Buy/Sell Column", fr: "Colonne achat/vente" },
  column_quantity: { en: "Quantity Column", fr: "Colonne de quantité" },
  column_price: { en: "Price Column", fr: "Colonne de prix" },
  column_date: { en: "Date Column", fr: "Colonne de date" },
  column_currency: { en: "Currency", fr: "Devise" },
  side_buy: { en: "Buy", fr: "Achat" },
  side_sell: { en: "Sell", fr: "Vente" },
  investments_manual_side: { en: "Buy/Sell", fr: "Achat/Vente" },
  investments_manual_date: { en: "Trade Date", fr: "Date de la transaction" },
  investments_manual_quantity: { en: "Quantity", fr: "Quantité" },
  investments_manual_price: { en: "Price", fr: "Prix" },

  // Portfolio Performance — total net worth chart with category filters
  portfolio_performance_title: { en: "Portfolio Performance", fr: "Performance du portefeuille" },
  portfolio_performance_empty: {
    en: "No valuation history yet — refresh a valuation or import trades to see this chart fill in.",
    fr: "Aucun historique de valorisation pour l'instant — actualisez une valorisation ou importez des transactions pour voir ce graphique se remplir.",
  },
  portfolio_performance_filter_all: { en: "All", fr: "Tout" },

  // Live Pricing — Equities & Crypto (Phase 1 Step 9, second half)
  ticker_symbol: { en: "Ticker Symbol", fr: "Symbole boursier" },
  ticker_symbol_required: { en: "A ticker symbol is required.", fr: "Un symbole boursier est requis." },
  ticker_symbol_equity_placeholder: { en: "e.g. AAPL", fr: "ex. AAPL" },
  ticker_symbol_crypto_placeholder: { en: "e.g. BTC", fr: "ex. BTC" },

  equity_details: { en: "Equity Details", fr: "Détails de l'action" },
  exchange: { en: "Exchange", fr: "Bourse" },
  equity_exchange_placeholder: { en: "e.g. NASDAQ", fr: "ex. NASDAQ" },
  shares_owned: { en: "Shares Owned", fr: "Actions détenues" },
  average_cost_basis: { en: "Average Cost Basis", fr: "Coût de revient moyen" },
  current_price: { en: "Current Price", fr: "Prix actuel" },
  total_value: { en: "Total Value", fr: "Valeur totale" },

  crypto_details: { en: "Crypto Details", fr: "Détails de la cryptomonnaie" },
  coingecko_id: { en: "CoinGecko ID", fr: "Identifiant CoinGecko" },
  coingecko_id_placeholder: { en: "e.g. bitcoin", fr: "ex. bitcoin" },
  coingecko_id_hint: {
    en: "The id from the coin's CoinGecko URL, not its ticker (e.g. \"bitcoin\", not \"BTC\").",
    fr: "L'identifiant tiré de l'URL CoinGecko de la pièce, pas son symbole (ex. « bitcoin », pas « BTC »).",
  },
  crypto_coingecko_id_required: {
    en: "A CoinGecko ID is required to fetch a live price.",
    fr: "Un identifiant CoinGecko est requis pour récupérer un prix en direct.",
  },

  refresh_market_price: { en: "Refresh Market Price", fr: "Actualiser le prix du marché" },
  refresh_from_finnhub: { en: "Refresh from Finnhub", fr: "Actualiser via Finnhub" },
  refresh_from_coingecko: { en: "Refresh from CoinGecko", fr: "Actualiser via CoinGecko" },
  unit_price: { en: "Unit Price", fr: "Prix unitaire" },
  last_updated: { en: "Last Updated", fr: "Dernière mise à jour" },
  no_market_price_yet: {
    en: "No live price fetched yet — use the refresh button above.",
    fr: "Aucun prix en direct récupéré pour l'instant — utilisez le bouton d'actualisation ci-dessus.",
  },
  market_price_updated: {
    en: "Updated to {price} per unit.",
    fr: "Mis à jour à {price} par unité.",
  },

  market_price_error_invalid_request: {
    en: "This asset is missing information needed to fetch a price (ticker or CoinGecko ID).",
    fr: "Il manque à cet actif des informations nécessaires pour récupérer un prix (symbole ou identifiant CoinGecko).",
  },
  market_price_error_invalid_symbol: {
    en: "This ticker or CoinGecko ID wasn't recognized by the pricing provider. Double-check it in Settings.",
    fr: "Ce symbole ou identifiant CoinGecko n'a pas été reconnu par le fournisseur de prix. Vérifiez-le dans les paramètres.",
  },
  market_price_error_unsupported_currency: {
    en: "Live equity pricing only supports USD-denominated assets right now.",
    fr: "La tarification en direct des actions ne prend en charge que les actifs libellés en USD pour l'instant.",
  },
  market_price_error_provider_not_configured: {
    en: "Live equity pricing isn't configured yet — an API key still needs to be set up.",
    fr: "La tarification en direct des actions n'est pas encore configurée — une clé API doit encore être ajoutée.",
  },
  market_price_error_invalid_api_key: {
    en: "Invalid or Missing API Key — Finnhub rejected the key. Check the FINNHUB_API_KEY secret.",
    fr: "Clé API invalide ou manquante — Finnhub a rejeté la clé. Vérifiez le secret FINNHUB_API_KEY.",
  },
  brokerage_api_key_warning: {
    en: "Invalid or Missing API Key — live prices could not be refreshed. Holdings keep their last price or cost basis.",
    fr: "Clé API invalide ou manquante — les cours n'ont pas pu être actualisés. Les positions conservent leur dernier cours ou leur prix de revient.",
  },
  market_price_error_no_data: {
    en: "No live quote available for this ticker on Finnhub's free tier (non-US listings aren't covered). Its last price is kept.",
    fr: "Aucun cours en direct pour ce titre avec l'offre gratuite de Finnhub (les places hors États-Unis ne sont pas couvertes). Le dernier cours est conservé.",
  },
  brokerage_refresh_skipped: {
    en: "{n} not covered by the free price feed (last price kept).",
    fr: "{n} non couverte(s) par le flux gratuit (dernier cours conservé).",
  },
  brokerage_other_holdings: { en: "Other holdings", fr: "Autres positions" },
  market_price_error_timeout: {
    en: "The pricing provider took too long to respond. Try again.",
    fr: "Le fournisseur de prix a mis trop de temps à répondre. Réessayez.",
  },
  market_price_error_rate_limited: {
    en: "The pricing provider's rate limit was hit. Try again shortly.",
    fr: "La limite de requêtes du fournisseur de prix a été atteinte. Réessayez sous peu.",
  },
  market_price_error_invalid_response: {
    en: "The pricing provider returned an unexpected response.",
    fr: "Le fournisseur de prix a renvoyé une réponse inattendue.",
  },
  market_price_error_network_error: {
    en: "Couldn't reach the pricing provider. Check your connection and try again.",
    fr: "Impossible de joindre le fournisseur de prix. Vérifiez votre connexion et réessayez.",
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
