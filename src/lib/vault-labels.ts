/**
 * English source text of the Governance Vault UI. The keys are typed locally (`VaultKey`) so this feature
 * does not depend on them being in `lib/i18n.ts` yet (the nine-language set is in `tmp-i18n-vault.json`,
 * to be merged into the dictionaries). Pure data: safe on server and client.
 */
export const VAULT_EN = {
  vault_tab: "Documents",
  vault_title: "Document vault",
  vault_subtitle: "Private documents for this asset. Files sit in a private store and open through links that expire after 60 seconds.",
  vault_upload: "Upload document",
  vault_loading: "Loading documents…",
  vault_empty: "No documents yet. Upload a deed, an insurance policy or a trust deed to keep it with this asset.",
  vault_unavailable: "The document vault is not available yet. It will appear once it is switched on.",
  vault_col_title: "Title",
  vault_col_type: "Type",
  vault_col_expiry: "Expires",
  vault_col_size: "Size",
  vault_type_deed: "Title deed",
  vault_type_insurance: "Insurance",
  vault_type_trust_deed: "Trust deed",
  vault_type_tax: "Tax",
  vault_type_valuation: "Valuation",
  vault_type_id: "ID",
  vault_type_contract: "Contract",
  vault_type_other: "Other",
  vault_expiry_none: "No expiry",
  vault_expires_rel: "Expires {when}",
  vault_expired_rel: "Expired {when}",
  vault_owner_only: "Owner only: hidden from co-owners",
  vault_shared: "Visible to co-owners",
  vault_view: "View",
  vault_download: "Download",
  vault_edit: "Edit",
  vault_delete: "Delete",
  vault_opening: "Opening…",
  vault_upload_title: "Upload a document",
  vault_edit_title: "Edit document",
  vault_field_file: "File (PDF, PNG or JPEG, up to 15 MB)",
  vault_field_title: "Title",
  vault_field_type: "Document type",
  vault_field_expiry: "Expiry date (optional)",
  vault_field_owner_only: "Owner only: hide from co-owners",
  vault_save: "Save",
  vault_cancel: "Cancel",
  vault_uploading: "Uploading…",
  vault_delete_title: "Delete this document?",
  vault_delete_body: "“{title}” and its file will be permanently deleted. This cannot be undone.",
  vault_delete_confirm: "Delete permanently",
  vault_err_signed_out: "Please sign in again.",
  vault_err_mfa: "Please complete two-factor verification first.",
  vault_err_demo: "The demo account is read-only.",
  vault_err_not_found: "Document not found.",
  vault_err_unavailable: "The document vault is not available yet.",
  vault_err_failed: "Something went wrong. Please try again.",
  vault_err_bad_request: "The request was not valid.",
  vault_err_file_missing: "Choose a file to upload.",
  vault_err_file_type: "Only PDF, PNG and JPEG files are accepted.",
  vault_err_file_size: "The file is larger than 15 MB.",
  vault_err_file_empty: "The file is empty.",
  vault_err_title: "Enter a title (up to 120 characters).",
  vault_err_doc_type: "Choose a document type.",
  vault_err_expiry: "Enter a valid expiry date.",
  vault_err_limit_asset: "This asset has reached its document limit.",
  vault_err_limit_user: "You have reached your document limit.",
  vault_err_limit_storage: "You have reached your storage limit.",
  vault_notif_expiry: "{doc} ({asset}) expires within {days} days.",
  vault_notif_expired: "{doc} ({asset}) has expired.",
} as const;

export type VaultKey = keyof typeof VAULT_EN;

export const isVaultKey = (k: string): k is VaultKey => Object.prototype.hasOwnProperty.call(VAULT_EN, k);

/** Replaces `{name}` placeholders. */
export function fillVault(text: string, vars?: Record<string, string | number>): string {
  let out = text;
  if (vars) for (const [n, v] of Object.entries(vars)) out = out.split(`{${n}}`).join(String(v));
  return out;
}
