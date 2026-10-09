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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyCashText } from "@/components/company-cash-text";
import { setBankAccountCompany } from "@/app/dashboard/companies/company-cash-actions";
import { COMPANY_CASH_EN, type CompanyCashKey } from "@/lib/company-cash-labels";

const NO_COMPANY = "__none__";

/**
 * "Change company" on a company bank account: link the Cash account to another of the user's companies, or
 * make it a personal account again (`metadata.company_id`, see `lib/company-cash.ts`). Net worth is unchanged.
 */
export function CompanyAccountLinkDialog({
  accountId,
  accountName,
  currentCompanyId,
  companies,
  trigger,
}: {
  accountId: string;
  accountName: string;
  currentCompanyId: string | null;
  companies: { id: string; name: string }[];
  trigger?: React.ReactNode;
}) {
  const cco = useCompanyCashText();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentCompanyId ?? NO_COMPANY);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setBankAccountCompany(accountId, value === NO_COMPANY ? null : value);
      if (!result.ok) {
        const key = result.error as CompanyCashKey;
        setError(key in COMPANY_CASH_EN ? cco(key) : cco("cco_err_save_failed"));
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValue(currentCompanyId ?? NO_COMPANY);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="ghost" size="sm">
            {cco("cco_link_change")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">{cco("cco_link_title")}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {cco("cco_link_desc", { account: accountName })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`cco-link-${accountId}`}>{cco("cco_company_label")}</Label>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger id={`cco-link-${accountId}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_COMPANY}>{cco("cco_company_none")}</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{cco("cco_company_hint")}</p>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" disabled={isPending} onClick={save}>
            {isPending ? cco("cco_link_saving") : cco("cco_link_save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
