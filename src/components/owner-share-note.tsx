"use client";

import { useLanguage } from "@/context/language-context";
import { formatShareLabel, isPartialShare } from "@/lib/asset-detail-scaling";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * A subtle muted line shown on a co-owned asset's detail page when the viewer owns
 * less than 100%: the figures shown are their share, while edits apply to the
 * whole asset. Renders nothing at 100%. `variant="edit"` is the shorter hint
 * for edit forms ("Values below are for the whole asset").
 */
export function OwnerShareNote({
  factor,
  variant = "note",
  className,
}: {
  factor: number;
  variant?: "note" | "edit";
  className?: string;
}) {
  const { t } = useLanguage();
  if (!isPartialShare(factor)) return null;
  const key: TranslationKey = variant === "edit" ? "owner_share_edit_hint" : "owner_share_note";
  return (
    <p className={cn("text-xs text-muted-foreground", className)} data-testid="owner-share-note">
      {t(key, { pct: formatShareLabel(factor) })}
    </p>
  );
}
