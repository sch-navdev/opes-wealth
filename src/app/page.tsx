import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { ComfortModeToggle } from "@/components/comfort-mode-toggle";
import { T } from "@/components/translated-text";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between px-8 py-6">
        <span className="text-lg font-semibold tracking-tight text-foreground">
          Opes Wealth
        </span>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <ThemeToggle />
          <ComfortModeToggle />
          <Button asChild variant="outline">
            <Link href="/login"><T k="landing_sign_in" /></Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-xl text-center">
          <Image
            src="/logo.png"
            alt="Opes Wealth"
            width={140}
            height={140}
            priority
            className="mx-auto mb-6"
          />
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            <T k="landing_tagline" />
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            <T k="landing_headline" />
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            <T k="landing_body" />
          </p>
          <div className="mt-10">
            <Button asChild size="lg">
              <Link href="/login"><T k="landing_cta" /></Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="px-8 py-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Opes Wealth
      </footer>
    </div>
  );
}
