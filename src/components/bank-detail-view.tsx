"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { batchDeleteAssets } from "@/app/dashboard/actions";
import { mergeCashAccounts } from "@/app/dashboard/banking/actions";
import { BalanceAsOf } from "@/components/balance-as-of";
import { BankLogoByName } from "@/components/institution-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBankingText } from "@/components/banking-text";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { cn } from "@/lib/utils";

export type BankDetailAccount = {
  id: string;
  name: string;
  masked: string;
  currency: string;
  /** In the account's own currency. */
  balance: number;
  /** In the Base Currency. */
  baseBalance: number;
  balanceAsOf: string | null;
  closedOn: string | null;
};

export type BankDetailTransaction = {
  accountId: string;
  date: string;
  /** Signed, in the account's own currency. */
  amount: number;
  currency: string;
  description: string;
};

const PAGE = 50;

/**
 * One bank at a glance: the consolidated balance of all its accounts and the transactions of all of them in one
 * list (newest first, filterable by account), with a link into each account for its own detail and analysis.
 */
export function BankDetailView({
  bankName,
  baseCurrency,
  accounts,
  transactions,
  truncated,
  today,
}: {
  bankName: string;
  baseCurrency: string;
  accounts: BankDetailAccount[];
  transactions: BankDetailTransaction[];
  truncated: boolean;
  today: string;
}) {
  const tx = useBankingText();
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const [showClosed, setShowClosed] = useState(false);
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [shown, setShown] = useState(PAGE);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mergeName, setMergeName] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  function toggle(id: string, on: boolean) {
    setSelectedIds((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));
  }
  function runMerge() {
    setActionError(null);
    startTransition(async () => {
      const r = await mergeCashAccounts(selectedIds, mergeName);
      if (!r.ok) {
        setActionError(tx("bank_action_failed", { error: r.error }));
        return;
      }
      setSelectedIds([]);
      router.refresh();
    });
  }
  function runDeleteAll() {
    setActionError(null);
    startTransition(async () => {
      const r = await batchDeleteAssets(accounts.map((a) => a.id));
      if (r && "error" in r && r.error) {
        setActionError(tx("bank_action_failed", { error: r.error }));
        return;
      }
      router.push("/dashboard/banking");
    });
  }

  const closedCount = accounts.filter((a) => a.closedOn).length;
  const visibleAccounts = showClosed ? accounts : accounts.filter((a) => !a.closedOn);
  const total = visibleAccounts.reduce((s, a) => s + a.baseBalance, 0);
  const nameOf = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const visibleIds = new Set(visibleAccounts.map((a) => a.id));
  const filtered = transactions.filter((t) => (accountFilter === "all" ? visibleIds.has(t.accountId) : t.accountId === accountFilter));
  const rows = filtered.slice(0, shown);

  const base = new Intl.NumberFormat(intlLocale, { style: "currency", currency: baseCurrency });
  const money = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat(intlLocale, { style: "currency", currency, signDisplay: "exceptZero" }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  };
  const day = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeZone: "UTC" }).format(d);
  };

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-8" data-testid="bank-detail">
      <Link href="/dashboard/banking" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {tx("back_to_banking")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-foreground">
          <BankLogoByName name={bankName} />
          {bankName}
        </h1>
        <div className="text-end">
          <p className="text-xs text-muted-foreground">{tx("bank_detail_total")}</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{maskValue(base.format(total))}</p>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm text-foreground">{tx("bank_detail_accounts", { n: visibleAccounts.length })}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {closedCount > 0 && (
              <Button type="button" size="sm" variant="outline" aria-pressed={showClosed} onClick={() => setShowClosed((v) => !v)}>
                {showClosed ? tx("bank_hide_closed") : tx("bank_show_closed", { n: closedCount })}
              </Button>
            )}
            {selectedIds.length >= 2 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={() => setMergeName(accounts.find((a) => a.id === selectedIds[0])?.name ?? "")}
                  >
                    {tx("bank_merge_button", { n: selectedIds.length })}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-border bg-card">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-foreground">{tx("bank_merge_title", { n: selectedIds.length })}</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">{tx("bank_merge_body")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <label className="grid gap-1 text-xs text-muted-foreground">
                    {tx("bank_merge_name")}
                    <Input value={mergeName} onChange={(e) => setMergeName(e.target.value)} maxLength={120} />
                  </label>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{tx("tx_cancel")}</AlertDialogCancel>
                    <AlertDialogAction disabled={mergeName.trim() === ""} onClick={runMerge}>
                      {tx("bank_merge_confirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border border-t border-border">
            {visibleAccounts.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <Checkbox
                    className="mt-0.5"
                    checked={selectedIds.includes(a.id)}
                    onCheckedChange={(v) => toggle(a.id, v === true)}
                    aria-label={tx("bank_select_account", { name: a.name })}
                  />
                  <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {a.name} <span className="font-normal text-muted-foreground">{a.masked}</span>
                    {a.closedOn && (
                      <Badge variant="secondary" className="ms-2">
                        {tx("bank_closed_badge", { date: a.closedOn })}
                      </Badge>
                    )}
                  </p>
                  <Link href={`/dashboard/assets/${a.id}`} className="text-xs text-primary hover:underline">
                    {tx("bank_detail_analyse")}
                  </Link>
                  </div>
                </div>
                <div className="text-end">
                  <p className="text-sm font-medium tabular-nums text-foreground">{maskValue(money(a.balance, a.currency).replace(/^\+/, ""))}</p>
                  {a.currency !== baseCurrency && <p className="text-xs tabular-nums text-muted-foreground">{maskValue(base.format(a.baseBalance))}</p>}
                  <BalanceAsOf asOf={a.balanceAsOf} today={today} />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {actionError && (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      )}

      <Card className="border-border bg-card">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm text-foreground">{tx("bank_detail_transactions")}</CardTitle>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {tx("bank_detail_filter")}
            <select
              className="h-8 border border-border bg-background px-2 text-sm text-foreground"
              value={accountFilter}
              onChange={(e) => {
                setAccountFilter(e.target.value);
                setShown(PAGE);
              }}
            >
              <option value="all">{tx("bank_detail_all_accounts")}</option>
              {visibleAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.masked}
                </option>
              ))}
            </select>
          </label>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tx("bank_detail_no_transactions")}</p>
          ) : (
            <ul className="divide-y divide-border border border-border">
              {rows.map((t, i) => (
                <li key={`${t.accountId}-${t.date}-${i}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 text-sm">
                  <span className="tabular-nums text-muted-foreground">{day(t.date)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-foreground" dir="auto" title={t.description || undefined}>
                      {t.description || "—"}
                    </span>
                    <Link href={`/dashboard/assets/${t.accountId}`} className="block truncate text-xs text-muted-foreground hover:underline">
                      {nameOf.get(t.accountId)?.name ?? ""} {nameOf.get(t.accountId)?.masked ?? ""}
                    </Link>
                  </span>
                  <span className={cn("tabular-nums", t.amount < 0 ? "text-destructive" : "text-success")}>{maskValue(money(t.amount, t.currency))}</span>
                </li>
              ))}
            </ul>
          )}
          {filtered.length > rows.length && (
            <Button type="button" variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
              {tx("bank_detail_more", { n: filtered.length - rows.length })}
            </Button>
          )}
          {truncated && <p className="text-xs text-muted-foreground">{tx("bank_detail_truncated")}</p>}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <AlertDialog onOpenChange={() => setConfirmText("")}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={isPending} className="text-destructive">
              {tx("bank_delete_all_button")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="border-border bg-card">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-foreground">{tx("bank_delete_all_title", { bank: bankName, n: accounts.length })}</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">{tx("bank_delete_all_body")}</AlertDialogDescription>
            </AlertDialogHeader>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label={bankName} placeholder={bankName} />
            <AlertDialogFooter>
              <AlertDialogCancel>{tx("tx_cancel")}</AlertDialogCancel>
              <AlertDialogAction disabled={confirmText.trim() !== bankName} onClick={runDeleteAll}>
                {tx("bank_delete_all_confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
