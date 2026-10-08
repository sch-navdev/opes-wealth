"use client";

import { useMemo, useState, useTransition } from "react";
import { setEntityHeldAssets } from "@/app/dashboard/companies/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import type { HoldingOption } from "@/lib/entity-lookthrough";
import type { TranslationKey } from "@/lib/i18n";
import { PILL_LABEL_KEYS } from "@/lib/portfolio-table-filters";

/**
 * "Manage holdings" for one entity: a searchable checklist of the caller's non-Company assets and
 * liabilities. Saving calls `setEntityHeldAssets`; the result is shown inline (and the page re-renders
 * through the action's revalidation).
 */
export function ManageHoldingsDialog({
  entityId,
  entityName,
  initialIds,
  options,
  baseCurrency,
}: {
  entityId: string;
  entityName: string;
  /** Ids currently kept by this entity. */
  initialIds: string[];
  options: HoldingOption[];
  baseCurrency: string;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialIds));
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const money = useMemo(() => new Intl.NumberFormat(intlLocale, { style: "currency", currency: baseCurrency }), [intlLocale, baseCurrency]);

  const label = (o: HoldingOption) => {
    const key = PILL_LABEL_KEYS[o.category];
    return key ? t(key) : o.category;
  };
  const q = query.trim().toLowerCase();
  const visible = q ? options.filter((o) => o.name.toLowerCase().includes(q) || label(o).toLowerCase().includes(q)) : options;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSelected(new Set(initialIds));
      setQuery("");
      setResult(null);
    }
  }

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function save() {
    setResult(null);
    startTransition(async () => {
      try {
        // Keep the user's existing order, then newly ticked items.
        const ids = [...initialIds.filter((id) => selected.has(id)), ...options.map((o) => o.id).filter((id) => selected.has(id) && !initialIds.includes(id))];
        const res = await setEntityHeldAssets(entityId, ids);
        if (res.ok) {
          setResult({
            ok: true,
            text: res.skipped > 0 ? t("ent_saved_skipped", { name: entityName, n: res.skipped }) : t("ent_saved", { name: entityName }),
          });
        } else {
          setResult({ ok: false, text: t(res.error as TranslationKey) });
        }
      } catch {
        setResult({ ok: false, text: t("ent_err_save_failed") });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label={t("ent_manage_aria", { name: entityName })}>
          {t("ent_manage")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("ent_manage_title", { name: entityName })}</DialogTitle>
          <DialogDescription>{t("ent_manage_desc")}</DialogDescription>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ent_no_assets")}</p>
        ) : (
          <div className="min-w-0 space-y-3">
            <Input
              type="search"
              aria-label={t("ent_search_label")}
              placeholder={t("ent_search_placeholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {t("ent_selected_count", { n: selected.size })}
            </p>
            {visible.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("ent_no_match")}</p>
            ) : (
              <ul aria-label={t("ent_list_label")} className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {visible.map((o) => {
                  const id = `ent-opt-${entityId}-${o.id}`;
                  const otherHolder = o.holder && o.holder.id !== entityId ? o.holder : null;
                  return (
                    <li key={o.id} className="flex items-start gap-3 p-3">
                      <Checkbox id={id} checked={selected.has(o.id)} onCheckedChange={(c) => toggle(o.id, c === true)} className="mt-0.5" />
                      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm">
                        <span className="block truncate font-medium text-foreground">{o.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {label(o)}
                          {otherHolder ? ` · ${t("ent_held_by", { name: otherHolder.name })}` : ""}
                        </span>
                      </label>
                      <span className="shrink-0 text-sm tabular-nums text-foreground">{maskValue(money.format(o.value))}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {result && (
          <p
            role={result.ok ? "status" : "alert"}
            className={`rounded-md border p-2 text-sm ${result.ok ? "border-border bg-muted/40 text-foreground" : "border-destructive/40 bg-destructive/10 text-foreground"}`}
          >
            {result.text}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("close")}
          </Button>
          <Button type="button" onClick={save} disabled={pending || options.length === 0}>
            {pending ? t("saving") : t("ent_save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
