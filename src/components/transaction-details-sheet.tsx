"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useLanguage } from "@/context/language-context";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  accountTail,
  amountDirection,
  shortFingerprint,
  sourceKind,
  type TransactionDetail,
} from "@/lib/transaction-detail";

export type { TransactionDetail } from "@/lib/transaction-detail";

type CopyTarget = "label" | "fingerprint";

function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const parsed = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
  } catch {
    return iso;
  }
}

function formatMoney(amount: number, currency: string, locale: string, signed: boolean): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      ...(signed ? { signDisplay: "exceptZero" as const } : {}),
    }).format(amount);
  } catch {
    return `${signed && amount > 0 ? "+" : ""}${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * Slide-over with the full metadata of one transaction, plus previous / next navigation within
 * `transactions` (buttons and the ArrowUp / ArrowDown keys). Controlled: `index` is the open
 * transaction (null = closed). Rendered by the stored-transactions list and the import preview.
 */
export function TransactionDetailsSheet({
  transactions,
  index,
  onIndexChange,
}: {
  transactions: TransactionDetail[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const { t, intlLocale } = useLanguage();
  const [copiedRaw, setCopied] = useState<{ target: CopyTarget; ok: boolean; index: number | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feedback belongs to the transaction it was shown for; the timer never outlives the component.
  const copied = copiedRaw && copiedRaw.index === index ? copiedRaw : null;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const tx = index !== null ? (transactions[index] ?? null) : null;
  const open = tx !== null;
  const total = transactions.length;

  const view = useMemo(() => {
    if (!tx) return null;
    const direction = amountDirection(tx.amount);
    return {
      direction,
      amount: formatMoney(tx.amount, tx.currency, intlLocale, true),
      balance: tx.balance != null ? formatMoney(tx.balance, tx.currency, intlLocale, false) : "",
      date: formatDate(tx.date, intlLocale),
      valueDate: formatDate(tx.valueDate, intlLocale),
      importedAt: formatDate(tx.importedAt, intlLocale),
      tail: accountTail(tx.accountRef),
      short: shortFingerprint(tx.fingerprint),
    };
  }, [tx, intlLocale]);

  async function copy(text: string, target: CopyTarget) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = false;
    }
    setCopied({ target, ok, index });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2000);
  }

  function go(delta: number) {
    if (index === null) return;
    const next = index + delta;
    if (next >= 0 && next < total) onIndexChange(next);
  }

  // Arrow keys work while the drawer is open even if focus fell to <body> (e.g. after a nav button became
  // disabled at the end of the list). Listening on the document is safe: the drawer is modal.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        go(-1);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const copyLabel = (target: CopyTarget, idle: TranslationKey): string =>
    copied?.target === target ? t(copied.ok ? "txd_copied" : "txd_copy_failed") : t(idle);

  const rows: { label: string; value: string; mono?: boolean; action?: React.ReactNode }[] = [];
  if (tx && view) {
    rows.push({ label: t("txd_date"), value: view.date });
    if (view.valueDate) rows.push({ label: t("txd_value_date"), value: view.valueDate });
    if (tx.bank) rows.push({ label: t("txd_bank"), value: tx.bank });
    if (view.tail) rows.push({ label: t("txd_account"), value: `•••• ${view.tail}`, mono: true });
    if (tx.reference) rows.push({ label: t("txd_reference"), value: tx.reference, mono: true });
    if (view.balance) rows.push({ label: t("txd_balance_after"), value: view.balance });
    if (tx.source) {
      const kind = sourceKind(tx.source);
      rows.push({
        label: t("txd_source"),
        value: kind === "csv" ? t("txd_source_csv") : kind === "pdf" ? t("txd_source_pdf") : tx.source,
      });
    }
    if (view.importedAt) rows.push({ label: t("txd_imported_on"), value: view.importedAt });
    if (tx.fingerprint) {
      const fingerprint = tx.fingerprint;
      rows.push({
        label: t("txd_fingerprint"),
        value: view.short,
        mono: true,
        action: (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => copy(fingerprint, "fingerprint")}
            aria-label={t("txd_copy_fingerprint")}
          >
            <Copy className="size-3.5" />
            {copied?.target === "fingerprint" ? t(copied.ok ? "txd_copied" : "txd_copy_failed") : null}
          </Button>
        ),
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onIndexChange(null)}>
      <SheetContent closeLabel={t("close")} aria-describedby="txd-desc">
        {tx && view && (
          <>
            <SheetHeader>
              <SheetTitle>{t("txd_title")}</SheetTitle>
              <SheetDescription id="txd-desc">{t("txd_nav_hint")}</SheetDescription>
            </SheetHeader>

            <div className="space-y-1 border-b border-border pb-4">
              <p className="sr-only">{t(view.direction === "out" ? "txd_money_out" : "txd_money_in")}</p>
              <p
                data-testid="txd-amount"
                data-direction={view.direction}
                className={cn(
                  "text-3xl font-semibold tabular-nums",
                  view.direction === "in" && "text-success",
                  view.direction === "out" && "text-destructive",
                  view.direction === "zero" && "text-foreground",
                )}
              >
                {view.amount}
              </p>
              <p className="text-sm text-muted-foreground">
                {view.date}
                {view.valueDate && view.valueDate !== view.date ? ` · ${t("txd_value_date")} ${view.valueDate}` : ""}
              </p>
              <p className="text-base font-medium text-foreground break-words">
                {tx.description || t("txd_no_description")}
              </p>
            </div>

            {tx.originalLabel ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">{t("txd_original_label")}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => copy(tx.originalLabel as string, "label")}
                  >
                    <Copy className="size-3.5" />
                    {copyLabel("label", "txd_copy")}
                  </Button>
                </div>
                <pre
                  dir="auto"
                  className="whitespace-pre-wrap break-all border border-border bg-muted/30 p-2 font-mono text-xs text-foreground"
                >
                  {tx.originalLabel}
                </pre>
              </div>
            ) : null}

            <dl className="divide-y divide-border border-y border-border text-sm">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 py-2">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd className={cn("flex items-center gap-1 text-foreground", r.mono && "font-mono")}>
                    {r.value}
                    {r.action}
                  </dd>
                </div>
              ))}
            </dl>

            <p role="status" aria-live="polite" className="sr-only">
              {copied ? t(copied.ok ? "txd_copied" : "txd_copy_failed") : ""}
            </p>

            {total > 1 && index !== null && (
              <nav className="mt-auto flex items-center justify-between gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => go(-1)}
                  disabled={index <= 0}
                  aria-label={t("txd_prev")}
                >
                  <ChevronUp className="size-4" />
                  {t("txd_prev")}
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t("txd_position", { n: index + 1, total })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => go(1)}
                  disabled={index >= total - 1}
                  aria-label={t("txd_next")}
                >
                  {t("txd_next")}
                  <ChevronDown className="size-4" />
                </Button>
              </nav>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
