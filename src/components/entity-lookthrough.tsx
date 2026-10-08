"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { entityTypeLabelKey } from "@/components/company-fields";
import { ManageHoldingsDialog } from "@/components/entity-lookthrough-manage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import type { EntityLookthrough, HoldingOption, LookthroughEntity, LookthroughWarning } from "@/lib/entity-lookthrough";
import { PILL_LABEL_KEYS } from "@/lib/portfolio-table-filters";
import { cn } from "@/lib/utils";

type Fmt = (n: number) => string;

function useCategoryLabel() {
  const { t } = useLanguage();
  return (category: string) => {
    const key = PILL_LABEL_KEYS[category];
    return key ? t(key) : category;
  };
}

function EntityNode({
  entity,
  fmt,
  options,
  manageable,
  baseCurrency,
}: {
  entity: LookthroughEntity;
  fmt: Fmt;
  options: HoldingOption[];
  manageable: Set<string>;
  baseCurrency: string;
}) {
  const { t } = useLanguage();
  const categoryLabel = useCategoryLabel();
  const [open, setOpen] = useState(true);
  const bodyId = `ent-body-${entity.id}`;
  const canManage = manageable.has(entity.id);
  const meta = [
    entity.ownershipPercentage != null ? t("company_owns_pct", { pct: entity.ownershipPercentage }) : "",
    entity.viaName ? t("companies_group_via", { name: entity.viaName }) : "",
  ].filter(Boolean);

  return (
    <li className="min-w-0" data-testid={`ent-node-${entity.id}`}>
      <div className="rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <ChevronDown className="size-4 shrink-0 text-muted-foreground rtl:rotate-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{entity.name}</span>
              {meta.length > 0 && <span className="block truncate text-xs text-muted-foreground">{meta.join(" · ")}</span>}
            </span>
          </button>
          <Badge variant="outline">{t(entityTypeLabelKey(entity.entityType))}</Badge>
          <p className="ms-auto text-end text-sm font-semibold tabular-nums text-foreground" aria-label={t("ent_subtotal")}>
            {fmt(entity.subtotal)}
          </p>
        </div>

        <div id={bodyId} hidden={!open} className="space-y-3 border-t border-border p-3 text-sm">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("ent_own_value")}</dt>
              <dd className="tabular-nums text-foreground">{fmt(entity.ownValue)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("ent_holdings_heading")}</dt>
              <dd className="tabular-nums text-foreground">{fmt(entity.holdingsValue)}</dd>
            </div>
          </dl>

          {entity.breakdown.length > 0 && (
            <ul aria-label={t("ent_breakdown_label")} className="flex flex-wrap gap-1.5">
              {entity.breakdown.map((b) => (
                <li key={b.category}>
                  <Badge variant="secondary" className="font-normal">
                    {categoryLabel(b.category)} <span className="tabular-nums">{fmt(b.value)}</span>
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-1">
            <h4 className="text-xs font-medium text-muted-foreground">{t("ent_holdings_heading")}</h4>
            {entity.holdings.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("ent_no_holdings")}</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {entity.holdings.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 p-2">
                    <span className="min-w-0">
                      <Link href={`/dashboard/assets/${h.id}`} className="block truncate font-medium text-foreground hover:underline">
                        {h.name}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">{categoryLabel(h.category)}</span>
                    </span>
                    <span className={cn("shrink-0 tabular-nums", h.value < 0 ? "text-destructive" : "text-foreground")}>{fmt(h.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {entity.possibleDoubleCount && (
            <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-foreground" role="note">
              {t("ent_note_double_count")}
            </p>
          )}

          {canManage ? (
            <ManageHoldingsDialog
              entityId={entity.id}
              entityName={entity.name}
              initialIds={entity.holdings.map((h) => h.id)}
              options={options}
              baseCurrency={baseCurrency}
            />
          ) : (
            <p className="text-xs text-muted-foreground">{t("ent_shared_entity_note")}</p>
          )}

          {entity.children.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground">{t("ent_sub_entities")}</h4>
              <ul className="space-y-2 border-s border-border ps-3">
                {entity.children.map((c) => (
                  <EntityNode key={c.id} entity={c} fmt={fmt} options={options} manageable={manageable} baseCurrency={baseCurrency} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function warningText(w: LookthroughWarning, t: ReturnType<typeof useLanguage>["t"]): string {
  switch (w.kind) {
    case "duplicate_link":
      return t("ent_warn_duplicate", { asset: w.assetName, kept: w.keptEntityName, entity: w.entityName });
    case "missing_link":
      return t("ent_warn_missing", { entity: w.entityName });
    case "company_link":
      return t("ent_warn_company", { asset: w.assetName, entity: w.entityName });
  }
}

/**
 * Look-through of the user's structures: an expandable tree (nested lists with disclosure buttons, so it
 * is keyboard usable and reads in any direction) with the reconciliation line on top. A reporting view:
 * it never changes a value or a total.
 */
export function EntityLookthrough({
  data,
  options,
  manageableEntityIds,
}: {
  data: EntityLookthrough;
  options: HoldingOption[];
  /** Entities whose holdings the caller may change (own, not co-owned). */
  manageableEntityIds: string[];
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const formatter = new Intl.NumberFormat(intlLocale, { style: "currency", currency: data.baseCurrency });
  const fmt: Fmt = (n) => maskValue(formatter.format(n));
  const manageable = new Set(manageableEntityIds);

  return (
    <Card className="border-border bg-card" aria-labelledby="ent-title">
      <CardHeader className="space-y-1">
        <CardTitle id="ent-title" className="text-sm text-foreground">
          {t("ent_title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("ent_subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p
          className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground"
          aria-label={t("ent_rec_aria")}
          data-testid="ent-reconciliation"
        >
          {t("ent_rec_structures")} <strong className="tabular-nums">{fmt(data.heldThroughStructures)}</strong>
          {" + "}
          {t("ent_rec_personal")} <strong className="tabular-nums">{fmt(data.heldPersonally)}</strong>
          {" = "}
          {t("ent_rec_net_worth")} <strong className="tabular-nums">{fmt(data.netWorth)}</strong>
        </p>

        {data.warnings.length > 0 && (
          <div role="status" className="space-y-1 rounded-md border border-border bg-muted/40 p-3 text-xs text-foreground">
            <p className="font-medium">{t("ent_warnings_heading")}</p>
            <ul className="list-disc space-y-1 ps-4">
              {data.warnings.map((w, i) => (
                <li key={`${w.kind}-${w.entityId}-${w.assetId}-${i}`}>{warningText(w, t)}</li>
              ))}
            </ul>
          </div>
        )}

        {data.roots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ent_empty")}</p>
        ) : (
          <ul aria-label={t("ent_tree_label")} className="space-y-2">
            {data.roots.map((e) => (
              <EntityNode key={e.id} entity={e} fmt={fmt} options={options} manageable={manageable} baseCurrency={data.baseCurrency} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
