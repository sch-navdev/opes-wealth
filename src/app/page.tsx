import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LandingSpecimen } from "@/components/landing-specimen";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { ComfortModeToggle } from "@/components/comfort-mode-toggle";
import { T } from "@/components/translated-text";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 sm:px-8">
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

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-10 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div>
          <p className="font-index text-[11px] uppercase tracking-[0.2em] text-primary">
            <T k="landing_tagline" />
          </p>
          <h1 className="mt-5 max-w-[14ch] text-balance text-4xl font-medium tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            <T k="landing_headline" />
          </h1>
          <div aria-hidden="true" className="tick-rule mt-8 max-w-sm" />
          <p className="mt-6 max-w-prose text-lg text-muted-foreground">
            <T k="landing_body" />
          </p>
          <div className="mt-9">
            <Button asChild size="lg">
              <Link href="/login"><T k="landing_cta" /></Link>
            </Button>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <LandingSpecimen />
        </div>
      </main>

      <footer className="px-8 py-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Opes Wealth
      </footer>
    </div>
  );
}
