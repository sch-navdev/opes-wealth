"use client";

import { moneyFormatter } from "@/lib/money-parts";
import { useMemo, useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import { EntityLookthrough } from "@/components/entity-lookthrough";
import { useTx } from "@/components/entity-map-text";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { buildEntityMap } from "@/lib/entity-map";
import { cn } from "@/lib/utils";

// The canvas (and React Flow with it) is a separate chunk, fetched only when "Map" is first chosen.
const EntityMapCanvas = dynamic(() => import("@/components/entity-map-canvas"), {
  ssr: false,
  loading: () => (
    <div
      data-testid="entity-map-skeleton"
      aria-hidden="true"
      className="h-[420px] w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none"
    />
  ),
});

type View = "tree" | "map";

/**
 * Look-through with a view toggle. The tree (accessible, keyboard usable, can manage holdings) is the
 * default; "Map" adds a pan/zoom node map of the same data. Both are derived from the same look-through.
 */
export function EntityLookthroughViews(props: ComponentProps<typeof EntityLookthrough>) {
  const t = useTx();
  const { dir, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const [view, setView] = useState<View>("tree");
  const { data } = props;
  const map = useMemo(() => buildEntityMap(data, { rtl: dir === "rtl" }), [data, dir]);
  const formatter = moneyFormatter(intlLocale, data.baseCurrency);
  const fmt = (n: number) => maskValue(formatter.format(n));

  const option = (v: View, label: string) => (
    <button
      type="button"
      aria-pressed={view === v}
      data-testid={`ent-view-${v}`}
      onClick={() => setView(v)}
      className={cn(
        "rounded-sm px-3 py-1 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div role="group" aria-label={t("ent_map_view_label")} className="inline-flex gap-1 rounded-md border border-border p-1">
        {option("tree", t("ent_map_view_tree"))}
        {option("map", t("ent_map_view_map"))}
      </div>

      {view === "tree" ? (
        <EntityLookthrough {...props} />
      ) : (
        <Card className="border-border bg-card" aria-labelledby="ent-map-title" data-testid="entity-map-card">
          <CardHeader className="space-y-1">
            <CardTitle id="ent-map-title" className="text-sm text-foreground">
              {t("ent_title")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t("ent_map_note")}</p>
          </CardHeader>
          <CardContent className="min-w-0 space-y-3">
            <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground" data-testid="ent-map-reconciliation">
              {t("ent_rec_structures")} <strong className="tabular-nums">{fmt(data.heldThroughStructures)}</strong>
              {" + "}
              {t("ent_rec_personal")} <strong className="tabular-nums">{fmt(data.heldPersonally)}</strong>
              {" = "}
              {t("ent_rec_net_worth")} <strong className="tabular-nums">{fmt(data.netWorth)}</strong>
            </p>
            {map.nodes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("ent_empty")}</p>
            ) : (
              <EntityMapCanvas map={map} baseCurrency={data.baseCurrency} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
