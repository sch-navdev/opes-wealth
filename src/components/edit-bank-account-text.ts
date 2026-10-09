"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import type { TranslationKey } from "@/lib/i18n";

type Vars = Record<string, string | number>;

/**
 * English texts of the Edit Bank Account dialog and the Banking page country filter (`ebk_*`).
 * The 9-language set lives in `tmp-i18n-editbank.json` until merged into the i18n files; until a key
 * is merged `t()` returns the key itself and the English below is used (same pattern as `banking-text.ts`).
 */
export const EBK_EN = {
  ebk_title: "Edit Bank Account",
  ebk_desc: "Update the details of this bank account.",
  ebk_bank: "Bank",
  ebk_bank_ph: "e.g. Wio Bank",
  ebk_name: "Account name",
  ebk_account_ref: "Account reference",
  ebk_account_ref_hint: "Last digits or IBAN tail; lets imported statements find this account.",
  ebk_country: "Country",
  ebk_country_none: "Not set",
  ebk_country_hint: "Optional. Used to group your bank accounts by country on the Banking page.",
  ebk_notes: "Notes",
  ebk_quantity: "Quantity",
  ebk_value: "Balance",
  ebk_currency: "Currency",
  ebk_locked: "Quantity, balance and currency come from imported statements and cannot be edited here.",
  ebk_error_name: "Enter an account name.",
  ebk_error_value: "Enter a valid balance.",
  ebk_country_filter_label: "Country",
  ebk_country_all: "All",
  ebk_country_unset: "No country set",
} as const;

export type EbkKey = keyof typeof EBK_EN;

function fill(text: string, vars?: Vars): string {
  let out = text;
  if (vars) for (const [name, val] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(val));
  return out;
}

export function useEditBankText(): (key: EbkKey, vars?: Vars) => string {
  const { t } = useLanguage();
  return useCallback(
    (key, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fill(EBK_EN[key], vars) : translated;
    },
    [t],
  );
}
