export type Locale = "en" | "fr";

export const locales: Locale[] = ["en", "fr"];

const dictionary = {
  // Add/Edit Asset dialog
  purchase_date: { en: "Purchase Date", fr: "Date d'achat" },

  // Dashboard chrome
  welcome_back: { en: "Welcome back", fr: "Bon retour" },
  portfolio_heading: { en: "Portfolio", fr: "Portefeuille" },
  portfolio_subtitle: {
    en: "Every asset and liability you're tracking.",
    fr: "Chaque actif et passif que vous suivez.",
  },

  // Portfolio grouping — category folder headers
  category_real_estate: { en: "Real Estate", fr: "Immobilier" },
  category_scpi: { en: "SCPI", fr: "SCPI" },
  category_equities: { en: "Equities", fr: "Actions" },
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
  delete: { en: "Delete", fr: "Supprimer" },
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
    en: "The outstanding loan balance is subtracted from this property's Net Equity.",
    fr: "Le solde du prêt restant dû est déduit des capitaux propres nets de ce bien.",
  },
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

  // Portfolio Performance stacked area chart
  portfolio_performance_title: { en: "Portfolio Performance", fr: "Performance du portefeuille" },
  portfolio_performance_empty: {
    en: "No Equities price history yet — import trades and refresh a market price to see this chart fill in.",
    fr: "Aucun historique de prix d'actions pour l'instant — importez des transactions et actualisez un prix de marché pour voir ce graphique se remplir.",
  },

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
