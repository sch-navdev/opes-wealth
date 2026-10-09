"use client";

import type { ReactNode } from "react";
import { Palette, Plane, Ship } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { useLandingText, type LandingKey } from "@/components/landing-copy";
import { useLanguage } from "@/context/language-context";
import type { TranslationKey } from "@/lib/i18n";

type Tile = {
  id: string;
  icon: ReactNode;
  /** An existing app dictionary key, or a landing key. */
  name: { app: TranslationKey } | { landing: LandingKey };
  desc: LandingKey;
};

const ICON = "size-6";

const TILES: Tile[] = [
  {
    id: "exotic",
    icon: (
      <span className="flex items-center gap-2">
        <Ship className={ICON} />
        <Plane className={ICON} />
      </span>
    ),
    name: { landing: "landing_asset_yachts" },
    desc: "landing_asset_yachts_d",
  },
  { id: "art", icon: <Palette className={ICON} />, name: { landing: "landing_asset_art" }, desc: "landing_asset_art_d" },
  { id: "pe", icon: <CategoryIcon name="Private Equity" className={ICON} />, name: { app: "category_private_equity" }, desc: "landing_asset_pe_d" },
  { id: "scpi", icon: <CategoryIcon name="SCPI" className={ICON} />, name: { landing: "landing_asset_scpi" }, desc: "landing_asset_scpi_d" },
  { id: "av", icon: <CategoryIcon name="Assurance-Vie" className={ICON} />, name: { landing: "landing_asset_av" }, desc: "landing_asset_av_d" },
  { id: "entities", icon: <CategoryIcon name="Companies" className={ICON} />, name: { landing: "landing_asset_entities" }, desc: "landing_asset_entities_d" },
  { id: "re", icon: <CategoryIcon name="Real Estate" className={ICON} />, name: { app: "category_real_estate" }, desc: "landing_asset_re_d" },
  { id: "metals", icon: <CategoryIcon name="Precious Metals" className={ICON} />, name: { app: "category_precious_metals" }, desc: "landing_asset_metals_d" },
];

/** The asset classes a private wealth office holds: eight flat, engraved tiles separated by hairlines. */
export function LandingAssets() {
  const { t } = useLanguage();
  const lt = useLandingText();
  return (
    <section id="assets" aria-labelledby="landing-assets-title" className="scroll-mt-6 border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:px-8 sm:py-28">
        <p className="font-index text-[11px] uppercase tracking-[0.2em] text-primary">{lt("landing_assets_eyebrow")}</p>
        <h2 id="landing-assets-title" className="mt-5 max-w-[22ch] text-balance text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
          {lt("landing_assets_title")}
        </h2>
        <div aria-hidden="true" className="tick-rule mt-8 max-w-xs" />
        <p className="mt-6 max-w-prose text-base text-muted-foreground">{lt("landing_assets_intro")}</p>

        <ul className="mt-12 grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map((tile) => {
            const name = "app" in tile.name ? t(tile.name.app) : lt(tile.name.landing);
            return (
              <li key={tile.id} className="group flex min-w-0 flex-col gap-5 bg-background p-6 transition-colors hover:bg-card focus-within:bg-card sm:p-7">
                <span className="text-primary" aria-hidden="true">{tile.icon}</span>
                <div className="min-w-0">
                  <h3 className="font-index text-[12px] uppercase leading-relaxed tracking-[0.14em] text-foreground">{name}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{lt(tile.desc)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
