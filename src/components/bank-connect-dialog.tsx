"use client";

import { useState, useTransition } from "react";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/context/language-context";
import {
  linkBankAccounts,
  listBankInstitutions,
  startBankConnection,
  syncBankConnection,
} from "@/app/dashboard/banking/actions";
import type { BankAccount, BankInstitution } from "@/lib/banking/altareq";
import { InstitutionLogo } from "@/components/institution-logo";
import type { BankSyncMode } from "@/lib/banking/institutions";

const SKIP = "__skip__";
const NEW = "new";

type Step =
  | { kind: "pick" }
  | { kind: "map"; connectionId: string; isSandbox: boolean; accounts: BankAccount[] }
  | { kind: "done"; linked: number; isSandbox: boolean };

/**
 * "Connect bank" flow: pick a UAE bank → (live) follow the bank's consent
 * redirect, or (sandbox mode) get the sandbox accounts at once, asset-less →
 * (live) link each account to one of your Cash accounts → first sync. Sandbox
 * accounts appear only in the banking view; their balances
 * are only displayed, never written onto your accounts.
 */
export function BankConnectDialog({
  mode,
  cashAccounts,
  presetInstitutionId,
  trigger,
}: {
  mode: BankSyncMode;
  cashAccounts: { id: string; name: string; isLinked: boolean }[];
  /** Skips the bank picker and starts straight away for this institution (the dedicated Wio / ENBD / ADCB / FAB buttons). */
  presetInstitutionId?: string;
  /** Custom trigger (e.g. a bank-specific button); defaults to the generic Connect bank button. */
  trigger?: React.ReactNode;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [institutions, setInstitutions] = useState<BankInstitution[] | null>(null);
  const [institutionId, setInstitutionId] = useState("");
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && presetInstitutionId) {
      handleStart(presetInstitutionId);
      return;
    }
    if (next && institutions === null) {
      startTransition(async () => {
        const result = await listBankInstitutions();
        if (result.ok) setInstitutions(result.institutions);
        else setError(result.error);
      });
    }
    if (!next) {
      setStep({ kind: "pick" });
      setError(null);
      setTargets({});
    }
  }

  function handleStart(id: string = institutionId) {
    setError(null);
    startTransition(async () => {
      const result = await startBankConnection(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.kind === "redirect") {
        window.location.href = result.url;
        return;
      }
      if (result.autoLinked) {
        // Sandbox accounts are linked asset-less on the server: nothing to map.
        setStep({ kind: "done", linked: result.accounts.length, isSandbox: true });
        return;
      }
      setStep({ kind: "map", connectionId: result.connectionId, isSandbox: result.isSandbox, accounts: result.accounts });
    });
  }

  function handleLink() {
    if (step.kind !== "map") return;
    setError(null);
    const mappings = step.accounts
      .filter((a) => (targets[a.externalId] ?? SKIP) !== SKIP)
      .map((a) => ({ account: a, assetId: targets[a.externalId] }));
    if (mappings.length === 0) {
      setError(t("bank_pick_one_account"));
      return;
    }
    startTransition(async () => {
      const linked = await linkBankAccounts(step.connectionId, mappings);
      if (!linked.ok) {
        setError(linked.error);
        return;
      }
      await syncBankConnection(step.connectionId);
      setStep({ kind: "done", linked: linked.linked, isSandbox: step.isSandbox });
    });
  }

  const disabled = mode === "unconfigured";
  const freeAccounts = cashAccounts.filter((a) => !a.isLinked);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            title={disabled ? t("bank_not_configured") : undefined}
          >
            <Landmark className="size-4" />
            {t("bank_connect")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-background sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">{t("bank_connect_title")}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("bank_connect_desc")}
          </DialogDescription>
        </DialogHeader>

        {presetInstitutionId && step.kind === "pick" && (
          <div className="space-y-3">
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("bank_connecting")}</p>
            )}
          </div>
        )}

        {mode === "sandbox" && (
          <p className="border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
            {t("bank_sample_note")}
          </p>
        )}

        {step.kind === "pick" && !presetInstitutionId && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("bank_choose_bank")}</Label>
              <Select value={institutionId} onValueChange={setInstitutionId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("bank_choose_bank")} />
                </SelectTrigger>
                <SelectContent>
                  {(institutions ?? []).map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      <InstitutionLogo kind="bank" id={i.id} name={i.name} />
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">{t("bank_consent_note")}</p>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="button" onClick={() => handleStart()} disabled={!institutionId || isPending}>
              {isPending ? t("bank_connecting") : t("bank_continue")}
            </Button>
          </div>
        )}

        {step.kind === "map" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("bank_map_desc")}</p>
            {step.accounts.map((account) => (
              <div key={account.externalId} className="space-y-1 border border-border p-3">
                <p className="text-sm font-medium text-foreground">
                  {account.label} <span className="text-muted-foreground">{account.maskedNumber}</span>
                </p>
                <Select
                  value={targets[account.externalId] ?? SKIP}
                  onValueChange={(v) => setTargets((prev) => ({ ...prev, [account.externalId]: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SKIP}>{t("bank_skip_account")}</SelectItem>
                    {!step.isSandbox && <SelectItem value={NEW}>{t("bank_create_cash_account")}</SelectItem>}
                    {freeAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="button" onClick={handleLink} disabled={isPending}>
              {isPending ? t("bank_linking") : t("bank_link_and_sync")}
            </Button>
          </div>
        )}

        {step.kind === "done" && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              {t(step.isSandbox ? "bank_done_sample" : "bank_done", { n: step.linked })}
            </p>
            <Button type="button" onClick={() => handleOpenChange(false)}>
              {t("csv_done")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
