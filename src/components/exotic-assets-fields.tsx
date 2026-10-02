"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/context/language-context";
import { Palette, Watch, Wine } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EXOTIC_KINDS,
  WATCH_BOX_PAPERS,
  WATCH_CONDITIONS,
  type ExoticAssetMetadata,
  type ExoticKind,
  type WatchBoxPapers,
  type WatchCondition,
} from "@/lib/exotic-assets";
import type { TranslationKey } from "@/lib/i18n";

export const EXOTIC_KIND_KEYS: Record<ExoticKind, TranslationKey> = {
  watch: "exotic_kind_watch",
  wine: "exotic_kind_wine",
  art: "exotic_kind_art",
};

export const EXOTIC_KIND_ICONS = { watch: Watch, wine: Wine, art: Palette } as const;

export const WATCH_CONDITION_KEYS: Record<WatchCondition, TranslationKey> = {
  unworn: "exotic_cond_unworn",
  very_good: "exotic_cond_very_good",
  good: "exotic_cond_good",
  fair: "exotic_cond_fair",
};

export const WATCH_BOX_PAPERS_KEYS: Record<WatchBoxPapers, TranslationKey> = {
  full_set: "exotic_set_full",
  box_only: "exotic_set_box",
  papers_only: "exotic_set_papers",
  none: "exotic_set_none",
};

function toNumberOrNull(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function ExoticAssetsFields({
  value,
  onChange,
}: {
  value: ExoticAssetMetadata;
  onChange: (next: ExoticAssetMetadata) => void;
}) {
  const { t } = useLanguage();

  function set<K extends keyof ExoticAssetMetadata>(key: K, next: ExoticAssetMetadata[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="w-full min-w-0 space-y-4 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-foreground">{t(EXOTIC_KIND_KEYS[value.kind])}</h3>
      <div role="radiogroup" aria-label={t("exotic_kind")} className="grid grid-cols-3 gap-2">
        {EXOTIC_KINDS.map((kind) => {
          const Icon = EXOTIC_KIND_ICONS[kind];
          const active = value.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => set("kind", kind)}
              className={cn(
                "flex flex-col items-center gap-1 border p-3 text-sm transition-colors",
                active ? "border-primary bg-primary/5 text-foreground" : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {t(EXOTIC_KIND_KEYS[kind])}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {t(value.kind === "watch" ? "exotic_value_hint" : "exotic_value_hint_manual")}
      </p>

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        {value.kind === "wine" && (
          <>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="exotic_producer">{t("exotic_producer")}</Label>
              <Input id="exotic_producer" placeholder="Château Margaux" value={value.producer} onChange={(e) => set("producer", e.target.value)} />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="exotic_vintage">{t("exotic_vintage")}</Label>
              <Input id="exotic_vintage" type="number" step="1" placeholder="2015" value={value.vintage ?? ""} onChange={(e) => set("vintage", toNumberOrNull(e.target.value))} />
            </div>
            <div className="min-w-0 space-y-2 sm:col-span-2">
              <Label htmlFor="exotic_region">{t("exotic_region")}</Label>
              <Input id="exotic_region" placeholder="Margaux, Bordeaux" value={value.region} onChange={(e) => set("region", e.target.value)} />
            </div>
          </>
        )}
        {value.kind === "art" && (
          <>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="exotic_artist">{t("exotic_artist")}</Label>
              <Input id="exotic_artist" value={value.artist} onChange={(e) => set("artist", e.target.value)} />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="exotic_title">{t("exotic_title")}</Label>
              <Input id="exotic_title" value={value.title} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="exotic_art_year">{t("exotic_year")}</Label>
              <Input id="exotic_art_year" type="number" step="1" value={value.art_year ?? ""} onChange={(e) => set("art_year", toNumberOrNull(e.target.value))} />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="exotic_medium">{t("exotic_medium")}</Label>
              <Input id="exotic_medium" placeholder={t("exotic_medium_placeholder")} value={value.medium} onChange={(e) => set("medium", e.target.value)} />
            </div>
          </>
        )}
        {value.kind === "watch" && (
        <>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="exotic_brand">{t("exotic_brand")}</Label>
          <Input
            id="exotic_brand"
            placeholder="Rolex"
            value={value.brand}
            onChange={(e) => set("brand", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="exotic_model">{t("exotic_model")}</Label>
          <Input
            id="exotic_model"
            placeholder="Submariner Date"
            value={value.model}
            onChange={(e) => set("model", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="exotic_reference">{t("exotic_reference")}</Label>
          <Input
            id="exotic_reference"
            placeholder="126610LN"
            value={value.reference_number}
            onChange={(e) => set("reference_number", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="exotic_year">{t("exotic_year")}</Label>
          <Input
            id="exotic_year"
            type="number"
            step="1"
            placeholder="2022"
            value={value.year ?? ""}
            onChange={(e) => set("year", toNumberOrNull(e.target.value))}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="exotic_condition">{t("exotic_condition")}</Label>
          <Select
            value={value.condition}
            onValueChange={(next) => set("condition", next as WatchCondition)}
          >
            <SelectTrigger id="exotic_condition" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WATCH_CONDITIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(WATCH_CONDITION_KEYS[c])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="exotic_set">{t("exotic_box_papers")}</Label>
          <Select
            value={value.box_papers}
            onValueChange={(next) => set("box_papers", next as WatchBoxPapers)}
          >
            <SelectTrigger id="exotic_set" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WATCH_BOX_PAPERS.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(WATCH_BOX_PAPERS_KEYS[c])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        </>
        )}
        <div className="min-w-0 space-y-2">
          <Label htmlFor="exotic_purchase_price">{t("exotic_purchase_price")}</Label>
          <Input
            id="exotic_purchase_price"
            type="number"
            step="any"
            min="0"
            value={value.purchase_price ?? ""}
            onChange={(e) => set("purchase_price", toNumberOrNull(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">{t("exotic_price_unit_hint")}</p>
        </div>
        {value.kind !== "wine" && (
          <div className="min-w-0 space-y-2">
            <Label htmlFor="exotic_serial">{t("metal_serial")}</Label>
            <Input
              id="exotic_serial"
              value={value.serial_number}
              onChange={(e) => set("serial_number", e.target.value)}
            />
          </div>
        )}
        <div className="min-w-0 space-y-2 sm:col-span-2">
          <Label htmlFor="exotic_storage">{t("metal_storage")}</Label>
          <Input
            id="exotic_storage"
            placeholder={t("metal_storage_placeholder")}
            value={value.storage_location}
            onChange={(e) => set("storage_location", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
