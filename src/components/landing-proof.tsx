"use client";

import { useLandingText, type LandingKey } from "@/components/landing-copy";

const ITEMS: { title: LandingKey; body: LandingKey }[] = [
  { title: "landing_proof_privacy", body: "landing_proof_privacy_d" },
  { title: "landing_proof_auth", body: "landing_proof_auth_d" },
  { title: "landing_proof_coowner", body: "landing_proof_coowner_d" },
  { title: "landing_proof_lang", body: "landing_proof_lang_d" },
  { title: "landing_proof_fx", body: "landing_proof_fx_d" },
];

/** Plain statements about how the product behaves: no certifications, ratings, user counts or quotes. */
export function LandingProof() {
  const lt = useLandingText();
  return (
    <section aria-labelledby="landing-proof-title" className="border-t border-border">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 sm:px-8 sm:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <p className="font-index text-[11px] uppercase tracking-[0.2em] text-primary">{lt("landing_proof_eyebrow")}</p>
          <h2 id="landing-proof-title" className="mt-5 max-w-[16ch] text-balance text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            {lt("landing_proof_title")}
          </h2>
          <div aria-hidden="true" className="tick-rule mt-8 max-w-[14rem]" />
        </div>
        <ol className="divide-y divide-border border-y border-border">
          {ITEMS.map((item, i) => (
            <li key={item.title} className="grid grid-cols-[2.5rem_1fr] gap-x-4 py-6 sm:grid-cols-[3.5rem_1fr]">
              <span aria-hidden="true" className="font-index text-[11px] tracking-[0.18em] text-primary tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-medium tracking-tight text-foreground">{lt(item.title)}</h3>
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">{lt(item.body)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
