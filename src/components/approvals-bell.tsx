"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/context/language-context";
import { respondToChangeRequest } from "@/app/dashboard/ownership-actions";
import type { PendingApproval } from "@/lib/shared-assets/server";
import type { TranslationKey } from "@/lib/i18n";

const FIELD_KEYS: Record<string, TranslationKey> = {
  name: "approvals_field_name",
  quantity: "approvals_field_quantity",
  current_value: "approvals_field_value",
  purchase_date: "approvals_field_purchase_date",
  ticker_symbol: "approvals_field_ticker",
  details: "approvals_field_details",
  owners: "approvals_field_owners",
};

/**
 * Header notification for co-ownership: the number of edits to shared assets
 * waiting for the signed-in user, and a panel to accept or reject each one
 * (with what it changes and when it will be applied automatically if nobody
 * answers). Accepting the last outstanding approval applies the edit; any
 * rejection rejects it.
 */
export function ApprovalsBell({ items }: { items: PendingApproval[] }) {
  const { t, intlLocale } = useLanguage();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const date = (iso: string) => new Date(iso).toLocaleDateString(intlLocale);

  function respond(requestId: string, approve: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await respondToChangeRequest(requestId, approve);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label={t("approvals_title")} className="relative">
          <Bell className="size-4" />
          {items.length > 0 && (
            <span className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {items.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,26rem)] space-y-3 border-border bg-popover p-4">
        <p className="text-sm font-medium text-foreground">{t("approvals_title")}</p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("approvals_empty")}</p>
        ) : (
          <ul className="max-h-96 space-y-3 overflow-y-auto">
            {items.map((item) => (
              <li key={item.requestId} className="space-y-2 border border-border bg-card p-3">
                <p className="text-sm text-foreground">
                  {t("approvals_requested", { who: item.requesterName })}{" "}
                  <Link href={`/dashboard/assets/${item.assetId}`} className="font-medium underline">
                    {item.assetName}
                  </Link>
                </p>
                {item.changes.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {item.changes.map((c) => (
                      <li key={c.key}>
                        <span className="font-medium text-foreground">{t(FIELD_KEYS[c.key] ?? "approvals_field_details")}</span>
                        {c.before || c.after ? `: ${c.before ? `${c.before} → ` : ""}${c.after}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">{t("approvals_expires", { date: date(item.expiresAt) })}</p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={isPending} onClick={() => respond(item.requestId, true)}>
                    <Check className="size-4" />
                    {t("approvals_accept")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => respond(item.requestId, false)}>
                    <X className="size-4" />
                    {t("approvals_reject")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
