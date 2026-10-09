"use client";

import { useState, useTransition } from "react";
import { refreshFxRatesNow } from "@/app/dashboard/fx-actions";
import { useFxText } from "@/components/fx-text";
import { formatGstStamp, type FxState, type FxStatusView } from "@/lib/fx-history";
import { cn } from "@/lib/utils";

const DOT: Record<FxState, string> = {
  fresh: "bg-emerald-500",
  stale: "bg-amber-500",
  fallback: "bg-orange-600",
  missing: "bg-muted-foreground",
};
const TEXT: Record<FxState, string> = {
  fresh: "text-emerald-700 dark:text-emerald-400",
  stale: "text-amber-700 dark:text-amber-400",
  fallback: "text-orange-700 dark:text-orange-400",
  missing: "text-muted-foreground",
};

/**
 * Readable state of the stored exchange rates (last daily fixing, source, currency count) with a
 * "Refresh now" button. `status` is computed on the server (`loadFxStatus`). While migration 0039 is not
 * applied it says so and the app converts history at today's rate, exactly as before.
 */
export function FxRatesStatus({ status, className }: { status: FxStatusView; className?: string }) {
  const tx = useFxText();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const stamp = status.ranAt ? formatGstStamp(status.ranAt) : null;
  const sourceLabel =
    status.source === "live"
      ? tx("fxr_source_live")
      : status.source === "fallback"
        ? tx("fxr_source_fallback")
        : tx("fxr_source_other", { source: status.source });
  const line =
    stamp && status.state !== "missing"
      ? tx("fxr_updated", { when: stamp, source: sourceLabel, count: status.currencies })
      : tx("fxr_no_run");

  function refresh() {
    setMessage(null);
    start(async () => {
      const r = await refreshFxRatesNow();
      setMessage(
        r.ok
          ? { ok: true, text: tx("fxr_refreshed", { count: r.currencies }) }
          : { ok: false, text: tx(r.error) },
      );
    });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", className)} data-state={status.state}>
      <span className={cn("inline-flex items-center gap-1.5", TEXT[status.state])}>
        <span aria-hidden className={cn("size-2 rounded-full", DOT[status.state])} />
        <span className="font-medium">{tx(`fxr_state_${status.state}`)}</span>
      </span>
      <span className="text-muted-foreground">{line}</span>
      {!status.historyAvailable ? (
        <span className="text-muted-foreground">{tx("fxr_history_unavailable")}</span>
      ) : null}
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="rounded-md border border-border px-2 py-0.5 font-medium text-foreground hover:bg-muted disabled:opacity-60"
      >
        {pending ? tx("fxr_refreshing") : tx("fxr_refresh")}
      </button>
      <span role="status" aria-live="polite" className={message && !message.ok ? "text-destructive" : "text-muted-foreground"}>
        {message?.text ?? ""}
      </span>
    </div>
  );
}
