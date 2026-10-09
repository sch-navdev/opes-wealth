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
        <section className="landing-field relative isolate overflow-hidden">
          <LandingField />

          <header className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-3 px-6 py-5 sm:px-8">
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

          <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-6 pb-24 pt-44 sm:px-8 sm:pb-32 sm:pt-40 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:pt-36">
            <div>
              <p className="font-index text-[11px] uppercase tracking-[0.2em] text-primary">
                <LT k="landing_tagline_v2" />
              </p>
              <h1 className="mt-5 max-w-[14ch] text-balance text-4xl font-medium tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                <T k="landing_headline" />
              </h1>
              <div aria-hidden="true" className="tick-rule mt-8 max-w-sm" />
              <p className="mt-6 max-w-prose text-lg text-muted-foreground">
                <LT k="landing_body_v2" />
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
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
            <div className="flex justify-center lg:justify-end">
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
