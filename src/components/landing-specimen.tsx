"use client";

import { AllocationDial } from "@/components/allocation-dial";
import { CATEGORY_NAME_KEYS } from "@/components/portfolio-groups";
import { useLanguage } from "@/context/language-context";

/** Invented sample portfolio shown on the landing page: never real data. */
const SAMPLE = [
  { category: "Real Estate", share: 58, color: "var(--chart-1)" },
  { category: "Equities", share: 21, color: "var(--chart-2)" },
  { category: "Private Equity", share: 12, color: "var(--chart-3)" },
  { category: "Cash", share: 6, color: "var(--chart-4)" },
  { category: "Vehicles", share: 3, color: "var(--chart-5)" },
] as const;

/**
 * The landing page's product view: the net-worth figure and the allocation dial, the same pieces the
 * dashboard uses, filled with an invented portfolio and labelled as an example.
 */
export function LandingSpecimen() {
  const { t, intlLocale } = useLanguage();
  const number = new Intl.NumberFormat(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [whole, decimals] = number.format(4286410.52).split(/(?=[.,]\d\d$)/);
  const percent = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 });
  return (
    <figure className="card-glow w-full max-w-md border border-border bg-card p-6">
      <figcaption className="flex items-center justify-between gap-3">
        <span className="font-index text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{t("net_worth")}</span>
        <span className="text-xs text-muted-foreground">{t("landing_example_note")}</span>
      </figcaption>
      <p className="mt-3 flex items-baseline gap-2 tabular-nums text-foreground">
        <span className="font-index text-xs uppercase tracking-[0.16em] text-primary">USD</span>
        <span className="text-4xl font-medium tracking-tight">
          {whole}
          <span className="text-2xl opacity-55">{decimals}</span>
        </span>
      </p>
      <div className="tick-rule mt-5" aria-hidden="true" />
      <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
        <AllocationDial
          className="size-36 shrink-0"
          size={144}
          slices={SAMPLE.map((s) => ({ key: s.category, share: s.share, color: s.color }))}
          centerValue={`${percent.format(SAMPLE[0].share)}%`}
          centerLabel={t(CATEGORY_NAME_KEYS[SAMPLE[0].category])}
        />
        <ul className="w-full min-w-0 space-y-2">
          {SAMPLE.map((s) => (
            <li key={s.category} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2 shrink-0" style={{ backgroundColor: s.color }} aria-hidden="true" />
                <span className="truncate text-foreground">{t(CATEGORY_NAME_KEYS[s.category])}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{percent.format(s.share)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
