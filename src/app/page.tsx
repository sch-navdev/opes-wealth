import Image from "next/image";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingAssets } from "@/components/landing-assets";
import { LT } from "@/components/landing-copy";
import { LandingField } from "@/components/landing-field";
import { LandingProof } from "@/components/landing-proof";
import { LandingSpecimen } from "@/components/landing-specimen";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { ComfortModeToggle } from "@/components/comfort-mode-toggle";
import { T } from "@/components/translated-text";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1">
        <section className="landing-field relative isolate flex min-h-[100svh] flex-col justify-center overflow-hidden">
          <LandingField />

          <header className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-3 px-6 py-6 sm:px-10 lg:px-16">
            <span className="flex items-center gap-3 text-lg font-semibold tracking-tight text-foreground">
              <Image src="/logo.png" alt="" width={36} height={36} priority className="size-9" />
              Opes Wealth
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <LanguageSwitcher />
              <ThemeToggle />
              <ComfortModeToggle />
              <Button asChild variant="outline">
                <Link href="/login"><T k="landing_sign_in" /></Link>
              </Button>
            </div>
          </header>

          <div className="mx-auto grid w-full max-w-[1480px] items-center gap-14 px-6 pb-20 pt-40 sm:px-10 sm:pb-24 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20 lg:px-16 lg:pt-32">
            <div>
              <p className="landing-rise font-index text-[11px] uppercase tracking-[0.28em] text-primary" style={{ animationDelay: "60ms" }}>
                <LT k="landing_tagline_v2" />
              </p>
              <h1 className="landing-rise landing-foil mt-6 max-w-[13ch] text-balance text-5xl font-medium leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl xl:text-8xl" style={{ animationDelay: "160ms" }}>
                <T k="landing_headline" />
              </h1>
              <div aria-hidden="true" className="tick-rule landing-rise mt-10 max-w-md" style={{ animationDelay: "260ms" }} />
              <p className="landing-rise mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground lg:text-xl" style={{ animationDelay: "340ms" }}>
                <LT k="landing_body_v2" />
              </p>
              <div className="landing-rise mt-10 flex flex-wrap items-center gap-x-8 gap-y-4" style={{ animationDelay: "440ms" }}>
                <Button asChild size="lg">
                  <Link href="/login"><T k="landing_cta" /></Link>
                </Button>
                <a
                  href="#assets"
                  className="inline-flex items-center gap-2 py-2 text-sm text-foreground underline decoration-primary decoration-1 underline-offset-8 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                  <LT k="landing_secondary" />
                  <ArrowDown className="size-4" aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className="landing-rise landing-float flex justify-center lg:justify-end" style={{ animationDelay: "520ms" }}>
              <LandingSpecimen />
            </div>
          </div>
        </section>

        <LandingAssets />
        <LandingProof />

        <section aria-labelledby="landing-closing-title" className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-6 py-20 sm:px-8 sm:py-28">
            <h2 id="landing-closing-title" className="max-w-[24ch] text-balance text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
              <LT k="landing_closing_title" />
            </h2>
            <p className="max-w-prose text-base text-muted-foreground">
              <LT k="landing_closing_body" />
            </p>
            <Button asChild size="lg">
              <Link href="/login"><T k="landing_cta" /></Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted-foreground sm:px-8">
        <p className="mx-auto max-w-prose"><LT k="landing_disclaimer" /></p>
        <p className="mt-3">&copy; {new Date().getFullYear()} Opes Wealth</p>
      </footer>
    </div>
  );
}
