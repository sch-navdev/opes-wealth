"use client";

import { useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";
import type { OwnerInput } from "@/lib/ownership";

/** One owner line in the form. `percentage` stays a string while typing. */
export type OwnerFormRow = {
  key: string;
  name: string;
  email: string;
  percentage: string;
  isCreator: boolean;
  /** This row is the signed-in user. */
  isYou: boolean;
};

let counter = 0;
export const newOwnerKey = () => `owner-${Date.now().toString(36)}-${counter++}`;

/** A solo owner: the signed-in creator at 100%. */
export const soloOwner = (): OwnerFormRow => ({
  key: newOwnerKey(),
  name: "",
  email: "",
  percentage: "100",
  isCreator: true,
  isYou: true,
});

export const toOwnerInputs = (rows: OwnerFormRow[]): OwnerInput[] =>
  rows.map((r) => ({
    name: r.name,
    email: r.email,
    percentage: Number(r.percentage),
    isCreator: r.isCreator,
  }));

export const ownersTotal = (rows: OwnerFormRow[]) =>
  rows.reduce((sum, r) => sum + (Number.isFinite(Number(r.percentage)) ? Number(r.percentage) : 0), 0);

/**
 * Read-only list of a shared asset's owners for its detail page. The figures on
 * the page are for the WHOLE asset; the dashboard shows the viewer's share.
 */
export function OwnershipSummary({ rows }: { rows: OwnerFormRow[] }) {
  const { t } = useLanguage();
  const mine = rows.find((r) => r.isYou);
  return (
    <div className="space-y-2 border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-primary" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">{t("owners_shared_title")}</p>
      </div>
      <ul className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex justify-between gap-3">
            <span className="truncate text-foreground">
              {r.isYou ? t("owners_you") : r.name || r.email}
              {r.isCreator && <span className="ms-2 text-xs text-muted-foreground">({t("owners_creator")})</span>}
            </span>
            <span className="tabular-nums text-muted-foreground">{r.percentage}%</span>
          </li>
        ))}
      </ul>
      {mine && <p className="text-xs text-muted-foreground">{t("owners_shared_note", { pct: mine.percentage })}</p>}
    </div>
  );
}

/**
 * "Ownership & Co-owners" section of the Add/Edit asset form: the creator plus
 * any number of co-owners (name, email, % share). The total must be exactly
 * 100% — shown live, and re-checked on save by `validateOwners` (client) and
 * the server. Co-owners with an account are linked by email and must approve
 * later edits; the others are invited by email.
 */
export function OwnershipFields({
  value,
  onChange,
  notify,
  onNotifyChange,
}: {
  value: OwnerFormRow[];
  onChange: (next: OwnerFormRow[]) => void;
  /** Email the co-owners (invitation / approval request) when saving. */
  notify: boolean;
  onNotifyChange: (next: boolean) => void;
}) {
  const { t } = useLanguage();
  // On: the creator's share is always what the co-owners leave (100% minus theirs), so
  // adding a co-owner "just works". Off: every share is typed by hand.
  const [auto, setAuto] = useState(true);
  const total = ownersTotal(value);
  const ok = Math.abs(total - 100) <= 0.005;

  /** With auto on, the creator's row takes the remainder. */
  function balanced(rows: OwnerFormRow[]): OwnerFormRow[] {
    if (!auto) return rows;
    const others = rows.filter((r) => !r.isCreator).reduce((sum, r) => sum + (Number(r.percentage) || 0), 0);
    const mine = String(Math.max(0, Math.round((100 - others) * 100) / 100));
    return rows.map((r) => (r.isCreator ? { ...r, percentage: mine } : r));
  }

  function update(key: string, patch: Partial<OwnerFormRow>) {
    onChange(balanced(value.map((r) => (r.key === key ? { ...r, ...patch } : r))));
  }

  function add() {
    // Auto: a new co-owner starts with an equal share of the asset; manual: whatever is unallocated.
    const share = auto
      ? Math.round((100 / (value.length + 1)) * 100) / 100
      : Math.max(0, Math.round((100 - total) * 100) / 100);
    onChange(
      balanced([
        ...value,
        { key: newOwnerKey(), name: "", email: "", percentage: share > 0 ? String(share) : "", isCreator: false, isYou: false },
      ]),
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 border-t border-border pt-6">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-medium text-foreground">{t("owners_title")}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{t("owners_hint")}</p>

      <ul className="space-y-3">
        {value.map((row) => (
          <li key={row.key} className="grid grid-cols-1 gap-3 border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_6rem_auto]">
            {row.isCreator && row.isYou ? (
              <p className="flex items-center text-sm font-medium text-foreground sm:col-span-2">
                {t("owners_you")} <span className="ms-2 text-xs font-normal text-muted-foreground">({t("owners_creator")})</span>
              </p>
            ) : (
              <>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`${row.key}-name`}>{t("owners_name")}</Label>
                  <Input
                    id={`${row.key}-name`}
                    value={row.name}
                    onChange={(e) => update(row.key, { name: e.target.value })}
                    disabled={row.isCreator}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`${row.key}-email`}>{t("owners_email")}</Label>
                  <Input
                    id={`${row.key}-email`}
                    type="email"
                    value={row.email}
                    onChange={(e) => update(row.key, { email: e.target.value })}
                    disabled={row.isCreator}
                  />
                </div>
              </>
            )}
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${row.key}-pct`}>{t("owners_share")}</Label>
              <div className="relative">
                <Input
                  id={`${row.key}-pct`}
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  className="pe-7"
                  value={row.percentage}
                  onChange={(e) => update(row.key, { percentage: e.target.value })}
                  disabled={auto && row.isCreator}
                />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="flex items-end">
              {!row.isCreator && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("owners_remove")}
                  onClick={() => onChange(balanced(value.filter((r) => r.key !== row.key)))}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="size-4" />
          {t("owners_add")}
        </Button>
        <p className={cn("text-sm font-medium tabular-nums", ok ? "text-success" : "text-destructive")} role="status">
          {t("owners_total", { total: Math.round(total * 100) / 100 })}
        </p>
      </div>

      {value.length > 1 && (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 border border-border bg-muted/30 p-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-primary"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              if (e.target.checked) {
                const others = value.filter((r) => !r.isCreator).reduce((sum, r) => sum + (Number(r.percentage) || 0), 0);
                const mine = String(Math.max(0, Math.round((100 - others) * 100) / 100));
                onChange(value.map((r) => (r.isCreator ? { ...r, percentage: mine } : r)));
              }
            }}
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium text-foreground">{t("owners_auto_label")}</span>
            <span className="block text-xs text-muted-foreground">{t("owners_auto_hint")}</span>
          </span>
        </label>
      )}

      {value.length > 1 && (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 border border-border bg-muted/30 p-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-primary"
            checked={notify}
            onChange={(e) => onNotifyChange(e.target.checked)}
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium text-foreground">{t("owners_notify_label")}</span>
            <span className="block text-xs text-muted-foreground">{t("owners_notify_hint")}</span>
          </span>
        </label>
      )}
    </div>
  );
}
