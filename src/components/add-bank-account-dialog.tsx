"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InstitutionLogo } from "@/components/institution-logo";
import { addBankAccount } from "@/app/dashboard/actions";
import { useLanguage } from "@/context/language-context";
import { BANK_ACCOUNT_TYPES, OTHER_BANK, type BankAccountType } from "@/lib/bank-account";
import { BANK_COUNTRIES, banksByCountry, getBank } from "@/lib/banking/institutions";
import { currencies, getCurrencySymbol } from "@/lib/currencies";
import type { TranslationKey } from "@/lib/i18n";

const todayIso = new Date().toISOString().slice(0, 10);

const TYPE_LABEL_KEYS: Record<BankAccountType, TranslationKey> = {
  checking: "bank_account_type_checking",
  savings: "bank_account_type_savings",
  credit_card: "bank_account_type_credit_card",
  term_deposit: "bank_account_type_term_deposit",
  other: "bank_account_type_other",
};

/**
 * "Add account" on the Cash & bank card: a proper bank-account form instead of
 * the generic asset modal — pick the bank (with its logo) or type one that
 * isn't listed, the account type, name, currency, balance and an optional
 * account reference that lets imported CSV statements find the account.
 * Credit cards are saved as a liability (amount owed), everything else as Cash.
 */
export function AddBankAccountDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { t, intlLocale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [bankKey, setBankKey] = useState("");
  const [otherBankName, setOtherBankName] = useState("");
  const [accountType, setAccountType] = useState<BankAccountType>("checking");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [balance, setBalance] = useState("");
  const [asOf, setAsOf] = useState(todayIso);
  const [accountRef, setAccountRef] = useState("");
  const [creditLimit, setCreditLimit] = useState("");

  const isCard = accountType === "credit_card";
  const bank = bankKey && bankKey !== OTHER_BANK ? getBank(bankKey) : undefined;
  const bankName = bankKey === OTHER_BANK ? otherBankName.trim() : (bank?.name ?? "");

  // Until the user types their own, the account name follows "<Bank> <type>".
  function suggestedName(nextBank: string, nextType: BankAccountType) {
    return nextBank ? `${nextBank} ${t(TYPE_LABEL_KEYS[nextType])}` : "";
  }

  function reset() {
    setBankKey("");
    setOtherBankName("");
    setAccountType("checking");
    setName("");
    setNameTouched(false);
    setCurrency("USD");
    setBalance("");
    setAsOf(todayIso);
    setAccountRef("");
    setCreditLimit("");
    setError(null);
  }

  function pickBank(next: string) {
    setBankKey(next);
    const picked = next !== OTHER_BANK ? getBank(next) : undefined;
    if (picked) setCurrency(picked.defaultCurrency);
    if (!nameTouched) setName(suggestedName(picked?.name ?? "", accountType));
  }

  function pickType(next: BankAccountType) {
    setAccountType(next);
    if (!nameTouched) setName(suggestedName(bankName, next));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!bankKey || !bankName) {
      setError(t("bank_account_error_bank"));
      return;
    }
    if (!name.trim()) {
      setError(t("bank_account_error_name"));
      return;
    }
    if (balance.trim() === "" || !Number.isFinite(Number(balance))) {
      setError(t("bank_account_error_balance"));
      return;
    }

    const formData = new FormData();
    if (bank) formData.set("bank_key", bank.key);
    formData.set("institution_name", bankName);
    formData.set("account_type", accountType);
    formData.set("name", name.trim());
    formData.set("current_value", balance);
    formData.set("currency", currency);
    formData.set("purchase_date", asOf);
    if (accountRef.trim()) formData.set("account_ref", accountRef.trim());
    if (isCard && creditLimit.trim()) formData.set("credit_limit", creditLimit);

    startTransition(async () => {
      const result = await addBankAccount(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
    });
  }

  const countryGroups = BANK_COUNTRIES.map((code) => ({ code, banks: banksByCountry(code) }));
  const groupLabel = (code: string) =>
    new Intl.DisplayNames([intlLocale], { type: "region" }).of(code) ?? code;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm">
            {t("cash_bank_add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[95vw] overflow-y-auto border-border bg-card sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">{t("bank_account_dialog_title")}</DialogTitle>
          <DialogDescription className="text-muted-foreground">{t("bank_account_dialog_desc")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bank_account_bank">{t("bank_account_bank")}</Label>
              <Select value={bankKey} onValueChange={pickBank}>
                <SelectTrigger id="bank_account_bank" className="w-full">
                  <SelectValue placeholder={t("bank_account_choose_bank")} />
                </SelectTrigger>
                <SelectContent>
                  {countryGroups.map((group) => (
                    <SelectGroup key={group.code}>
                      <SelectLabel>{groupLabel(group.code)}</SelectLabel>
                      {group.banks.map((b) => (
                        <SelectItem key={b.key} value={b.key}>
                          <InstitutionLogo kind="bank" id={b.key} name={b.name} />
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                  <SelectItem value={OTHER_BANK}>{t("bank_account_other_bank")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank_account_type">{t("bank_account_type")}</Label>
              <Select value={accountType} onValueChange={(v) => pickType(v as BankAccountType)}>
                <SelectTrigger id="bank_account_type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BANK_ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(TYPE_LABEL_KEYS[type])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {bankKey === OTHER_BANK && (
            <div className="space-y-2">
              <Label htmlFor="bank_account_other_name">{t("bank_account_other_bank_name")}</Label>
              <Input
                id="bank_account_other_name"
                value={otherBankName}
                maxLength={100}
                onChange={(e) => {
                  setOtherBankName(e.target.value);
                  if (!nameTouched) setName(suggestedName(e.target.value.trim(), accountType));
                }}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="bank_account_name">{t("bank_account_name")}</Label>
            <Input
              id="bank_account_name"
              value={name}
              maxLength={120}
              placeholder={t("bank_account_name_placeholder")}
              onChange={(e) => {
                setName(e.target.value);
                setNameTouched(true);
              }}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="bank_account_balance">
                {isCard ? t("bank_account_balance_owed") : t("bank_account_balance")}
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {getCurrencySymbol(currency)}
                </span>
                <Input
                  id="bank_account_balance"
                  type="number"
                  step="any"
                  min={isCard ? "0" : undefined}
                  className="ps-12"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank_account_currency">{t("currency_label")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="bank_account_currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank_account_asof">{t("bank_account_as_of")}</Label>
              <Input
                id="bank_account_asof"
                type="date"
                max={todayIso}
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bank_account_ref">{t("bank_account_ref")}</Label>
              <Input
                id="bank_account_ref"
                value={accountRef}
                maxLength={40}
                onChange={(e) => setAccountRef(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">{t("bank_account_ref_hint")}</p>
            </div>
            {isCard && (
              <div className="space-y-2">
                <Label htmlFor="bank_account_limit">{t("bank_account_credit_limit")}</Label>
                <Input
                  id="bank_account_limit"
                  type="number"
                  step="any"
                  min="0"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                />
              </div>
            )}
          </div>

          {isCard && <p className="text-xs text-muted-foreground">{t("bank_account_card_note")}</p>}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("bank_account_saving") : t("bank_account_save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
