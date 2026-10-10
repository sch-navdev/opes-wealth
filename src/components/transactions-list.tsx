"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { useBankingText } from "@/components/banking-text";
import { deleteStoredTransaction, updateStoredTransaction } from "@/app/dashboard/transaction-import-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransactionDetailsSheet } from "@/components/transaction-details-sheet";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";
import { detailFromRow, type StoredTransactionRow } from "@/lib/transaction-detail";

const PAGE_SIZE = 25;

/**
 * Stored transactions of one Cash account (newest first, as loaded by the asset page): date,
 * description, signed amount. Each row opens the details drawer, whose prev / next walks this list.
 */
export function TransactionsList({
  transactions,
  currency,
  assetId,
}: {
  transactions: StoredTransactionRow[];
  /** The account's currency, used when a row carries none. */
  currency: string;
  /** Own account: rows can be corrected or deleted. */
  assetId?: string;
}) {
  const { t, intlLocale } = useLanguage();
  const tx = useBankingText();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ success: true } | { error: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        setError(tx("tx_action_failed", { error: result.error }));
        return;
      }
      after?.();
      router.refresh();
    });
  }
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<number | null>(null);

  const details = useMemo(
    () => transactions.map((row) => detailFromRow({ ...row, currency: row.currency || currency })),
    [transactions, currency],
  );

  const dateFormat = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeZone: "UTC" });
    } catch {
      return null;
    }
  }, [intlLocale]);

  function money(amount: number, cur: string): string {
    try {
      return new Intl.NumberFormat(intlLocale, { style: "currency", currency: cur, signDisplay: "exceptZero" }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${cur}`;
    }
  }

  function day(iso: string): string {
    const parsed = new Date(`${iso}T00:00:00Z`);
    return dateFormat && !Number.isNaN(parsed.getTime()) ? dateFormat.format(parsed) : iso;
  }

  const visible = details.slice(0, shown);
  const remaining = details.length - visible.length;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">{t("txd_list_title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {details.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("txd_list_empty")}</p>
        ) : (
          <>
            <ul className="divide-y divide-border border border-border">
              {visible.map((d, i) => (
                <li key={`${d.fingerprint ?? d.date}-${i}`}>
                  {assetId && d.id && editingId === d.id ? (
                    <TransactionEditor
                      row={d}
                      disabled={isPending}
                      labels={{ date: tx("tx_edit_date"), description: tx("tx_edit_desc"), amount: tx("tx_edit_amount"), save: tx("tx_save"), cancel: tx("tx_cancel") }}
                      onCancel={() => setEditingId(null)}
                      onSave={(next) => run(() => updateStoredTransaction(assetId, d.id as string, next), () => setEditingId(null))}
                    />
                  ) : (
                  <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setSelected(i)}
                    className="grid min-w-0 flex-1 grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 text-start text-sm hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="tabular-nums text-muted-foreground">{day(d.date)}</span>
                    <span className="truncate text-foreground">{d.description || t("txd_no_description")}</span>
                    <span
                      className={cn(
                        "tabular-nums",
                        d.amount < 0 ? "text-destructive" : d.amount > 0 ? "text-success" : "text-foreground",
                      )}
                    >
                      {money(d.amount, d.currency)}
                    </span>
                  </button>
                  {assetId && d.id && (
                    <span className="flex shrink-0 items-center gap-1 pe-2">
                      <Button type="button" variant="ghost" size="icon-xs" aria-label={tx("tx_edit")} title={tx("tx_edit")} disabled={isPending} onClick={() => setEditingId(d.id as string)}>
                        <Pencil className="size-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="ghost" size="icon-xs" aria-label={tx("tx_delete")} title={tx("tx_delete")} disabled={isPending}>
                            <Trash2 className="size-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="border-border bg-card">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-foreground">{tx("tx_delete_title")}</AlertDialogTitle>
                            <AlertDialogDescription className="text-muted-foreground">
                              {d.description || t("txd_no_description")} · {money(d.amount, d.currency)} · {day(d.date)}
                              <br />
                              {tx("tx_delete_body")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{tx("tx_cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => run(() => deleteStoredTransaction(assetId, d.id as string))}>{tx("tx_delete")}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </span>
                  )}
                  </div>
                  )}
                </li>
              ))}
            </ul>
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
            {remaining > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                {t("txd_show_more", { n: remaining })}
              </Button>
            )}
          </>
        )}
      </CardContent>
      <TransactionDetailsSheet transactions={details} index={selected} onIndexChange={setSelected} />
    </Card>
  );
}

/** Inline editor of one stored transaction: date, description and signed amount. */
function TransactionEditor({
  row,
  labels,
  disabled,
  onSave,
  onCancel,
}: {
  row: { date: string; description: string; amount: number };
  labels: { date: string; description: string; amount: string; save: string; cancel: string };
  disabled: boolean;
  onSave: (next: { date: string; description: string; amount: number }) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(row.date);
  const [description, setDescription] = useState(row.description);
  const [amount, setAmount] = useState(String(row.amount));
  const parsed = Number(amount.replace(",", "."));
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && amount.trim() !== "" && Number.isFinite(parsed);
  return (
    <div className="flex flex-wrap items-end gap-2 p-3">
      <label className="grid gap-1 text-xs text-muted-foreground">
        {labels.date}
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-40" />
      </label>
      <label className="grid min-w-40 flex-1 gap-1 text-xs text-muted-foreground">
        {labels.description}
        <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-8" />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        {labels.amount}
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 w-40" />
      </label>
      <Button type="button" size="sm" disabled={!valid || disabled} onClick={() => onSave({ date, description: description.trim(), amount: Math.round(parsed * 100) / 100 })}>
        {labels.save}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        {labels.cancel}
      </Button>
    </div>
  );
}
